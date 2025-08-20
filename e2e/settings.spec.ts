import { test, expect } from './fixtures';
import JSZip from 'jszip';
import type { AppData } from '../src/types';
import { STORAGE_KEY } from '../src/services/storage';
import { GeminiApiServiceName } from '../src/services/gemini-api';
import { OpenAIApiServiceName } from '../src/services/openai-api';
import { AnthropicApiServiceName } from '../src/services/anthropic-api';
import { v6 as uuidv6 } from 'uuid';

const TEST_API_KEY_NEW = 'TEST_API_KEY_NEW';

test.describe('APIキー設定画面', () => {
  test.beforeEach(async ({ serviceWorker }) => {
    await serviceWorker.evaluate(async () => {
      await chrome.storage.local.clear();
      await (self as any)._test_initialize();
    });
  });

  test('Happy Path: APIキーの表示と更新ができること', async ({ context, serviceWorker, extensionUrl }) => {
    const page = await context.newPage();

    await page.goto(extensionUrl('popup.html'));
    await page.waitForSelector('[data-testid="nexus-prompt"]');
    await page.click('button:has-text("設定")');

    await page.fill('[data-testid="gemini-api-key-input"]', TEST_API_KEY_NEW);
    await page.click('[data-testid="save-gemini-api-key-button"]');
    
    await expect(page.locator('[data-testid="message-area"]')).toHaveText('APIキーを保存しました');
    const storedData = await serviceWorker.evaluate(async (key) => await chrome.storage.local.get(key), STORAGE_KEY);
    const appData: AppData = storedData[STORAGE_KEY];

    const geminiProvider = appData.providers.find(p => p.name === GeminiApiServiceName);
    expect(geminiProvider).toBeDefined();
    const openaiProvider = appData.providers.find(p => p.name === OpenAIApiServiceName);
    expect(openaiProvider).toBeDefined();
    const anthropicProvider = appData.providers.find(p => p.name === AnthropicApiServiceName);
    expect(anthropicProvider).toBeDefined();
  });

  test('Sad Path: 空のAPIキー保存時のバリデーションエラーが表示されること', async ({ context, serviceWorker, extensionUrl }) => {
    const page = await context.newPage();

    await page.goto(extensionUrl('popup.html'));
    await page.waitForSelector('[data-testid="nexus-prompt"]');
    await page.click('button:has-text("設定")');

    const beforeData = await serviceWorker.evaluate(async (key) => await chrome.storage.local.get(key), STORAGE_KEY);

    await page.fill('[data-testid="gemini-api-key-input"]', '');
    await page.click('[data-testid="save-gemini-api-key-button"]');

    await expect(page.locator('[data-testid="message-area"]')).toHaveText('APIキーを入力してください');
    const afterData = await serviceWorker.evaluate(async (key) => await chrome.storage.local.get(key), STORAGE_KEY);
    expect(afterData).toEqual(beforeData);
  });
});

test.describe('インポート・エクスポート機能', () => {
  const testAppDataWithFrameworks: AppData = {
    prompts: [],
    providers: [
      {
        id: 'provider-gemini',
        name: 'Gemini',
        displayName: 'Google Gemini',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        models: [
          {
            id: 'model-gemini',
            name: 'gemini-2.0-flash',
            order: 1,
            enabled: true,
            isBuiltIn: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        ]
      }
    ],
    frameworks: [
      {
        id: 'framework-1',
        content: {
          version: 2,
          id: 'framework-1',
          name: 'テストフレームワーク',
          content: 'テスト用フレームワーク内容',
          slug: 'test-framework',
        },
        order: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    ],
    settings: {
      defaultFrameworkId: 'framework-1',
      version: '1.0.2',
      language: 'ja'
    }
  };

  test.beforeEach(async ({ serviceWorker }) => {
    await serviceWorker.evaluate(async () => {
      await chrome.storage.local.clear();
      await (self as any)._test_initialize();
    });

    await serviceWorker.evaluate(async (data: { AppData: AppData, key: string }) => {
      await chrome.storage.local.set({ [data.key]: data.AppData });
    }, {AppData: testAppDataWithFrameworks, key: STORAGE_KEY});
  });

  test('Happy Path: エクスポート機能が正常に動作すること', async ({ context, serviceWorker, extensionUrl }) => {
    const page = await context.newPage();

    await page.goto(extensionUrl('popup.html'));
    await page.waitForSelector('[data-testid="nexus-prompt"]');
    await page.click('button:has-text("設定")');
    await page.click('[data-testid="open-data-management-link"]');
    await page.waitForSelector('[data-testid="export-button"]');

    const downloadPromise = page.waitForEvent('download');

    await page.click('[data-testid="export-button"]');

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/nexus-prompt-export-\d{4}-\d{2}-\d{2}\.zip/);

    await expect(page.locator('[data-testid="message-area"]')).toHaveText('データをZIPとしてエクスポートしました');

    await page.close();
  });

  test('Happy Path: インポート機能が正常に動作すること', async ({ context, serviceWorker, extensionUrl }) => {
    const page = await context.newPage();

    page.on('dialog', dialog => dialog.accept());

    await page.goto(extensionUrl('popup.html'));
    await page.waitForSelector('[data-testid="nexus-prompt"]');
    await page.click('button:has-text("設定")');
    await page.click('[data-testid="open-data-management-link"]');
    await page.waitForSelector('[data-testid="import-file-input"]', { state: 'attached' });

    // ZIPを生成（frameworks/ と prompts/ のフロントマターJSONのみ）
    const zip = new JSZip();
    const fmFramework = {
      version: 2,
      id: uuidv6().toString(),
      name: 'インポートされたフレームワーク',
      content: 'インポート用フレームワーク内容',
      slug: 'test-framework',
    } as Record<string, unknown>;
    const fmPrompt = {
      version: 2,
      id: uuidv6().toString(),
      name: 'インポートされたプロンプト',
      template: 'テンプレート',
      inputs: [],
    } as Record<string, unknown>;
    // Front-matterは '---' 区切りで、本文は空でも可（YAMLはJSONのスーパーセット）
    const toFrontMatter = (obj: Record<string, unknown>) => `---\n${JSON.stringify(obj, null, 2)}\n---\n`;
    zip.file(`framework-${fmFramework.id}.md`, toFrontMatter(fmFramework));
    zip.file(`prompt-${fmPrompt.id}.md`, toFrontMatter(fmPrompt));
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    await page.setInputFiles('[data-testid="import-file-input"]', {
      name: 'test-import.zip',
      mimeType: 'application/zip',
      buffer: zipBuffer,
    });

    await expect(page.locator('[data-testid="message-area"]')).toHaveText('フレームワークデータをインポートしました');

    const storedData = await serviceWorker.evaluate(async (key) => await chrome.storage.local.get(key), STORAGE_KEY);
    const appData: AppData = storedData[STORAGE_KEY];
    expect(appData.frameworks.length).toBeGreaterThan(0);
    expect(appData.frameworks[0].content.name).toBe('インポートされたフレームワーク');

    await page.close();
  });

  test('Sad Path: 無効なZIPファイルインポート時のエラーハンドリング', async ({ context, serviceWorker, extensionUrl }) => {
    const page = await context.newPage();

    page.on('dialog', dialog => dialog.accept());

    await page.goto(extensionUrl('popup.html'));
    await page.waitForSelector('[data-testid="nexus-prompt"]');
    await page.click('button:has-text("設定")');
    await page.click('[data-testid="open-data-management-link"]');
    await page.waitForSelector('[data-testid="import-file-input"]', { state: 'attached' });

    const invalidFileContent = '{ invalid zip content }';
    await page.setInputFiles('[data-testid="import-file-input"]', {
      name: 'invalid-import.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from(invalidFileContent)
    });

    await expect(page.locator('[data-testid="message-area"]')).toContainText(/インポートファイルの形式が正しくありません。|central directory/i);

    const storedData = await serviceWorker.evaluate(async (key) => await chrome.storage.local.get(key), STORAGE_KEY);
    const appData: AppData = storedData[STORAGE_KEY];
    expect(appData.frameworks[0].content.name).toBe('テストフレームワーク');

    await page.close();
  });

  test('Sad Path: インポート確認ダイアログでキャンセルを選択', async ({ context, serviceWorker, extensionUrl }) => {
    const page = await context.newPage();

    page.on('dialog', dialog => dialog.dismiss());

    await page.goto(extensionUrl('popup.html'));
    await page.waitForSelector('[data-testid="nexus-prompt"]');
    await page.click('button:has-text("設定")');
    await page.click('[data-testid="open-data-management-link"]');
    await page.waitForSelector('[data-testid="import-file-input"]', { state: 'attached' });

    // 単純なZIP（中身は空でも可）を渡しても、ダイアログでキャンセルするため状態は変わらない
    const zip = new JSZip();
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    await page.setInputFiles('[data-testid="import-file-input"]', {
      name: 'cancelled-import.zip',
      mimeType: 'application/zip',
      buffer: zipBuffer,
    });

    const storedData = await serviceWorker.evaluate(async (key) => await chrome.storage.local.get(key), STORAGE_KEY);
    const appData: AppData = storedData[STORAGE_KEY];
    expect(appData.frameworks[0].content.name).toBe('テストフレームワーク');

    await page.close();
  });
});