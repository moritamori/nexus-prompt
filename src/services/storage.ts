import type { AppData, Framework, Prompt, Provider, SnapshotData } from '../types';
import { SecureApiKeyManager } from '../secure-api-key-manager';
import { providersData } from '../data/llm-providers';
import { DEFAULT_FRAMEWORK } from '../data/default-framework';
import { Provider as ProviderData, Model as ModelData } from '../data/types';  
import { v6 as uuidv6 } from 'uuid';

// ストレージキー
export const STORAGE_KEY = 'nexus/appData';
export const SNAPSHOT_STORAGE_KEY = 'nexus/snapshot';

/**
 * データストレージ管理クラス
 */
export class StorageService {
  private apiKeyManager: SecureApiKeyManager;

  constructor() {
    this.apiKeyManager = new SecureApiKeyManager();
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
   * アプリケーションデータを初期化
   * 拡張機能のインストール時またはアップデート時に呼び出されることを想定しています。
   */
  async initializeAppData(): Promise<void> {
    const result = await chrome.storage.local.get([STORAGE_KEY]);
    const existingData = result[STORAGE_KEY] as AppData | undefined;

    if (existingData) {
      // データが既にある場合（アップデートなど）：データのマイグレーション処理
      const { providers: mergedProviders, hasChanged } = await this.mergeProviders(existingData.providers);
      if (hasChanged) {
        existingData.providers = mergedProviders;
        await this.saveAppData(existingData);
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
          language: 'ja',
          version: '1.3.0' // TODO: manifest.jsonから動的に取得する
        }
      };
      await this.saveAppData(defaultData);
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
}

// シングルトンインスタンスをエクスポート
export const storageService = new StorageService();
