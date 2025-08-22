import type { LatestPromptDsl } from './promptops/dsl/prompt/registry';
import type { LatestFrameworkDsl } from './promptops/dsl/framework/registry';

export interface Prompt {
  id: string;
  content: LatestPromptDsl;
  order: number;
  shared: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Framework {
  id: string;
  content: LatestFrameworkDsl;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  order: number;
  enabled: boolean;
  isBuiltIn: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Provider {
  id: string;
  name: string;
  displayName: string;
  models: ModelInfo[];
  createdAt: string;
  updatedAt: string;
}

export interface Settings {
  defaultFrameworkId: string;
  language: string;
  version: string;
}

export interface AppData {
  providers: Provider[];
  prompts: Prompt[];
  frameworks: Framework[];
  settings: Settings;
}

export interface SnapshotData {
  promptPlayground: {
    selectedPromptId: string;
    userPrompt: string;
    inputKeyValues: Record<string, unknown>;
  };
  promptImprovement: {
    userPrompt: string;
    selectedPromptId: string;
    resultArea: string;
    selectedModelId: string;
  };
  editPrompt: {
    id: string | null;
  };
  activeTab: 'main' | 'prompt-improvement' | 'prompts' | 'settings';
  activeScreen: 'frameworks' | 'data-management' | null;
}

export interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text: string;
      }>;
    };
  }>;
}

export interface OpenAIResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

export interface AnthropicResponse {
  content: Array<{
    text: string;
  }>;
}

export interface Api {
  generateContent(prompt: string, apiKey: string, modelName: string): Promise<string>;
  improvePrompt(userPrompt: string, selectedPrompt: string, frameworkContent: string, apiKey: string, modelName: string): Promise<string>;
}

export type MessageType = 'success' | 'error' | 'info'; 
