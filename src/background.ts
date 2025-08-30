import { ApiServiceFactory } from './services/api-service-factory';
import { storageService } from './services/storage';
import { ApiKeyAuthenticationError } from './services/api-errors';

const apiServiceFactory = new ApiServiceFactory();

const CONTEXT_MENU_ID = 'toggle-side-panel';

function isAutomatedEnvironment(): boolean {
  try {
    const hasNavigator = typeof navigator !== 'undefined';
    const ua = hasNavigator ? navigator.userAgent || '' : '';
    const hasWebdriver = hasNavigator && (navigator as any).webdriver === true;
    return /Headless|Playwright|Puppeteer|Chrome-Lighthouse/i.test(ua) || hasWebdriver;
  } catch {
    return false;
  }
}

async function ensureContextMenu() {
  await new Promise<void>((resolve) => {
    chrome.contextMenus.update(
      CONTEXT_MENU_ID,
      { title: 'サイドパネルを開く', contexts: ['action'] },
      () => {
        if (chrome.runtime.lastError) {
          chrome.contextMenus.create(
            { id: CONTEXT_MENU_ID, title: 'サイドパネルを開く', contexts: ['action'] },
            () => {
              resolve();
            }
          );
        } else {
          resolve();
        }
      }
    );
  });
}

chrome.runtime.onInstalled.addListener(async (_details) => {
  if (isAutomatedEnvironment()) {
    // E2E（Playwright等）の実行中は初期化をスキップ
    await ensureContextMenu();
    return;
  }

  await storageService.initializeData();

  const initialized = await storageService.getInitialized();
  if (!initialized) {
    await storageService.initializePrompts();
  }

  await ensureContextMenu();
});

(self as any)._test_initialize = () => storageService.initializeData();

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === CONTEXT_MENU_ID && tab?.id) {
    try {
      await chrome.sidePanel.open({ tabId: tab.id });
    } catch (error) {
      console.error('Failed to open side panel:', error);
    }
  }
});

// API呼び出しを処理するメッセージリスナー
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'IMPROVE_PROMPT') {
    handleImprovePrompt(message.payload)
      .then(response => sendResponse({ success: true, data: response }))
      .catch(error => {
        if (error instanceof ApiKeyAuthenticationError) {
          // APIキー関連のエラーの場合、フロントエンドで特別な処理ができるように情報を追加
          sendResponse({ success: false, error: error.message, isAuthError: true });
        } else {
          // その他のエラー
          sendResponse({ success: false, error: error.message, isAuthError: false });
        }
      });
    return true;
  }
});

// プロンプト改善処理を実行する
async function handleImprovePrompt(payload: {
  providerName: string;
  modelName: string;
  userPrompt: string;
  selectedPrompt: string;
  frameworkContent: string;
}): Promise<string> {
  const { providerName, modelName, userPrompt, selectedPrompt, frameworkContent } =
    payload;

  const apiKey = await storageService.getApiKey(providerName);
  if (!apiKey) {
    throw new ApiKeyAuthenticationError(`APIキーが設定されていません: ${providerName}`);
  }

  const apiService = await apiServiceFactory.create(providerName);
  return apiService.improvePrompt(userPrompt, selectedPrompt, frameworkContent, apiKey, modelName);
}
