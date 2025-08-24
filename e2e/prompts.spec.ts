import { AppData, Prompt } from '../src/types';
import { test, expect } from './fixtures';
import { STORAGE_KEY } from '../src/services/storage';
import { v6 as uuidv6 } from 'uuid';

test.describe('プロンプトテンプレート管理テスト', () => {
  const prompt1Id = uuidv6().toString();
  const prompt2Id = uuidv6().toString();
  const frameworkId = uuidv6().toString();
  const initialData: AppData = {
    prompts: [
        { 
          id: prompt1Id, 
          content: { 
            version: 2, 
            id: prompt1Id, 
            name: '既存のプロンプト1', 
            template: '内容1', 
            inputs: [], 
            tags: [],
            frameworkRef: frameworkId 
          }, 
          order: 1, 
          shared: false,
          createdAt: new Date().toISOString(), 
          updatedAt: new Date().toISOString() 
        },
        { 
          id: prompt2Id, 
          content: { 
            version: 2, 
            id: prompt2Id, 
            name: '既存のプロンプト2', 
            template: '内容2', 
            inputs: [], 
            tags: [],
            frameworkRef: frameworkId
          }, 
          order: 2, 
          shared: false,
          createdAt: new Date().toISOString(), 
          updatedAt: new Date().toISOString() 
        }
    ],
    providers: [
      {
        id: 'gemini-provider-id', 
        name: 'Gemini',
        displayName: 'Google Gemini',
        models: [{ id: 'gemini-model-id', name: 'gemini-2.0-flash', order: 1, enabled: true, isBuiltIn: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
        createdAt: new Date().toISOString(), 
        updatedAt: new Date().toISOString()
      }
    ],
    frameworks: [
      {
        id: frameworkId,
        content: {
          version: 2,
          id: frameworkId,
          name: 'テストフレームワーク',
          content: 'テストコンテンツ',
          slug: 'test-framework',
        },
        order: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ],
    settings: { defaultFrameworkId: frameworkId, initialized: true, version: '1.0.0', language: 'ja' }
  };

  test.beforeEach(async ({ serviceWorker }) => {
    await serviceWorker.evaluate(async (data: { AppData: AppData, key: string }) => {
      await chrome.storage.local.clear();
      await chrome.storage.local.set({ [data.key]: data.AppData });
    }, {AppData: initialData, key: STORAGE_KEY});
  });

  test('Happy Path: プロンプトテンプレートの作成', async ({ context, extensionUrl, serviceWorker }) => {
    const page = await context.newPage();

    await page.goto(extensionUrl('popup.html'));
    await page.waitForSelector('[data-testid="nexus-prompt"]');
    await page.click('button:has-text("LLMプロンプト管理")');
    
    await page.click('[data-testid="new-prompt-button"]');
    // 新UIではモーダルではなくエディタビューに遷移する
    await expect(page.locator('[data-testid="prompt-name-input"]')).toBeVisible();
    // CodeMirror エディタの準備
    const editor = page.locator('.cm-content');
    await expect(editor).toBeVisible();

    const newPromptName = '新しいテストプロンプト';
    const newPromptContent = 'これは新しいプロンプトのテスト内容です。';
    await page.fill('[data-testid="prompt-name-input"]', newPromptName);
    await editor.fill(newPromptContent);
    await page.click('[data-testid="save-prompt-button"]');

    await expect(page.locator('[data-testid="message-area"]')).toContainText('プロンプトを保存しました');
    // 保存後は一覧に戻る
    await expect(page.locator('[data-testid="prompt-list"]')).toBeVisible();

    const storedData = await serviceWorker.evaluate(async (key: string) => {
      return await chrome.storage.local.get(key);
    }, STORAGE_KEY);
    const prompts = storedData[STORAGE_KEY].prompts;
    expect(prompts.length).toBe(3);
    const newPrompt = prompts.find((p: Prompt) => p.content.name === newPromptName);
    expect(newPrompt).toBeDefined();
    expect(newPrompt.content.template).toBe(newPromptContent);

    await expect(page.locator('[data-testid="prompt-list"]')).toContainText(newPromptName);
  });

  test('Happy Path: プロンプトテンプレートの編集', async ({ context, extensionUrl, serviceWorker }) => {
    const page = await context.newPage();

    await page.goto(extensionUrl('popup.html'));
    await page.waitForSelector('[data-testid="nexus-prompt"]');
    await page.click('button:has-text("LLMプロンプト管理")');

    await page.locator('.prompt-item:has-text("既存のプロンプト1")').locator('button:has-text("編集")').click();

    // 新UIではモーダルではなくエディタビュー
    await expect(page.locator('[data-testid="prompt-name-input"]')).toBeVisible();
    const editor = page.locator('.cm-content');
    await expect(editor).toBeVisible();
    const updatedPromptName = '更新されたプロンプト';
    const updatedPromptContent = '更新された内容です。';
    await page.fill('[data-testid="prompt-name-input"]', updatedPromptName);
    await editor.fill(updatedPromptContent);
    await page.click('[data-testid="save-prompt-button"]');

    await expect(page.locator('[data-testid="message-area"]')).toContainText('プロンプトを保存しました');
    
    const storedData = await serviceWorker.evaluate(async (key: string) => {
      return await chrome.storage.local.get(key);
    }, STORAGE_KEY);
    const prompts = storedData[STORAGE_KEY].prompts;
    const updatedPrompt = prompts.find((p: Prompt) => p.id === prompt1Id);
    expect(updatedPrompt?.content.name).toBe(updatedPromptName);
    expect(updatedPrompt?.content.template).toBe(updatedPromptContent);

    await expect(page.locator('[data-testid="prompt-list"]')).toContainText(updatedPromptName);
    await expect(page.locator('[data-testid="prompt-list"]')).not.toContainText('既存のプロンプト1');
  });

  test('Happy Path: プロンプトテンプレートの削除', async ({ context, extensionUrl, serviceWorker }) => {
    const page = await context.newPage();

    page.on('dialog', dialog => dialog.accept());
    await page.goto(extensionUrl('popup.html'));
    await page.waitForSelector('[data-testid="nexus-prompt"]');
    await page.click('button:has-text("LLMプロンプト管理")');

    await page.locator('.prompt-item:has-text("既存のプロンプト1")').locator('button:has-text("削除")').click();
    
    await expect(page.locator('[data-testid="message-area"]')).toContainText('プロンプトを削除しました');

    const storedData = await serviceWorker.evaluate((key: string) => {
      return chrome.storage.local.get(key);
    }, STORAGE_KEY);
    const prompts = storedData[STORAGE_KEY].prompts;
    expect(prompts.length).toBe(1);
    expect(prompts.find((p: Prompt) => p.id === prompt1Id)).toBeUndefined();

    await expect(page.locator('[data-testid="prompt-list"]')).not.toContainText('既存のプロンプト1');
    await expect(page.locator('[data-testid="prompt-list"]')).toContainText('既存のプロンプト2');
  });

  test('Happy Path: プロンプトテンプレートの入力追加', async ({ context, extensionUrl, serviceWorker }) => {
    const page = await context.newPage();

    await page.goto(extensionUrl('popup.html'));
    await page.waitForSelector('[data-testid="nexus-prompt"]');
    await page.click('button:has-text("LLMプロンプト管理")');

    await page.locator('.prompt-item:has-text("既存のプロンプト1")').locator('button:has-text("編集")').click();

    // 要素1
    const input = page.locator('.inputs .input[data-type="string"]');
    await expect(input).toBeVisible();
    await input.click();
   
    const addInputButton = page.locator('button:has-text("追加")');
    await expect(addInputButton).toBeVisible();
    await addInputButton.click();

    const editInputButton = page.locator('button:has-text("{{target_string}}")');
    await expect(editInputButton).toBeVisible();
    await editInputButton.click();

    const modalHeader = page.locator('.modal-header');
    await expect(modalHeader).toBeVisible();

    await page.locator('button:has-text("削除")').click();

    // 要素2
    const input2 = page.locator('.inputs .input[data-type="number"]');
    await expect(input2).toBeVisible();
    await input2.click();

    const addInputButton2 = page.locator('button:has-text("追加")');
    await expect(addInputButton2).toBeVisible();
    await addInputButton2.click();

    const editInputButton2 = page.locator('button:has-text("{{target_number}}")');
    await expect(editInputButton2).toBeVisible();
    await editInputButton2.click();

    const modalHeader2 = page.locator('.modal-header');
    await expect(modalHeader2).toBeVisible();

    await page.locator('button:has-text("更新")').click();

    // プロンプトの保存
    await page.locator('button:has-text("保存")').click();

    const storedData = await serviceWorker.evaluate(async (key: string) => {
      return await chrome.storage.local.get(key);
    }, STORAGE_KEY);
    const prompts = storedData[STORAGE_KEY].prompts;
    expect(prompts.length).toBe(2);
    const newPrompt = prompts.find((p: Prompt) => p.content.name === '既存のプロンプト1');
    expect(newPrompt).toBeDefined();
    expect(newPrompt?.content.inputs.length).toBe(1);
    expect(newPrompt?.content.inputs[0].name).toBe('target_number');
    expect(newPrompt?.content.inputs[0].type).toBe('number');
    expect(newPrompt?.content.inputs[0].required).toBe(false);
  });

  test('Sad Path: プロンプト内容が空での保存', async ({ context, extensionUrl, serviceWorker }) => {
    const page = await context.newPage();

    await page.goto(extensionUrl('popup.html'));
    await page.waitForSelector('[data-testid="nexus-prompt"]');
    await page.click('button:has-text("LLMプロンプト管理")');

    await page.click('[data-testid="new-prompt-button"]');

    await page.fill('[data-testid="prompt-name-input"]', 'タイトルのみ');
    const editor = page.locator('.cm-content');
    await expect(editor).toBeVisible();
    // 空白のみ
    await editor.fill('   ');
    await page.click('[data-testid="save-prompt-button"]');

    await expect(page.locator('[data-testid="message-area"]')).toContainText('プロンプト内容を入力してください');
    // エディタに留まる
    await expect(page.locator('[data-testid="prompt-name-input"]')).toBeVisible();

    const storedData = await serviceWorker.evaluate(async (key: string) => {
      return await chrome.storage.local.get(key);
    }, STORAGE_KEY);
    const prompts = storedData[STORAGE_KEY].prompts;
    expect(prompts.length).toBe(2);
  });
}); 
