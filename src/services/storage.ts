import type { AppData, Framework, Prompt, Provider, SnapshotData } from '../types';
import { SecureApiKeyManager } from '../secure-api-key-manager';
import { providersData } from '../data/llm-providers';
import { DEFAULT_FRAMEWORK } from '../data/default-framework';
import JSZip from 'jszip';
import { FileImportExportService } from './file-import-export';
import { Provider as ProviderData, Model as ModelData } from '../data/types';  
import { v6 as uuidv6 } from 'uuid';
import { CURRENT_SCHEMA_VERSION } from '../types';

// ストレージキー
export const STORAGE_KEY = 'nexus/appData';
export const SNAPSHOT_STORAGE_KEY = 'nexus/snapshot';
export const SCHEMA_VERSION_KEY = 'nexus/schemaVersion';

// マイグレーション関数型: ある版から次の版へ AppData を変換
type Migration = (data: AppData, snapshotData: SnapshotData) => Promise<{ appData: AppData, snapshotData: SnapshotData }> | { appData: AppData, snapshotData: SnapshotData };

// 0 -> 1 の最小ノーオペマイグレーション（将来ここに実処理を追加）
const MIGRATIONS: Migration[] = [
  async (data, snapshotData) => { return { appData: data, snapshotData: snapshotData }; },
];

/**
 * データストレージ管理クラス
 */
export class StorageService {
  private apiKeyManager: SecureApiKeyManager;

  constructor() {
    this.apiKeyManager = new SecureApiKeyManager();
  }

  /**
   * 保存済みのスキーマ版を取得（未設定の場合は 0 を返す）
   */
  private async getStoredSchemaVersion(): Promise<number> {
    const result = await chrome.storage.local.get([SCHEMA_VERSION_KEY]);
    const v = result[SCHEMA_VERSION_KEY];
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
  }

  /**
   * 現在のスキーマ版を保存
   */
  private async setStoredSchemaVersion(v: number): Promise<void> {
    await chrome.storage.local.set({ [SCHEMA_VERSION_KEY]: v });
  }

  /**
   * 渡された AppData, SnapshotData に対して未適用のマイグレーションを順に実行し、
   * 保存データとスキーマ版を更新する。
   * @returns マイグレーション後の AppData, SnapshotData
   */
  private async runMigrations(appData: AppData, snapshotData: SnapshotData): Promise<AppData> {
    let currentVersion = await this.getStoredSchemaVersion();
    let workingAppData = appData;
    let workingSnapshotData = snapshotData;

    while (currentVersion < CURRENT_SCHEMA_VERSION) {
      const migrate = MIGRATIONS[currentVersion];
      if (typeof migrate !== 'function') {
        // 定義が無い場合は安全側でスキップし、現行版にアジャスト
        currentVersion = CURRENT_SCHEMA_VERSION;
        break;
      }
      const { appData, snapshotData } = await migrate(workingAppData, workingSnapshotData);
      workingAppData = appData;
      workingSnapshotData = snapshotData;
      await this.saveAppData(workingAppData);
      await this.saveSnapshot(workingSnapshotData);
      currentVersion += 1;
      await this.setStoredSchemaVersion(currentVersion);
    }

    return workingAppData;
  }

  /**
   * アプリケーションデータを取得
   */
  async getAppData(): Promise<AppData> {
    const result = await chrome.storage.local.get([STORAGE_KEY]);
    if (result[STORAGE_KEY]) {
      const data = result[STORAGE_KEY] as AppData;
      return data;
    } else {
      // onInstalledで初期化されるため、通常このパスは通りません。
      // 通った場合は予期せぬ状態なのでエラーをスローします。
      throw new Error('アプリケーションデータが見つかりません。拡張機能の再読み込みや再インストールをお試しください。');
    }
  }

  /**
   * データを初期化
   * 拡張機能のインストール時またはアップデート時に呼び出されることを想定しています。
   */
  async initializeData(): Promise<void> {
    const result = await chrome.storage.local.get([STORAGE_KEY]);
    const existingAppData = result[STORAGE_KEY] as AppData | undefined;
    const result2 = await chrome.storage.local.get([SNAPSHOT_STORAGE_KEY]);
    const existingSnapshotData = result2[SNAPSHOT_STORAGE_KEY] as SnapshotData | undefined;

    if (existingAppData && existingSnapshotData) {
      const migrated: AppData = await this.runMigrations(existingAppData, existingSnapshotData);
      const { providers: mergedProviders, hasChanged } = await this.mergeProviders(migrated.providers);
      if (hasChanged) {
        migrated.providers = mergedProviders;
        await this.saveAppData(migrated);
      }
    } else {
      // データが存在しない場合（初回インストール）：初期データを作成
      const providers = await this.loadProviders();
      const frameworkId = uuidv6().toString();
      const defaultData: AppData = {
        providers,
        prompts: [],
        frameworks: [{
          id: frameworkId,
          content: {
            version: 2,
            id: frameworkId,
            slug: 'default-framework',
            name: 'デフォルトフレームワーク',
            content: DEFAULT_FRAMEWORK,
          },
          order: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }],
        settings: {
          defaultFrameworkId: frameworkId,
          initialized: false,
          language: 'ja',
          version: '1.3.3' // TODO: manifest.jsonから動的に取得する
        }
      };
      const defaultSnapshot: SnapshotData = {
        promptPlayground: { selectedPromptId: '', userPrompt: '', inputKeyValues: {} },
        promptImprovement: { userPrompt: '', selectedPromptId: '', resultArea: '', selectedModelId: '' },
        editPrompt: { id: null },
        activeTab: 'main',
        activeScreen: null
      };
      await this.saveAppData(defaultData);
      await this.saveSnapshot(defaultSnapshot);
      await this.setStoredSchemaVersion(CURRENT_SCHEMA_VERSION);
    }
  }

  /**
   * プロバイダー情報をデータから読み込む
   */
  private async loadProviders(): Promise<Provider[]> {
    return providersData.providers.map((provider: ProviderData) => ({
      id: uuidv6().toString(),
      name: provider.name,
      displayName: provider.displayName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      models: provider.models.map((model: ModelData, index: number) => ({
        id: uuidv6().toString(),
        name: model.name,
        order: index + 1,
        enabled: true,
        isBuiltIn: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }))
    }));
  }
 
  /**
   * ユーザーのプロバイダー情報とマスターデータをマージする
   * @param userProviders ユーザーが現在保存しているプロバイダー情報
   * @returns マージ後のプロバイダー情報と、変更があったかどうかのフラグ
   */
  private async mergeProviders(userProviders: Provider[]): Promise<{ providers: Provider[], hasChanged: boolean }> {
    const sourceProvidersData = providersData.providers;
    let hasChanged = false;

    const userProvidersMap = new Map<string, Provider>(userProviders.map(p => [p.name, p]));

    for (const sourceProvider of sourceProvidersData) {
      const existingProvider = userProvidersMap.get(sourceProvider.name);

      if (!existingProvider) {
        // 新しいプロバイダーを追加
        userProviders.push({
          id: uuidv6().toString(),
          name: sourceProvider.name,
          displayName: sourceProvider.displayName,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          models: sourceProvider.models.map((model: ModelData, index: number) => ({
            id: uuidv6().toString(),
            name: model.name,
            order: index + 1,
            enabled: true,
            isBuiltIn: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          })),
        });
        hasChanged = true;
      } else {
        // 既存プロバイダーに新しいモデルがないかチェック
        const existingModelsMap = new Map<string, ModelData>(existingProvider.models.map(m => [m.name, m]));
        for (const sourceModel of sourceProvider.models) {
          if (!existingModelsMap.has(sourceModel.name)) {
            existingProvider.models.push({
              id: uuidv6().toString(),
              name: sourceModel.name,
              order: existingProvider.models.length + 1,
              enabled: true,
              isBuiltIn: true,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            });
            hasChanged = true;
          }
        }
      }
    }

    return { providers: userProviders, hasChanged };
  }

  /**
   * アプリケーションデータを保存
   */
  async saveAppData(data: AppData): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEY]: data });
  }

  /**
   * APIキーを取得（復号化）
   */
  async getApiKey(provider: string): Promise<string | null> {
    return await this.apiKeyManager.getApiKey(provider);
  }

  /**
   * APIキーを設定（暗号化）
   */
  async setApiKey(provider: string, apiKey: string): Promise<boolean> {
    return await this.apiKeyManager.saveApiKey(provider, apiKey);
  }

  /**
   * デフォルトフレームワークを取得
   */
  async getDefaultFramework(): Promise<Framework | null> {
    const data = await this.getAppData();
    const defaultFramework = data.frameworks.find(f => f.id === data.settings.defaultFrameworkId);
    return defaultFramework || data.frameworks[0] || null;
  }

  /**
   * プロンプトを取得
   */
  async getPrompts(): Promise<Prompt[]> {
    const data = await this.getAppData();
    return data.prompts || [];
  }

  /**
   * 指定されたコレクションにアイテムを保存（更新または追加）する共通メソッド
   * @param collectionName 保存先のコレクション名 ('frameworks' または 'prompts')
   * @param item 保存するアイテム（idプロパティを持つ必要がある）
   */
  private async saveItem<T extends { id: string }>(
    collectionName: 'frameworks' | 'prompts',
    item: T
  ): Promise<void> {
    const data = await this.getAppData();
    const collection = data[collectionName] as unknown as T[];
    const index = collection.findIndex(i => i.id === item.id);

    if (index !== -1) {
      collection[index] = item;
    } else {
      collection.push(item);
    }

    await this.saveAppData(data);
  }

  /**
   * フレームワークを保存
   */
  async saveFramework(framework: Framework): Promise<void> {
    await this.saveItem('frameworks', framework);
  }

  /**
   * プロンプトを保存
   */
  async savePrompt(prompt: Prompt): Promise<void> {
    await this.saveItem('prompts', prompt);
  }

  /**
   * プロンプトを削除
   */
  async deletePrompt(promptId: string): Promise<void> {
    const data = await this.getAppData();
    const beforeLength = data.prompts.length;
    const filtered = data.prompts.filter(p => p.id !== promptId);
    // 削除対象が存在する場合のみ保存を実行
    if (filtered.length !== beforeLength) {
      data.prompts = filtered;
      await this.saveAppData(data);
    }
  }

  /**
  * スナップショットデータを保存
  */
  async saveSnapshot(data: SnapshotData): Promise<void> {
    await chrome.storage.local.set({ [SNAPSHOT_STORAGE_KEY]: data });
  }

  /**
   * スナップショットデータを取得
   */
  async getSnapshot(): Promise<SnapshotData> {
    const result = await chrome.storage.local.get([SNAPSHOT_STORAGE_KEY]);
    const existing = result[SNAPSHOT_STORAGE_KEY] as SnapshotData | undefined;
    if (existing) {
      return existing;
    }
    // デフォルトのスナップショットを初期化して保存
    const defaultSnapshot: SnapshotData = {
      promptPlayground: {
        userPrompt: '',
        selectedPromptId: '',
        inputKeyValues: {},
      },
     promptImprovement: {
        userPrompt: '',
        selectedPromptId: '',
        resultArea: '',
        selectedModelId: '',
      },
      editPrompt: { id: '' },
      activeTab: 'main',
      activeScreen: null,
    };
    await this.saveSnapshot(defaultSnapshot);
    return defaultSnapshot;
  }

  async saveEditPrompt(id: string | null): Promise<void> {
    const data = await this.getSnapshot();
    data.editPrompt = { id };
    await this.saveSnapshot(data);
  }

  async saveActiveTab(tab: 'main' | 'prompt-improvement' | 'prompts' | 'settings'): Promise<void> {
    const data = await this.getSnapshot();
    data.activeTab = tab;
    await this.saveSnapshot(data);
  }

  async clearActiveTab(): Promise<void> {
    const data = await this.getSnapshot();
    data.activeTab = 'main';
    await this.saveSnapshot(data);
  }

  async initializePrompts(): Promise<void> {
    const fileImportExportService = new FileImportExportService();
    const url = chrome.runtime.getURL("nexus-prompt.zip");
    const res = await fetch(url);
    const buf = new Uint8Array(await res.arrayBuffer());
    const zip = await JSZip.loadAsync(buf);
    await fileImportExportService.importFromZip(zip, 'free');
    await this.setInitialized(true);
  }

  async getInitialized(): Promise<boolean> {
    const data = await this.getAppData();
    return data.settings.initialized;
  }

  async setInitialized(initialized: boolean): Promise<void> {
    const data = await this.getAppData();
    data.settings.initialized = initialized;
    await this.saveAppData(data);
  }
}

// シングルトンインスタンスをエクスポート
export const storageService = new StorageService();
