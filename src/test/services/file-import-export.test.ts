import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FileImportExportService } from '../../services/file-import-export';
import type { AppData, SnapshotData } from '../../types';
import { createMockAppData, createMockFramework, createMockPrompt, createMockSnapshotData } from '../test-utils/factories';
import { readFile } from 'fs/promises';
import JSZip from 'jszip';

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

// crypto.randomUUID のモック
const mockRandomUUID = vi.hoisted(() => vi.fn());
Object.defineProperty(globalThis, 'crypto', {
  value: {
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
      const testFramework = createMockFramework({ id: 'original-id' });
      const testPrompt = createMockPrompt({ id: 'original-prompt-id' });
      const testAppData = createMockAppData({
        frameworks: [testFramework],
        prompts: [testPrompt],
      });

      mockGetAppData.mockResolvedValue(testAppData);

      const result = await importExportService.export();
      expect(result).toBeInstanceOf(Uint8Array);
      
      expect(result.byteLength).toBeGreaterThan(0);

      expect(mockGetAppData).toHaveBeenCalledTimes(1);
    });

    it('複数のフレームワークとプロンプトを含むデータをエクスポートする', async () => {
      const testFrameworks = [
        createMockFramework({
          id: 'fw1',
          content: {
            ...createMockFramework().content,
            content: createMockFramework().content.content,
          },
        }),
        createMockFramework({
          id: 'fw2',
          content: {
            ...createMockFramework().content,
            content: createMockFramework().content.content,
          },
        }),
      ];
      const testPrompts = [
        createMockPrompt({
          id: 'p1',
          content: {
            ...createMockPrompt().content,
            template: createMockPrompt().content.template,
          },
        }),
        createMockPrompt({
          id: 'p2',
          content: {
            ...createMockPrompt().content,
            template: createMockPrompt().content.template,
          },
        }),
      ];
      const testAppData = createMockAppData({
        frameworks: testFrameworks,
        prompts: testPrompts,
      });

      mockGetAppData.mockResolvedValue(testAppData);

      const result = await importExportService.export();
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.byteLength).toBeGreaterThan(0);

      expect(mockGetAppData).toHaveBeenCalledTimes(1);
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
    const zipPath = 'src/test/data/nexus-prompt-export-2025-08-11.zip';
    const toArrayBuffer = (u8: Uint8Array) => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
    const readZipFixtureOrGenerate = async (): Promise<ArrayBuffer> => {
      let bytes = await readFile(zipPath);
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

    it('ZIP形式のデータをインポートする', async () => {
      const currentAppData = createMockAppData({
        settings: {
          ...createMockAppData().settings,
          defaultFrameworkId: '50715f31-70bc-40cb-925c-27198dc3e82c',
        },
      });
      mockGetAppData.mockResolvedValue(currentAppData);

      const arrayBuffer = await readZipFixtureOrGenerate();

      await importExportService.import(arrayBuffer, 'free');

      // saveAppDataが呼ばれることを確認（詳細はE2Eで担保）
      expect(mockSaveAppData).toHaveBeenCalledTimes(1);
      const savedData = mockSaveAppData.mock.calls[0][0] as AppData;
      expect(savedData.providers).toEqual(currentAppData.providers);
      expect(savedData.settings).toEqual(currentAppData.settings);
    });

    it('ドラフトデータが存在する場合、selectedPromptIdをクリアする', async () => {
      const currentSnapshot = createMockSnapshotData({ editPrompt: { id: 'existing-prompt-id' } });
      mockGetSnapshot.mockResolvedValue(currentSnapshot);

      const arrayBuffer = await readZipFixtureOrGenerate();

      await importExportService.import(arrayBuffer, 'free');

      expect(mockSaveSnapshot).toHaveBeenCalledTimes(1);
      const savedSnapshot = mockSaveSnapshot.mock.calls[0][0] as SnapshotData;
      expect(savedSnapshot.editPrompt.id).toBe(null);
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

    // it('無料プランで20個より多くのプロンプトをインポートしようとした場合、エラーをスローする', async () => {
    //   const currentAppData = createMockAppData({
    //     prompts: Array.from({ length: 21 }, (_, i) => createMockPrompt({ id: `prompt-${i + 1}` })),
    //   });
    //   mockGetAppData.mockResolvedValue(currentAppData);

    //   const arrayBuffer = await readZipFixtureOrGenerate();

    //   await expect(importExportService.import(arrayBuffer, 'free')).rejects.toThrow();
    // });
  });
}); 
