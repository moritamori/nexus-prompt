import { LatestPromptDsl } from './registry';
import type { LatestPromptDslType } from './registry';
import { parsePrompt } from './registry';
import type { z } from 'zod';

export type PromptInputType = z.infer<typeof LatestPromptDsl.Input>['type'];

export interface PromptInputView {
  name: string;
  type: PromptInputType;
  required: boolean;
  description?: string;
  defaultValue?: unknown;
  ref?: string;
  tags?: string[];
}

export interface PromptViewModel {
  id: string;
  name: string;
  slug?: string;
  template: string;
  inputs: PromptInputView[];
  model?: LatestPromptDslType['model'];
  controls?: LatestPromptDslType['controls'];
  enums?: LatestPromptDslType['enums'];
  labels?: LatestPromptDslType['labels'];
  metadata?: LatestPromptDslType['metadata'];
  context?: LatestPromptDslType['context'];
  policies?: LatestPromptDslType['policies'];
  tags?: string[];
  frameworkRef?: string;
}

/**
 * Prompt DSL を UI 向けのレンダリング・ビューに変換する純関数
 * - 入力は文字列（YAML/JSON）または既にパース済みオブジェクト
 * - 検証は parsePrompt に委譲
 */
export function createPromptViewModel(input: string | unknown): PromptViewModel {
  const prompt = parsePrompt(input);

  const inputs: PromptInputView[] = (prompt.inputs ?? []).map((inp) => ({
    name: inp.name,
    type: inp.type,
    required: Boolean(inp.required),
    description: inp.description,
    defaultValue: inp.default,
    ref: inp.ref,
  }));

  return {
    id: prompt.id,
    name: prompt.name,
    slug: prompt.slug,
    template: prompt.template,
    inputs,
    model: prompt.model,
    controls: prompt.controls,
    enums: prompt.enums,
    labels: prompt.labels,
    metadata: prompt.metadata,
    context: prompt.context,
    policies: prompt.policies,
    tags: prompt.tags,
    frameworkRef: prompt.frameworkRef,
  };
}

/**
 * UIのPromptViewModelからDSL（LatestPromptDsl）を組み立てる
 * - スキーマで最終検証して返す
 */
export function toPromptDsl(view: PromptViewModel): LatestPromptDslType {
  const inputs = (view.inputs ?? []).map((f) => {
    // オプショナルなプロパティは、値が存在する場合のみ追加し、YAML/JSONがクリーンになるようにする
    return {
      name: f.name,
      type: f.type,
      ...(f.required && { required: true }), // required: false はデフォルトなので省略
      ...(f.ref && { ref: f.ref }),
      ...(f.description && { description: f.description }),
      ...(f.defaultValue !== undefined && { default: f.defaultValue }),
    };
  });

  const candidate = {
    version: LatestPromptDsl.Version,
    id: view.id,
    name: view.name,
    template: view.template,
    // --- Optional fields ---
    // To keep the output clean, only include optional fields if they have a value.
    ...(view.slug && { slug: view.slug }),
    ...(inputs.length > 0 && { inputs }),
    ...(view.model && { model: view.model }),
    ...(view.controls && Object.keys(view.controls).length > 0 && { controls: view.controls }),
    ...(view.enums && Object.keys(view.enums).length > 0 && { enums: view.enums }),
    ...(view.labels && Object.keys(view.labels).length > 0 && { labels: view.labels }),
    ...(view.metadata && Object.keys(view.metadata).length > 0 && { metadata: view.metadata }),
    ...(view.context && Object.keys(view.context).length > 0 && { context: view.context }),
    ...(view.policies && Object.keys(view.policies).length > 0 && { policies: view.policies }),
    ...(view.tags && view.tags.length > 0 && { tags: view.tags }),
    ...(view.frameworkRef && { frameworkRef: view.frameworkRef }),
  };

  return LatestPromptDsl.Schema.parse(candidate);
}
