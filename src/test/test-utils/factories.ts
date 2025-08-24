import type { AppData, Framework, Prompt, Provider, SnapshotData } from '../../types';

export const createMockPrompt = (overrides: Partial<Prompt> = {}): Prompt => {
  const resolvedId = overrides.id ? overrides.id : (overrides.content?.id || 'prompt1');
  const iso = new Date().toISOString();

  const content = {
    version: 2 as const,
    name: 'テストプロンプト',
    template: 'テスト内容',
    inputs: [] as any[],
    frameworkRef: 'framework1',
    ...(overrides.content ?? {}),
    id: resolvedId,
  } as Prompt['content'];

  const base: Prompt = {
    id: resolvedId,
    content,
    order: 1,
    createdAt: iso,
    updatedAt: iso,
  } as Prompt;

  const { id: _oid, content: _ocontent, ...rest } = (overrides ?? {}) as any;
  return { ...base, ...rest, id: resolvedId, content } as Prompt;
};

export const createMockFramework = (overrides: Partial<Framework> = {}): Framework => {
  const resolvedId = overrides.id ? overrides.id : (overrides.content?.id || 'framework1');
  const iso = new Date().toISOString();

  const content = {
    version: 2 as const,
    name: 'テストフレームワーク',
    content: 'テスト内容',
    slug: 'test-framework',
    metadata: {},
    ...(overrides.content ?? {}),
    id: resolvedId,
  } as Framework['content'];

  const base: Framework = {
    id: resolvedId,
    content,
    order: 1,
    createdAt: iso,
    updatedAt: iso,
  } as Framework;

  const { id: _oid, content: _ocontent, ...rest } = (overrides ?? {}) as any;
  return { ...base, ...rest, id: resolvedId, content } as Framework;
};

export const createMockProvider = (overrides: Partial<Provider> = {}): Provider => ({
  id: 'provider1',
  name: 'Gemini',
  displayName: 'Google Gemini',
  models: [{ id: 'model1', name: 'gemini-2.0-flash', order: 1, enabled: true, isBuiltIn: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

export const createMockAppData = (overrides: Partial<AppData> = {}): AppData => ({
  providers: [createMockProvider()],
  frameworks: [createMockFramework()],
  prompts: [createMockPrompt()],
  settings: { 
    defaultFrameworkId: 'framework1', 
    initialized: false,
    version: '1.0.0', 
    language: 'ja' 
  },
  ...overrides,
});

export const createMockSnapshotData = (overrides: Partial<SnapshotData> = {}): SnapshotData => ({
  promptPlayground: {
    selectedPromptId: 'prompt1',
    userPrompt: 'ユーザープロンプト',
    inputKeyValues: {},
  },
  promptImprovement: {
    userPrompt: 'ユーザープロンプト',
    selectedPromptId: 'prompt1',
    resultArea: 'テスト結果',
    selectedModelId: 'model1',
  },
  editPrompt: { 
    id: 'prompt1' 
  },
  activeTab: 'main',
  activeScreen: null,
  ...overrides,
});
