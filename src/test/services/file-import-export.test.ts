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

    it('ZIP形式のデータをインポートする(app-prompts.json が存在しない場合)', async () => {
      const currentAppData = createMockAppData({
        frameworks: [createMockFramework({ id: frameworkId, content: {
          ...createMockFramework().content,
          name: 'インポートされたフレームワーク',
          content: 'インポート用フレームワーク内容',
        } })],
        prompts: [createMockPrompt({ id: promptId, content: {
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

    it('ZIP形式のデータをインポートする(app-prompts.json が存在する場合)', async () => {
      zip.file(APP_PROMPTS_JSON_FILE_NAME, JSON.stringify([{ id: fmPrompt.id, order: 2, shared: false }], null, 2));
      
      const currentAppData = createMockAppData({
        frameworks: [createMockFramework({ id: frameworkId, content: {
          ...createMockFramework().content,
          name: 'インポートされたフレームワーク',
          content: 'インポート用フレームワーク内容',
        } })],
        prompts: [createMockPrompt({ id: promptId, order: 2, shared: false, content: {
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

    it('ドラフトデータが存在する場合、selectedPromptIdをクリアする', async () => {
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
  });
}); 
