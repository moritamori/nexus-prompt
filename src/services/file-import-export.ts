import type { AppData, Framework, Prompt } from '../types';
import { storageService, StorageService } from './storage';
import type { Plan } from '../stores';
import JSZip from 'jszip';
import { dumpYamlStable } from '../promptops/dsl/serializer';
import { parseFramework } from '../promptops/dsl/framework/registry';
import { parsePrompt } from '../promptops/dsl/prompt/registry';
import { parseFrontMatter } from '../promptops/dsl/parser';
import { UuidV1toV6 } from '../promptops/dsl/schema-common';

export const APP_PROMPTS_JSON_FILE_NAME = 'app-prompts.json';

// アプリケーションデータのインポート・エクスポートを管理するサービスクラス
export class FileImportExportService {
  private storage: StorageService = storageService;

  /**
   * アプリケーションデータをMarkdown(Front-matter + Body)のZIPにエクスポートします。
   * - frameworks: `framework-<id>.md`（Front-matter: Framework DSL、本文: content）
   * - prompts: `<id>.md`（Front-matter: Prompt DSL、本文: template）
   * providers と settings は現状含めません（機微情報保護）。
   * @returns {Promise<Uint8Array>} ZIPバイト列
   */
  async export(ids: Array<string> = []): Promise<Uint8Array> {
    const appData = await this.storage.getAppData();

    const isDiff = ids.length > 0;
    const zip = new JSZip();

    const buildFrontMatterMd = (body: string, data: Record<string, unknown>): string => {
      const yaml = dumpYamlStable(data);
      return `---\n${yaml}---\n${body ?? ''}`;
    };

    if (!isDiff) {
      for (const fw of appData.frameworks) {
        const { content, ...frontMatter } = fw.content;
        const fileName = `framework-${fw.id}.md`;
        const markdown = buildFrontMatterMd(content ?? '', frontMatter);
        zip.file(fileName, markdown);
      }
    }

    for (const p of appData.prompts) {
      if (isDiff && !ids.includes(p.id)) {
        continue;
      }
      const { template, ...frontMatter } = p.content;
      const fileName = `${p.id}.md`;
      const markdown = buildFrontMatterMd(template ?? '', frontMatter);
      zip.file(fileName, markdown);
    }

    // PromptMeta の生成方法を isDiff に応じて切り替える
    // - isDiff=true の場合: p.order の昇順に並べ、1,2,3... と連番で採番
    // - isDiff=false の場合: 既存の p.order をそのまま使用
    const promptsMeta = (() => {
      if (isDiff) {
        const selected = appData.prompts
          .filter((p) => ids.includes(p.id))
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        return selected.map((p, idx) => ({ id: p.id, order: idx + 1, shared: p.shared }));
      }
      return appData.prompts.map((p) => ({ id: p.id, order: p.order, shared: p.shared }));
    })();
    zip.file(APP_PROMPTS_JSON_FILE_NAME, JSON.stringify(promptsMeta, null, 2));

    const zipData = await zip.generateAsync({ type: 'uint8array' });
    return zipData;
  }

  /**
   * エクスポートフォーマットに合わせたインポート機能。
   * - 期待するZIP構造（ルート直下）:
   *   - `framework-*.md` … Framework（Front-matter: DSL、本文: content）
   *   - `*.md`（ただし `framework-*.md` を除く）… Prompt（Front-matter: DSL、本文: template）
   */
  async import(input: ArrayBuffer | Uint8Array, plan: Plan, isDiff: boolean = false): Promise<void> {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(bytes);
    } catch (e) {
      throw new Error('インポートファイルの形式が正しくありません。');
    }
    await this.importFromZip(zip, plan, isDiff);
  }

  async importFromZip(zip: JSZip, plan: Plan, isDiff: boolean = false): Promise<void> {
    const frameworks: Framework[] = [];

    const currentAppData = await this.storage.getAppData();
    const prompts: Prompt[] = isDiff ? currentAppData.prompts : [];

    const nowIso = new Date().toISOString();

    const isUuid = (s: string): boolean => UuidV1toV6.safeParse(s).success === true;
    const baseName = (p: string): string => p.split('/').pop() ?? p;

    // ルート直下の framework-*.md を処理（ファイル名昇順）
    let defaultFrameworkId = '';
    if (!isDiff) {
      const fwFiles = Object.keys(zip.files)
        .filter((p) => {
          const b = baseName(p);
          const m = b.match(/^framework-(.+)\.md$/i);
          return !!(m && isUuid(m[1]));
        })
        .sort((a, b) => b.localeCompare(a, 'en', { numeric: true, sensitivity: 'base' }));
      const seenFrameworkIds = new Set<string>();
      for (const path of fwFiles) {
        const file = zip.file(path);
        if (!file) continue;
        try {
          const markdown = await file.async('string');
          const parsed = parseFrontMatter(markdown);
          if (!parsed) continue;

          // フロントマターと本文を結合し、DSLパーサーで検証・マイグレーション
          const rawContent = { ...parsed.data, content: parsed.body };
          const frameworkContent = parseFramework(rawContent);
          const frameworkId = frameworkContent.id;

          if (seenFrameworkIds.has(frameworkId)) {
            continue;
          }
          seenFrameworkIds.add(frameworkId);
          defaultFrameworkId = frameworkId;
          frameworks.push({
            id: frameworkId,
            content: frameworkContent,
            order: frameworks.length + 1,
            createdAt: nowIso,
            updatedAt: nowIso,
          });
        } catch (e) {
          console.warn(`Skipping invalid framework file ${path}:`, e);
        }
      }
    }

    // デフォルトフレームワークが指定されていない場合は、現在のデフォルトフレームワークを使用
    if (defaultFrameworkId === '') {
      defaultFrameworkId = currentAppData.settings.defaultFrameworkId;
    }

    // ルート直下の *.md のうち、framework- ではなく prompt- または <uuid>.md の場合は prompt として処理（ファイル名昇順）
    {
      const prFiles = Object.keys(zip.files)
        .filter((p) => {
          const b = baseName(p);
          // framework-*.md は対象外
          if (/^framework-.*\.md$/i.test(b)) return false;
          // prompt-<uuid>.md の <uuid> がUUIDの場合
          const mPrompt = b.match(/^prompt-(.+)\.md$/i);
          if (mPrompt && isUuid(mPrompt[1])) return true;
          // <uuid>.md の <uuid> がUUIDの場合
          const mSimple = b.match(/^(.+)\.md$/i);
          if (mSimple && isUuid(mSimple[1])) return true;
          return false;
        })
        .sort((a, b) => b.localeCompare(a, 'en', { numeric: true, sensitivity: 'base' }));

      if (plan === 'free' && prFiles.length > 20) {
        throw new Error('無料プランでは20個より多くプロンプトをインポートできません。');
      }

      // まずは全ての Prompt ファイルを読み取り、重複を排除した上で内容を確定
      const seenPromptIds = new Set<string>();
      const importedPromptEntries: { id: string; content: Prompt['content'] }[] = [];
      for (const path of prFiles) {
        const file = zip.file(path);
        if (!file) continue;
        try {
          const markdown = await file.async('string');
          const parsed = parseFrontMatter(markdown);
          if (!parsed) continue;

          // フロントマターと本文を結合し、DSLパーサーで検証・マイグレーション
          const rawContent = { ...parsed.data, template: parsed.body, frameworkRef: defaultFrameworkId };
          const promptContent = parsePrompt(rawContent);
          const promptId = promptContent.id;

          if (seenPromptIds.has(promptId)) {
            continue;
          }
          seenPromptIds.add(promptId);

          // isDiff=true の場合、既存の prompts に同一IDがあるものはスキップ
          if (isDiff && prompts.some((p) => p.id === promptId)) {
            continue;
          }

          importedPromptEntries.push({ id: promptId, content: promptContent });
        } catch (e) {
          console.warn(`Skipping invalid prompt file ${path}:`, e);
        }
      }

      // app-prompts.json が存在する場合は、そこで指定された order / shared を適用
      const metaFile = zip.file(APP_PROMPTS_JSON_FILE_NAME);
      if (metaFile) {
        try {
          const text = await metaFile.async('string');
          const metaArr = JSON.parse(text) as Array<{ id: string; order: number; shared: boolean }>;
          const metaMap = new Map<string, { order: number; shared: boolean }>();
          const list = Array.isArray(metaArr) ? metaArr : [];
          if (isDiff) {
            // isDiff=true の場合: metaArr.order で並び替えた上で 1,2,3... と連番を採番
            const sorted = [...list].sort((a, b) => (a?.order ?? 0) - (b?.order ?? 0));
            let idx = 0;
            for (const m of sorted) {
              metaMap.set(m.id, { order: ++idx, shared: !!m.shared });
            }
          } else {
            // isDiff=false の場合: metaArr.order をそのまま使用
            for (const m of list) {
              metaMap.set(m.id, { order: m.order, shared: !!m.shared });
            }
          }

          // 既存側の最大 order（isDiff=true のときのみオフセットとして利用）
          const baseOrderOffset = isDiff
            ? prompts.reduce((max, p) => Math.max(max, (p.order ?? 0)), 0)
            : 0;

          // metaMap に存在するインポート対象の最大 order を求める
          let maxOrderInMeta = 0;
          for (const { id } of importedPromptEntries) {
            const meta = metaMap.get(id);
            if (meta && typeof meta.order === 'number' && Number.isFinite(meta.order)) {
              maxOrderInMeta = Math.max(maxOrderInMeta, meta.order);
            }
          }

          // JSON にあるものはその order/shared を使用、無いものは末尾に追加
          let nextOrder = maxOrderInMeta;
          for (const entry of importedPromptEntries) {
            const meta = metaMap.get(entry.id);
            const withinDiffOrder = meta ? meta.order : (nextOrder += 1);
            const order = isDiff ? baseOrderOffset + withinDiffOrder : withinDiffOrder;
            const shared = meta ? meta.shared : true;
            prompts.push({
              id: entry.id,
              content: entry.content,
              order,
              shared,
              createdAt: nowIso,
              updatedAt: nowIso,
            });
          }
        } catch (e) {
          console.warn('Failed to parse app-prompts.json. Falling back to filename order.', e);
          // JSON が不正な場合は従来のファイル名ベースの順で order を付与
          let idx = prompts.length;
          for (const entry of importedPromptEntries) {
            prompts.push({
              id: entry.id,
              content: entry.content,
              order: ++idx,
              shared: true,
              createdAt: nowIso,
              updatedAt: nowIso,
            });
          }
        }
      } else {
        // app-prompts.json が存在しない場合は、ファイル名ベースの順で order を付与
        let idx = prompts.length;
        for (const entry of importedPromptEntries) {
          prompts.push({
            id: entry.id,
            content: entry.content,
            order: ++idx,
            shared: true,
            createdAt: nowIso,
            updatedAt: nowIso,
          });
        }
      }
    }

    const newAppData: AppData = {
      ...currentAppData,
      ...(frameworks.length > 0 ? { frameworks } : {}),
      prompts,
      settings: {
        ...currentAppData.settings,
        ...(defaultFrameworkId ? { defaultFrameworkId } : {}),
      }
    };
    await this.storage.saveAppData(newAppData);

    const snapshot = await this.storage.getSnapshot();
    if (snapshot) {
      snapshot.promptPlayground = { ...snapshot.promptPlayground, selectedPromptId: '' };
      snapshot.promptImprovement = { ...snapshot.promptImprovement, selectedPromptId: '' };
      await this.storage.saveSnapshot(snapshot);
    }
    return;
  }
}
