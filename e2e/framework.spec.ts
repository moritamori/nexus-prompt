import { AppData } from '../src/types';
import { test, expect } from './fixtures';
import { STORAGE_KEY } from '../src/services/storage';
import { v6 as uuidv6 } from 'uuid';

test.describe('フレームワーク管理テスト', () => {
  test.beforeEach(async ({ serviceWorker }) => {
    await serviceWorker.evaluate(async () => {
      await chrome.storage.local.clear();
    });
  });
  const frameworkId = uuidv6().toString();

  const testData: AppData = {
    prompts: [],
    providers: [
      {
        id: 'gemini-provider-id',
        name: 'Gemini',
        displayName: 'Google Gemini',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        models: [
          {
            id: 'gemini-model-id',
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
        id: frameworkId,
        content: {
          version: 2,
          id: frameworkId,
          name: 'テストフレームワーク',
          content: '元のフレームワーク内容\n\n# 条件\n- テスト条件1\n- テスト条件2',
          slug: 'test-framework',
        },
        order: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ],
    settings: {
      defaultFrameworkId: 'test-framework-id',
      version: '1.0.0',
      language: 'ja',
      initialized: true
    }
  };

  test.beforeEach(async ({ serviceWorker }) => {
    await serviceWorker.evaluate(async (data: { AppData: AppData, key: string }) => {
      await chrome.storage.local.set({ [data.key]: data.AppData });
    }, {AppData: testData, key: STORAGE_KEY});
  });

  test('Happy Path: フレームワーク内容の表示・編集・保存ができること', async ({ context, serviceWorker, extensionUrl }) => {
    const page = await context.newPage();

    await page.goto(extensionUrl('popup.html'));
    await page.waitForSelector('[data-testid="nexus-prompt"]');

    await page.click('button:has-text("設定")');
    await page.waitForSelector('[data-testid="open-frameworks-link"]');
    await page.click('[data-testid="open-frameworks-link"]');

    const newContent = '新しいフレームワーク内容\n\n# 新しい条件\n- 新条件1\n- 新条件2\n\n# 出力形式\n- JSON形式で出力';
    await page.fill('[data-testid="framework-content-input"]', newContent);
    await page.click('[data-testid="save-framework-button"]');

    await expect(page.locator('[data-testid="message-area"]')).toBeVisible();
    await expect(page.locator('[data-testid="message-area"]')).toHaveClass(/success/);
    await expect(page.locator('[data-testid="message-area"]')).toContainText('フレームワークを保存しました');

    await expect(page.locator('[data-testid="save-framework-button"]')).toHaveText('保存');

    const updatedStorageData = await serviceWorker.evaluate(async (key: string) => {
      return await chrome.storage.local.get(key);
    }, STORAGE_KEY);

    const updatedAppData: AppData = updatedStorageData[STORAGE_KEY];
    expect(updatedAppData.frameworks[0].content.content).toBe(newContent);
    expect(updatedAppData.frameworks[0].id).toBe(testData.frameworks[0].id);
    expect(updatedAppData.frameworks[0].content.name).toBe(testData.frameworks[0].content.name);
    
    expect(updatedAppData.frameworks[0].updatedAt).not.toBe(testData.frameworks[0].updatedAt);
    expect(new Date(updatedAppData.frameworks[0].updatedAt).getTime()).toBeGreaterThan(
      new Date(testData.frameworks[0].updatedAt).getTime()
    );

    await page.click('.js-link-back');
    await page.waitForSelector('[data-testid="nexus-prompt"]');
    await page.click('button:has-text("設定")');
    await page.waitForSelector('[data-testid="open-frameworks-link"]');
    await page.click('[data-testid="open-frameworks-link"]');
    const frameworkContentInput = await page.waitForSelector('[data-testid="framework-content-input"]');

    const reloadedContent = await frameworkContentInput.inputValue();
    expect(reloadedContent).toBe(newContent);

    await page.close();
  });

  test('Sad Path: 空のフレームワーク内容での保存ができないこと', async ({ context, serviceWorker, extensionUrl }) => {
    const page = await context.newPage();

    await page.goto(extensionUrl('popup.html'));
    await page.waitForSelector('[data-testid="nexus-prompt"]');

    await page.click('button:has-text("設定")');
    await page.waitForSelector('[data-testid="open-frameworks-link"]');
    await page.click('[data-testid="open-frameworks-link"]');
    await page.fill('[data-testid="framework-content-input"]','');
    await page.click('[data-testid="save-framework-button"]');

    await expect(page.locator('[data-testid="message-area"]')).toBeVisible();
    await expect(page.locator('[data-testid="message-area"]')).toHaveClass(/error/);
    await expect(page.locator('[data-testid="message-area"]')).toContainText('フレームワーク内容を入力してください');

    const unchangedStorageData = await serviceWorker.evaluate(async (key: string) => {
      return await chrome.storage.local.get(key);
    }, STORAGE_KEY);

    const unchangedAppData: AppData = unchangedStorageData[STORAGE_KEY];
    expect(unchangedAppData.frameworks[0].content.content).toBe(testData.frameworks[0].content.content);
    expect(unchangedAppData.frameworks[0].updatedAt).toBe(testData.frameworks[0].updatedAt);

    await page.close();
  });

  test('Sad Path: 空白文字のみのフレームワーク内容での保存ができないこと', async ({ context, serviceWorker, extensionUrl }) => {
    const page = await context.newPage();

    await page.goto(extensionUrl('popup.html'));
    await page.waitForSelector('[data-testid="nexus-prompt"]');

    await page.click('button:has-text("設定")');
    await page.waitForSelector('[data-testid="open-frameworks-link"]');
    await page.click('[data-testid="open-frameworks-link"]');
    await page.fill('[data-testid="framework-content-input"]', '   \n\t  \n  ');
    await page.click('[data-testid="save-framework-button"]');

    await expect(page.locator('[data-testid="message-area"]')).toBeVisible();
    await expect(page.locator('[data-testid="message-area"]')).toHaveClass(/error/);
    await expect(page.locator('[data-testid="message-area"]')).toContainText('フレームワーク内容を入力してください');

    const unchangedStorageData = await serviceWorker.evaluate(async (key: string) => {
      return await chrome.storage.local.get(key);
    }, STORAGE_KEY);

    const unchangedAppData: AppData = unchangedStorageData[STORAGE_KEY];
    expect(unchangedAppData.frameworks[0].content.content).toBe(testData.frameworks[0].content.content);
    expect(unchangedAppData.frameworks[0].updatedAt).toBe(testData.frameworks[0].updatedAt);

    await page.close();
  });
}); 