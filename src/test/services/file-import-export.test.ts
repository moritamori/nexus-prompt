import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FileImportExportService } from '../../services/file-import-export';
import type { AppData, SnapshotData } from '../../types';
import { createMockAppData, createMockFramework, createMockPrompt, createMockSnapshotData } from '../test-utils/factories';
import JSZip from 'jszip';
import { v6 as uuidv6 } from 'uuid';
import { webcrypto as nodeWebCrypto } from 'crypto';
import { dumpYamlStable } from '../../promptops/dsl/serializer';
import { APP_PROMPTS_JSON_FILE_NAME } from '../../services/file-import-export';

// StorageServiceのモック関数を作成
const mockGetAppData = vi.hoisted(() => vi.fn());
const mockSaveAppData = vi.hoisted(() => vi.fn());
const mockGetSnapshot = vi.hoisted(() => vi.fn());
const mockSaveSnapshot = vi.hoisted(() => vi.fn());

// StorageServiceのモック
vi.mock('../../services/storage', () => ({
  StorageService: vi.fn().mockImplementation(() => ({
    getAppData: mockGetAppData,
    saveAppData: mockSaveAppData,
    getSnapshot: mockGetSnapshot,
    saveSnapshot: mockSaveSnapshot,
  })),
  storageService: {
    getAppData: mockGetAppData,
    saveAppData: mockSaveAppData,
    getSnapshot: mockGetSnapshot,
    saveSnapshot: mockSaveSnapshot,
  },
}));

// crypto のセットアップ: uuid が利用する getRandomValues を提供
const mockRandomUUID = vi.hoisted(() => vi.fn());
Object.defineProperty(globalThis, 'crypto', {
  value: {
    getRandomValues: (<T extends ArrayBufferView>(arr: T): T =>
      nodeWebCrypto.getRandomValues(arr as unknown as any) as unknown as T
    ),
    subtle: nodeWebCrypto.subtle,
    randomUUID: mockRandomUUID,
  },
  writable: true,
});

describe('FileImportExportService', () => {
  let importExportService: FileImportExportService;

  beforeEach(() => {
    // モックのリセット
    vi.clearAllMocks();
    
    // デフォルトのモック実装
    mockGetAppData.mockResolvedValue(createMockAppData());
    mockSaveAppData.mockResolvedValue(undefined);
    mockGetSnapshot.mockResolvedValue(createMockSnapshotData());
    mockSaveSnapshot.mockResolvedValue(undefined);
    mockRandomUUID.mockReturnValue('new-uuid');

    // 現在時刻のモック
    vi.setSystemTime(new Date('2023-12-01T00:00:00.000Z'));

    importExportService = new FileImportExportService();
  });

  describe('export', () => {
    it('フレームワークデータをZIP形式でエクスポートする', async () => {
      const frameworkId = uuidv6();
      const promptId = uuidv6();
      const testFramework = createMockFramework({ id: frameworkId });
      const testPrompt = createMockPrompt({ id: promptId, content: {
        ...createMockPrompt().content,
        frameworkRef: frameworkId,
      } });
      const testAppData = createMockAppData({
        frameworks: [testFramework],
        prompts: [testPrompt],
      });

      mockGetAppData.mockResolvedValue(testAppData);

      const result = await importExportService.export();
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.byteLength).toBeGreaterThan(0);

      const zip = await JSZip.loadAsync(result);
      // フレームワークファイルの内容をチェック
      const framework = zip.file(`framework-${testFramework.id}.md`);
      expect(framework).toBeDefined();
      const frameworkMarkdown = await framework?.async('string');
      expect(frameworkMarkdown).toBe(
        `---\n`+
        `version: 2\n`+
        `id: ${testFramework.id}\n`+
        `name: ${testFramework.content.name}\n`+
        `---\n`+
        testFramework.content.content
      );

      // プロンプトファイルの内容をチェック
      const prompt = zip.file(`${testPrompt.id}.md`);
      expect(prompt).toBeDefined();
      const promptMarkdown = await prompt?.async('string');
      expect(promptMarkdown).toBe(
        `---\n`+
        `version: 2\n`+
        `id: ${testPrompt.id}\n`+
        `name: ${testPrompt.content.name}\n`+
        `inputs: []\n`+
        `frameworkRef: ${frameworkId}\n`+
        `---\n`+
        testPrompt.content.template
      );

      // app-prompts.json の内容をチェック
      const appPromptsJson = zip.file(APP_PROMPTS_JSON_FILE_NAME);
      expect(appPromptsJson).toBeDefined();
      const appPromptsJsonText = await appPromptsJson?.async('string');
      expect(appPromptsJsonText).toBe(
        JSON.stringify(testAppData.prompts.map((p) => (
          { id: p.id, order: p.order, shared: p.shared }
        )), null, 2));
    });

    it('getAppDataがエラーをスローした場合、エラーが伝播する', async () => {
      const storageError = new Error('ストレージ取得失敗');
      mockGetAppData.mockRejectedValue(storageError);

      await expect(importExportService.export()).rejects.toThrow(
        storageError
      );
    });
  });

  describe('import', () => {
    let zip: JSZip;
    const frameworkId = uuidv6();
    const promptId = uuidv6();
    let fmFramework: Record<string, unknown>;
    let fmPrompt: Record<string, unknown>;

    beforeEach(() => {
      // モックのリセット
      vi.clearAllMocks();

      zip = new JSZip();
      // ZIPを生成（framework と prompt のフロントマターJSON+本文）
      {
        fmFramework = {
          id: frameworkId,
          name: 'インポートされたフレームワーク',
          version: 2,
          content: 'インポート用フレームワーク内容',
        } as Record<string, unknown>;
        fmPrompt = {
          version: 2,
          id: promptId,
          name: 'インポートされたプロンプト',
          template: 'テンプレート',
          inputs: [],
        } as Record<string, unknown>;
        const buildFrontMatterMd = (body: string, data: Record<string, unknown>): string => {
          const yaml = dumpYamlStable(data);
          return `---\n${yaml}---\n${body ?? ''}`;
        };
        const { content: frameworkContent, ...frameworkFrontMatter } = fmFramework;
        zip.file(`framework-${fmFramework.id}.md`, buildFrontMatterMd(frameworkContent as string, frameworkFrontMatter));
        const { template: promptTemplate, ...promptFrontMatter } = fmPrompt;
        zip.file(`prompt-${fmPrompt.id}.md`, buildFrontMatterMd(promptTemplate as string, promptFrontMatter));
      }
    });

    const toArrayBuffer = (u8: Uint8Array) => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
    const readZipFixtureOrGenerate = async (): Promise<ArrayBuffer> => {
      let bytes = await zip.generateAsync({ type: 'uint8array' });
      let ok = true;
      try {
        await JSZip.loadAsync(bytes);
      } catch {
        ok = false;
      }
      if (!ok || bytes.byteLength === 0) {
        mockGetAppData.mockResolvedValue(createMockAppData());
        const generated = await importExportService.export();
        bytes = Buffer.from(generated);
      }
      return toArrayBuffer(bytes);
    };

    it.each<[
      string,
      'none' | 'valid' | 'invalid',
      Partial<ReturnType<typeof createMockPrompt>>
    ]>([
      ['app-prompts.json が存在しない場合', 'none', { order: 1, shared: true }],
      ['app-prompts.json が存在する場合', 'valid', { order: 2, shared: false }],
      ['app-prompts.json が壊れている場合', 'invalid', { order: 1, shared: true }],
    ])('ZIP形式のデータをインポートする(%s)', async (_title, metaFileType, expectedPromptOverrides) => {
      if (metaFileType === 'valid') {
        // app-prompts.json を付与
        zip.file(
          APP_PROMPTS_JSON_FILE_NAME,
          JSON.stringify([{ id: fmPrompt.id, order: 2, shared: false }], null, 2)
        );
      } else if (metaFileType === 'invalid') {
        // 壊れた JSON を格納
        zip.file(APP_PROMPTS_JSON_FILE_NAME, '{ invalid json }');
      }

      const currentAppData = createMockAppData({
        frameworks: [createMockFramework({ id: frameworkId, content: {
          ...createMockFramework().content,
          name: 'インポートされたフレームワーク',
          content: 'インポート用フレームワーク内容',
        } })],
        prompts: [createMockPrompt({ id: promptId, ...(expectedPromptOverrides as any), content: {
          ...createMockPrompt().content,
          name: 'インポートされたプロンプト',
          tags: [],
          template: 'テンプレート',
          frameworkRef: frameworkId,
        } })],
        settings: {
          ...createMockAppData().settings,
          defaultFrameworkId: frameworkId,
        },
      });
      mockGetAppData.mockResolvedValue(currentAppData);

      const arrayBuffer = await readZipFixtureOrGenerate();

      await importExportService.import(arrayBuffer, 'free');

      expect(mockSaveAppData).toHaveBeenCalledTimes(1);
      const savedData = mockSaveAppData.mock.calls[0][0] as AppData;
      expect(savedData.providers).toEqual(currentAppData.providers);
      expect(savedData.settings).toEqual(currentAppData.settings);
      expect(savedData.frameworks).toEqual(currentAppData.frameworks);
      expect(savedData.prompts).toEqual(currentAppData.prompts);
    });

    it('スナップショットデータが存在する場合、selectedPromptIdをクリアする', async () => {
      const currentSnapshot = createMockSnapshotData({ editPrompt: { id: 'existing-prompt-id' } });
      mockGetSnapshot.mockResolvedValue(currentSnapshot);

      const arrayBuffer = await readZipFixtureOrGenerate();

      await importExportService.import(arrayBuffer, 'free');

      expect(mockSaveSnapshot).toHaveBeenCalledTimes(1);
      const savedSnapshot = mockSaveSnapshot.mock.calls[0][0] as SnapshotData;
      expect(savedSnapshot.promptPlayground.selectedPromptId).toBe("");
      expect(savedSnapshot.promptImprovement.selectedPromptId).toBe("");
    });

    it('スナップショットデータが存在しない場合、saveSnapshotは呼ばれない', async () => {
      mockGetSnapshot.mockResolvedValue(null);

      const arrayBuffer = await readZipFixtureOrGenerate();

      await importExportService.import(arrayBuffer, 'free');

      expect(mockSaveSnapshot).not.toHaveBeenCalled();
    });

    it('不正なZIPバイト列の場合、エラーをスローする', async () => {
      const invalidBytes = new TextEncoder().encode('{ invalid json }');
      const arrayBuffer = invalidBytes.buffer.slice(invalidBytes.byteOffset, invalidBytes.byteOffset + invalidBytes.byteLength);

      await expect(importExportService.import(arrayBuffer, 'free')).rejects.toThrow();
    });

    it('無料プランで20件より多いプロンプトをインポートしようとするとエラーをスローする', async () => {
      const zip = new JSZip();
      for (let i = 0; i < 21; i++) {
        const promptId = uuidv6();
        const fmPrompt = {
          version: 2,
          id: promptId,
          name: `インポートされたプロンプト ${i + 1}`,
          template: 'テンプレート',
          inputs: [],
        };
        const buildFrontMatterMd = (body: string, data: Record<string, unknown>): string => {
          const yaml = dumpYamlStable(data);
          return `---\n${yaml}---\n${body ?? ''}`;
        };
        const { template: promptTemplate, ...promptFrontMatter } = fmPrompt;
        zip.file(`prompt-${promptId}.md`, buildFrontMatterMd(promptTemplate as string, promptFrontMatter));
      }

      const arrayBuffer = await zip.generateAsync({ type: 'arraybuffer' });
      await expect(importExportService.import(arrayBuffer, 'free')).rejects.toThrow('無料プランでは20個より多くプロンプトをインポートできません。');
      expect(mockSaveAppData).not.toHaveBeenCalled();
    });
  });

  describe('import (isDiff=true)', () => {
    it('既存IDはスキップし、新規のみ追加する', async () => {
      const service = new FileImportExportService();

      // 既存アプリデータ（既に1件のプロンプトが存在する）
      const existingPromptId = uuidv6();
      const currentAppData = createMockAppData({
        prompts: [createMockPrompt({ id: existingPromptId })],
      });
      mockGetAppData.mockResolvedValue(currentAppData);

      // ZIP を作成（既存IDと新規IDの2件を含める）
      const newPromptId = uuidv6();
      const zip = new JSZip();
      const buildFrontMatterMd = (body: string, data: Record<string, unknown>): string => {
        const yaml = dumpYamlStable(data);
        return `---\n${yaml}---\n${body ?? ''}`;
      };
      const makePrompt = (id: string, name: string) => ({
        version: 2,
        id,
        name,
        template: 'テンプレート',
        inputs: [],
      });
      {
        const { template, ...front } = makePrompt(existingPromptId, '既存のプロンプト');
        zip.file(`prompt-${existingPromptId}.md`, buildFrontMatterMd(template as string, front));
      }
      {
        const { template, ...front } = makePrompt(newPromptId, '新規のプロンプト');
        zip.file(`prompt-${newPromptId}.md`, buildFrontMatterMd(template as string, front));
      }

      const arrayBuffer = await zip.generateAsync({ type: 'arraybuffer' });
      const initialCount = currentAppData.prompts.length;

      // isDiff=true でインポート
      await service.import(arrayBuffer, 'free', true);

      expect(mockSaveAppData).toHaveBeenCalledTimes(1);
      const saved = mockSaveAppData.mock.calls[0][0] as AppData;
      // 既存 + 新規(1件)のみ（初期件数に対して +1）
      expect(saved.prompts.length).toBe(initialCount + 1);
      // 既存IDは重複していない
      expect(saved.prompts.filter(p => p.id === existingPromptId).length).toBe(1);
      // 新規IDが追加されている
      expect(saved.prompts.some(p => p.id === newPromptId)).toBe(true);
      // 新規IDの order は 2（既存1件の次）
      expect(saved.prompts.find(p => p.id === newPromptId)?.order).toBe(2);
    });

    it('isDiff=true では framework のインポートを無視する', async () => {
      const service = new FileImportExportService();

      const existingFrameworkContent = '既存のフレームワーク内容';
      const existingFramework = createMockFramework({ id: 'fw-existing', content: {
        ...createMockFramework().content,
        name: '既存のフレームワーク',
        content: existingFrameworkContent,
      } });
      const currentAppData = createMockAppData({
        frameworks: [existingFramework],
        prompts: [createMockPrompt({ id: 'p-existing' })],
      });
      mockGetAppData.mockResolvedValue(currentAppData);

      const zip = new JSZip();
      const buildFrontMatterMd = (body: string, data: Record<string, unknown>): string => {
        const yaml = dumpYamlStable(data);
        return `---\n${yaml}---\n${body ?? ''}`;
      };
      // ZIP に framework ファイルを含める（isDiff=true では無視される想定）
      const fwContent = 'content';
      const fw = { id: 'fw-import', name: 'FW', version: 2, content: fwContent } as const;
      const { content: fwBody, ...fwFront } = fw as any;
      zip.file(`framework-${fw.id}.md`, buildFrontMatterMd(fwBody as string, fwFront));
      // 追加の新規プロンプトも含める
      const newPromptId = uuidv6();
      const prompt = { version: 2, id: newPromptId, name: 'P', template: 'T', inputs: [] } as const;
      const { template, ...front } = prompt as any;
      zip.file(`prompt-${newPromptId}.md`, buildFrontMatterMd(template as string, front));

      const arrayBuffer = await zip.generateAsync({ type: 'arraybuffer' });
      const initialCount = currentAppData.prompts.length;
      await service.import(arrayBuffer, 'free', true);

      expect(mockSaveAppData).toHaveBeenCalledTimes(1);
      const saved = mockSaveAppData.mock.calls[0][0] as AppData;
      // frameworks は変更なし（ZIP からは取り込まれない）
      expect(saved.frameworks).toEqual(currentAppData.frameworks);
      expect(saved.frameworks[0].content.content).toEqual(existingFrameworkContent);
      expect(saved.frameworks[0].content.content).not.toEqual(fwContent);
      // プロンプトは新規分だけ増える（初期件数に対して +1）
      expect(saved.prompts.length).toBe(initialCount + 1);
      expect(saved.prompts.some(p => p.id === newPromptId)).toBe(true);
      expect(saved.prompts.find(p => p.id === newPromptId)?.order).toBe(2);
    });

    it('app-prompts.json が存在し、isDiff=true の場合に shared を反映して取り込む', async () => {
      const service = new FileImportExportService();

      // 既存データ（既存1件）
      const existing = createMockPrompt({ id: uuidv6() });
      const currentAppData = createMockAppData({ prompts: [existing] });
      mockGetAppData.mockResolvedValue(currentAppData);

      // 新規2件のプロンプト + app-prompts.json をZIPに含める
      const newA = uuidv6();
      const newB = uuidv6();
      const zip = new JSZip();
      const buildFrontMatterMd = (body: string, data: Record<string, unknown>): string => {
        const yaml = dumpYamlStable(data);
        return `---\n${yaml}---\n${body ?? ''}`;
      };
      const makePrompt = (id: string, name: string) => ({
        version: 2,
        id,
        name,
        template: 'テンプレート',
        inputs: [],
      });
      {
        const { template, ...front } = makePrompt(newA, '新規A');
        zip.file(`prompt-${newA}.md`, buildFrontMatterMd(template as string, front));
      }
      {
        const { template, ...front } = makePrompt(newB, '新規B');
        zip.file(`prompt-${newB}.md`, buildFrontMatterMd(template as string, front));
      }
      // app-prompts.json を同梱（順序はバラバラだが、shared を参照できることを確認）
      const meta = [
        { id: newB, order: 5, shared: false },
        { id: newA, order: 1, shared: true },
      ];
      zip.file(APP_PROMPTS_JSON_FILE_NAME, JSON.stringify(meta, null, 2));

      const arrayBuffer = await zip.generateAsync({ type: 'arraybuffer' });
      const initialCount = currentAppData.prompts.length;
      await service.import(arrayBuffer, 'free', true);

      expect(mockSaveAppData).toHaveBeenCalledTimes(1);
      const saved = mockSaveAppData.mock.calls[0][0] as AppData;
      // 既存 + 新規2件
      expect(saved.prompts.length).toBe(initialCount + 2);
      // 各IDが存在し、shared が app-prompts.json に従う
      const a = saved.prompts.find(p => p.id === newA)!;
      const b = saved.prompts.find(p => p.id === newB)!;
      expect(a).toBeTruthy();
      expect(b).toBeTruthy();
      expect(a.order).toBe(2);
      expect(b.order).toBe(3);
      expect(b.shared).toBe(false);
      expect(a.shared).toBe(true);
      expect(b.shared).toBe(false);
    });
  });
}); 
