import { AppData, Prompt } from '../src/types';
import { test, expect } from './fixtures';
import { STORAGE_KEY } from '../src/services/storage';
import { v6 as uuidv6 } from 'uuid';

test.describe('プロンプトテンプレート管理テスト', () => {
  const prompt1Id = uuidv6().toString();
  const prompt2Id = uuidv6().toString();
  const prompt3Id = uuidv6().toString();
  const prompt4Id = uuidv6().toString();
  const prompt5Id = uuidv6().toString();
  const frameworkId = uuidv6().toString();
  const initialData: AppData = {
    prompts: [
        { 
          id: prompt1Id, 
          content: { 
            version: 2, 
            id: prompt1Id, 
            name: '既存のプロンプト1(編集)', 
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
            name: '既存のプロンプト2(削除)', 
            template: '内容2', 
            inputs: [], 
            tags: [],
            frameworkRef: frameworkId
          }, 
          order: 2, 
          shared: false,
          createdAt: new Date().toISOString(), 
          updatedAt: new Date().toISOString() 
        },
        { 
          id: prompt3Id, 
          content: { 
            version: 2, 
            id: prompt3Id, 
            name: '既存のプロンプト3(入力バリデーションエラー)', 
            template: '内容1 {{target_boolean}}', 
            inputs: [], 
            tags: [],
            frameworkRef: frameworkId 
          }, 
          order: 3, 
          shared: false,
          createdAt: new Date().toISOString(), 
          updatedAt: new Date().toISOString() 
        },
        { 
          id: prompt4Id, 
          content: { 
            version: 2, 
            id: prompt4Id, 
            name: '既存のプロンプト4(入力追加)', 
            template: '内容1  {{target_boolean}}', 
            inputs: [{ name: 'target_boolean', type: 'boolean', required: false, description: '', default: false }], 
            tags: [],
            frameworkRef: frameworkId 
          }, 
          order: 3, 
          shared: false,
          createdAt: new Date().toISOString(), 
          updatedAt: new Date().toISOString() 
        },
        { 
          id: prompt5Id, 
          content: { 
            version: 2, 
            id: prompt5Id, 
            name: '既存のプロンプト5(入力編集)', 
            template: '内容1 {{target_number}} {{target_string}}', 
            inputs: [
              { name: 'target_number', type: 'number', required: false, description: '', default: 3 },
              { name: 'target_string', type: 'string', required: false, description: '', default: 'デフォルト値' }
            ],
            tags: [],
            frameworkRef: frameworkId 
          }, 
          order: 3, 
          shared: false,
          createdAt: new Date().toISOString(), 
          updatedAt: new Date().toISOString() 
        },
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
    expect(prompts.length).toBe(6);
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

    await page.locator('.prompt-item:has-text("既存のプロンプト1(編集)")').locator('button:has-text("編集")').click();

    await expect(page.locator('[data-testid="prompt-name-input"]')).toBeVisible();
    // CodeMirror エディタの準備
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
    expect(updatedPrompt.content.name).toBe(updatedPromptName);
    expect(updatedPrompt.content.template).toBe(updatedPromptContent);

    await expect(page.locator('[data-testid="prompt-list"]')).toContainText(updatedPromptName);
    await expect(page.locator('[data-testid="prompt-list"]')).not.toContainText('既存のプロンプト1(編集)');
  });

  test('Happy Path: プロンプトテンプレートの削除', async ({ context, extensionUrl, serviceWorker }) => {
    const page = await context.newPage();

    page.on('dialog', dialog => dialog.accept());
    await page.goto(extensionUrl('popup.html'));
    await page.waitForSelector('[data-testid="nexus-prompt"]');
    await page.click('button:has-text("LLMプロンプト管理")');

    await page.locator('.prompt-item:has-text("既存のプロンプト2(削除)")').locator('button:has-text("削除")').click();
    
    await expect(page.locator('[data-testid="message-area"]')).toContainText('プロンプトを削除しました');

    const storedData = await serviceWorker.evaluate((key: string) => {
      return chrome.storage.local.get(key);
    }, STORAGE_KEY);
    const prompts = storedData[STORAGE_KEY].prompts;
    expect(prompts.length).toBe(4);
    expect(prompts.find((p: Prompt) => p.id === prompt2Id)).toBeUndefined();

    await expect(page.locator('[data-testid="prompt-list"]')).toContainText('既存のプロンプト1(編集)');
    await expect(page.locator('[data-testid="prompt-list"]')).not.toContainText('既存のプロンプト2(削除)');
  });

  test('Sad Path: プロンプトテンプレートの入力バリデーションエラー', async ({ context, extensionUrl, serviceWorker }) => {
    const page = await context.newPage();

    await page.goto(extensionUrl('popup.html'));
    await page.waitForSelector('[data-testid="nexus-prompt"]');
    await page.click('button:has-text("LLMプロンプト管理")');

    await page.locator('.prompt-item:has-text("既存のプロンプト3(入力バリデーションエラー)")').locator('button:has-text("編集")').click();

    // CodeMirror エディタの準備
    const editor = page.locator('.cm-content');
    await expect(editor).toBeVisible();

    await page.locator('button:has-text("保存")').click();

    await expect(page.locator('[data-testid="message-area"]')).toContainText('プロンプト内容と差し込みの定義が一致しません。');
    await expect(editor).toBeVisible();

    const inputAddButton = await page.locator('[data-testid="prompt-content-add-button"]');
    await expect(inputAddButton).toBeVisible();
    await inputAddButton.click();

    const inputType = await page.locator('[data-testid="input-type"]');
    await expect(inputType).toBeVisible();
    await inputType.selectOption('boolean');

    const inputName = await page.locator('[data-testid="input-name"]');
    await expect(inputName).toBeVisible();
    await inputName.fill('target_boolean');

    await page.locator('button:has-text("追加")').click();

    await page.locator('button:has-text("保存")').click();

    await expect(page.locator('[data-testid="message-area"]')).toContainText('プロンプトを保存しました');

    const storedData = await serviceWorker.evaluate(async (key: string) => {
      return await chrome.storage.local.get(key);
    }, STORAGE_KEY);
    const prompts = storedData[STORAGE_KEY].prompts;
    expect(prompts.length).toBe(5);
    const updatedPrompt = prompts.find((p: Prompt) => p.content.name === '既存のプロンプト3(入力バリデーションエラー)');
    expect(updatedPrompt).toBeDefined();
    expect(updatedPrompt.content.inputs.length).toBe(1);
    expect(updatedPrompt.content.inputs[0].name).toBe('target_boolean');
    expect(updatedPrompt.content.template).toBe('内容1 {{target_boolean}}');
  });

  test('Happy Path: プロンプトテンプレートの入力追加', async ({ context, extensionUrl, serviceWorker }) => {
    const page = await context.newPage();

    await page.goto(extensionUrl('popup.html'));
    await page.waitForSelector('[data-testid="nexus-prompt"]');
    await page.click('button:has-text("LLMプロンプト管理")');

    await page.locator('.prompt-item:has-text("既存のプロンプト4(入力追加)")').locator('button:has-text("編集")').click();

    // 差し込み(テキスト) 追加 → 削除
    const input = page.locator('[data-testid="basic-input-string"]');
    await expect(input).toBeVisible();
    await input.click();

    await page.locator('[data-testid="input-required"]').selectOption('true');
    await page.locator('[data-testid="input-description"]').fill('説明');
    await page.locator('[data-testid="input-default"]').fill('デフォルト値');

    const addInputButton = page.locator('button:has-text("追加")');
    await expect(addInputButton).toBeVisible();
    await addInputButton.click();

    const editInputButton = page.locator('button:has-text("{{target_string}}")');
    await expect(editInputButton).toBeVisible();
    await editInputButton.click();

    const modalHeader = page.locator('[data-testid="input-modal-header"]');
    await expect(modalHeader).toBeVisible();

    await page.locator('button:has-text("削除")').click();

    // 差し込み(数値) 追加
    const input2 = page.locator('[data-testid="basic-input-number"]');
    await expect(input2).toBeVisible();
    await input2.click();

    const addInputButton2 = page.locator('button:has-text("追加")');
    await expect(addInputButton2).toBeVisible();
    await addInputButton2.click();

    const editInputButton2 = page.locator('button:has-text("{{target_number}}")');
    await expect(editInputButton2).toBeVisible();
    await editInputButton2.click();

    const modalHeader2 = page.locator('[data-testid="input-modal-header"]');
    await expect(modalHeader2).toBeVisible();

    await page.locator('button:has-text("前に移動")').click();

    await page.locator('[data-testid="input-required"]').selectOption('true');
    await page.locator('[data-testid="input-description"]').fill('説明');
    await page.locator('[data-testid="input-default"]').fill('4');

    await page.locator('button:has-text("更新")').click();

    // プロンプトの保存
    await page.locator('button:has-text("保存")').click();

    const storedData = await serviceWorker.evaluate(async (key: string) => {
      return await chrome.storage.local.get(key);
    }, STORAGE_KEY);
    const prompts = storedData[STORAGE_KEY].prompts;
    expect(prompts.length).toBe(5);
    const newPrompt = prompts.find((p: Prompt) => p.content.name === '既存のプロンプト4(入力追加)');
    expect(newPrompt).toBeDefined();
    expect(newPrompt.content.inputs.length).toBe(2);
    expect(newPrompt.content.inputs[0].name).toBe('target_number');
    expect(newPrompt.content.inputs[0].type).toBe('number');
    expect(newPrompt.content.inputs[0].required).toBe(true);
    expect(newPrompt.content.inputs[0].description).toBe('説明');
    expect(newPrompt.content.inputs[0].default).toBe(4);
    expect(newPrompt.content.inputs[1].name).toBe('target_boolean');
    expect(newPrompt.content.inputs[1].type).toBe('boolean');
    expect(newPrompt.content.inputs[1].required).toBe(false);
    expect(newPrompt.content.inputs[1].description).toBe('');
    expect(newPrompt.content.inputs[1].default).toBe(false);
  });

  test('Happy Path: プロンプトテンプレートの入力編集', async ({ context, extensionUrl, serviceWorker }) => {
    const page = await context.newPage();

    await page.goto(extensionUrl('popup.html'));
    await page.waitForSelector('[data-testid="nexus-prompt"]');
    await page.click('button:has-text("LLMプロンプト管理")');

    await page.locator('.prompt-item:has-text("既存のプロンプト5(入力編集)")').locator('button:has-text("編集")').click();

    const editInputButton = page.locator('button:has-text("{{target_number}}")');
    await expect(editInputButton).toBeVisible();
    await editInputButton.click();

    const modalHeader = page.locator('[data-testid="input-modal-header"]');
    await expect(modalHeader).toBeVisible();

    await page.locator('button:has-text("次に移動")').click();

    await page.locator('[data-testid="input-required"]').selectOption('true');
    await page.locator('[data-testid="input-description"]').fill('説明');
    await page.locator('[data-testid="input-default"]').fill('4');

    await page.locator('button:has-text("更新")').click();

    // プロンプトの保存
    await page.locator('button:has-text("保存")').click();

    await expect(page.locator('[data-testid="message-area"]')).toContainText('プロンプトを保存しました');

    const storedData = await serviceWorker.evaluate(async (key: string) => {
      return await chrome.storage.local.get(key);
    }, STORAGE_KEY);
    const prompts = storedData[STORAGE_KEY].prompts;
    expect(prompts.length).toBe(5);
    const updatedPrompt = prompts.find((p: Prompt) => p.content.name === '既存のプロンプト5(入力編集)');
    expect(updatedPrompt).toBeDefined();
    expect(updatedPrompt.content.inputs[1].name).toBe('target_number');
    expect(updatedPrompt.content.inputs[1].type).toBe('number');
    expect(updatedPrompt.content.inputs[1].required).toBe(true);
    expect(updatedPrompt.content.inputs[1].description).toBe('説明');
    expect(updatedPrompt.content.inputs[1].default).toBe(4);
    expect(updatedPrompt.content.inputs[0].name).toBe('target_string');
    expect(updatedPrompt.content.inputs[0].type).toBe('string');
    expect(updatedPrompt.content.inputs[0].required).toBe(false);
    expect(updatedPrompt.content.inputs[0].description).toBe('');
    expect(updatedPrompt.content.inputs[0].default).toBe('デフォルト値');
  });

  test('Sad Path: プロンプト内容が空での保存', async ({ context, extensionUrl, serviceWorker }) => {
    const page = await context.newPage();

    await page.goto(extensionUrl('popup.html'));
    await page.waitForSelector('[data-testid="nexus-prompt"]');
    await page.click('button:has-text("LLMプロンプト管理")');

    await page.click('[data-testid="new-prompt-button"]');

    await page.fill('[data-testid="prompt-name-input"]', 'タイトルのみ');
    // CodeMirror エディタの準備
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
    expect(prompts.length).toBe(5);
  });
}); 
