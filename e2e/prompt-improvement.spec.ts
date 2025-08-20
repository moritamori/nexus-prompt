import { test, expect, type Page } from './fixtures';
import type { AppData } from '../src/types';
import { STORAGE_KEY } from '../src/services/storage';

const TEST_PROMPT = 'Pythonでファイルを読み込む方法を教えて';
const MOCK_API_RESPONSE = 'これは改善されたプロンプトです。Pythonでファイルを読み込む際は、以下の点を考慮してください...';

test.describe('プロンプト適用（LLM連携）', () => {
  test.beforeEach(async ({ serviceWorker }) => {
    await serviceWorker.evaluate(async () => {
      await chrome.storage.local.clear();
    });
  });

  const testAppDataWithApiKey: AppData = {
    prompts: [
      {
        id: 'prompt-1',
        content: { version: 2, id: 'prompt-1', name: 'コーディング質問プロンプト', template: 'プログラミングの質問に答える際は、具体的なコード例を含めて説明してください。', inputs: [], frameworkRef: 'framework-1', tags: [] },
        order: 1,
        shared: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ],
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
          content: 'プロンプト改善のためのフレームワーク内容',
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
  
  test.describe('APIキーが設定されている場合', () => {
    test.beforeEach(async ({ serviceWorker }) => {
      await serviceWorker.evaluate(async (data: { AppData: AppData, key: string }) => {
        await chrome.storage.local.set({ [data.key]: data.AppData });
      }, {AppData: testAppDataWithApiKey, key: STORAGE_KEY});
    });

    test('Happy Path: 正常なAPI連携', async ({ context, serviceWorker, extensionUrl }) => {
      const page = await context.newPage();

      await serviceWorker.evaluate((mockResponse) => {
        chrome.runtime.onMessage.removeListener;
        chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
          if (message.type === 'IMPROVE_PROMPT') {
            sendResponse({ success: true, data: mockResponse });
            return true;
          }
        });
      }, MOCK_API_RESPONSE);

      await page.goto(extensionUrl('popup.html'));
      await page.waitForSelector('[data-testid="nexus-prompt"]');
      await page.click('button:has-text("プロンプト改善")');

      await page.selectOption('[data-testid="model-select"]', 'model-gemini');
      await page.fill('[data-testid="user-prompt-input"]', TEST_PROMPT);
      await page.selectOption('[data-testid="prompt-select"]', 'prompt-1');
      await page.click('[data-testid="apply-button"]');

      await expect(page.locator('[data-testid="message-area"]')).toHaveText('プロンプトの改善が完了しました');
      await expect(page.locator('[data-testid="result-area"]')).toHaveValue(MOCK_API_RESPONSE);
      await page.close();
    });

    test('Sad Path: APIエラー（401 Unauthorized）', async ({ context, serviceWorker, extensionUrl }) => {
      const page = await context.newPage();

      await serviceWorker.evaluate(() => {
        chrome.runtime.onMessage.removeListener;
        chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
          if (message.type === 'IMPROVE_PROMPT') {
            sendResponse({ success: false, error: 'API error: 401' });
            return true;
          }
        });
      });

      await page.goto(extensionUrl('popup.html'));
      await page.waitForSelector('[data-testid="nexus-prompt"]');
      await page.click('button:has-text("プロンプト改善")');

      await page.selectOption('[data-testid="model-select"]', 'model-gemini');
      await page.fill('[data-testid="user-prompt-input"]', TEST_PROMPT);
      await page.selectOption('[data-testid="prompt-select"]', 'prompt-1');
      await page.click('[data-testid="apply-button"]');

      await expect(page.locator('[data-testid="message-area"]')).toHaveText('エラー: API error: 401');

      await page.close();
    });

    test('Sad Path: プロンプト未入力', async ({ context, extensionUrl }) => {
      const page = await context.newPage();

      await page.goto(extensionUrl('popup.html'));
      await page.waitForSelector('[data-testid="nexus-prompt"]');
      await page.click('button:has-text("プロンプト改善")');

      await page.click('[data-testid="apply-button"]');

      await expect(page.locator('[data-testid="message-area"]')).toHaveText("プロンプトとLLMプロンプトの両方を入力・選択してください");

      await page.close();
    });

    test('リセットボタンのテスト', async ({ context, extensionUrl }) => {
      const page = await context.newPage();

      await page.goto(extensionUrl('popup.html'));
      await page.waitForSelector('[data-testid="nexus-prompt"]');
      await page.click('button:has-text("プロンプト改善")');

      await page.selectOption('[data-testid="model-select"]', 'model-gemini');
      await page.fill('[data-testid="user-prompt-input"]', TEST_PROMPT);
      await page.selectOption('[data-testid="prompt-select"]', 'prompt-1');
      
      await page.fill('[data-testid="result-area"]', 'テスト結果内容');

      await expect(page.locator('[data-testid="model-select"]')).toHaveValue('model-gemini');
      await expect(page.locator('[data-testid="user-prompt-input"]')).toHaveValue(TEST_PROMPT);
      await expect(page.locator('[data-testid="prompt-select"]')).toHaveValue('prompt-1');
      await expect(page.locator('[data-testid="result-area"]')).toHaveValue('テスト結果内容');

      await page.click('button:has-text("リセット")');

      await expect(page.locator('[data-testid="user-prompt-input"]')).toHaveValue('');
      await expect(page.locator('[data-testid="prompt-select"]')).toHaveValue('');
      await expect(page.locator('[data-testid="result-area"]')).toHaveValue('');
      await expect(page.locator('[data-testid="model-select"]')).toHaveValue('model-gemini');
      await expect(page.locator('[data-testid="message-area"]')).toHaveText('フィールドをリセットしました');

      await page.close();
    });
  });

  test.describe('APIキーが設定されていない場合', () => {
    const testAppDataWithoutApiKey: AppData = {
      ...testAppDataWithApiKey,
      providers: [
        {
          ...testAppDataWithApiKey.providers[0]
        }
      ]
    };

    test.beforeEach(async ({ serviceWorker }) => {
      await serviceWorker.evaluate(async (data: { AppData: AppData, key: string }) => {
        await chrome.storage.local.set({ [data.key]: data.AppData });
      }, {AppData: testAppDataWithoutApiKey, key: STORAGE_KEY});
    });

    test('Sad Path: APIキー未設定', async ({ context, serviceWorker, extensionId }) => {
      const page = await context.newPage();

      await page.goto(`chrome-extension://${extensionId}/popup.html`);
      await page.waitForSelector('[data-testid="nexus-prompt"]');
      await page.click('button:has-text("プロンプト改善")');

      await page.selectOption('[data-testid="model-select"]', 'model-gemini');
      await page.fill('[data-testid="user-prompt-input"]', TEST_PROMPT);
      await page.selectOption('[data-testid="prompt-select"]', 'prompt-1');
      await page.click('[data-testid="apply-button"]');

      await expect(page.locator('[data-testid="message-area"]')).toHaveText('APIキーを設定してください');
      await expect(page.locator('button:has-text("設定").active')).toBeVisible();

      await page.close();
    });
  });
}); 