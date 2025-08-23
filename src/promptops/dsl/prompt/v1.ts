import { z } from 'zod';
import { Slug, type PromptSchema, EnumGroups, Labels, Test, UuidV1toV6, PromptModelSchema, PromptInputSchema } from './schema';

// Prompt DSL v1 クラス化（v2と同様のインターフェイス: Version/Schema/parse）
export class PromptDslV1 {
  static Version = 1 as const;

  static Model = PromptModelSchema;

  static Input = PromptInputSchema;

  static Schema = z.object({
    version: z.literal(PromptDslV1.Version),
    id: UuidV1toV6,
    name: z.string().min(1),
    slug: Slug.optional(),
    template: z.string().min(1),
    inputs: z.array(PromptDslV1.Input).optional().default([]),
    model: PromptDslV1.Model.optional(),
    // 再現性や実行時の挙動を安定させるための任意コントロール群（例: temperature, top_p など）、モデル共通
    controls: z.record(z.unknown()).optional(),
    enums: EnumGroups.optional(),
    labels: Labels.optional(),
    metadata: z.record(z.unknown()).optional(),
    tests: z.array(Test).optional(),
    context: z.record(z.unknown()).optional(),
    policies: z.record(z.unknown()).optional(),
    tags: z.array(z.string()).optional().default([]),
    // CI/CD でlocksを作成するためのフィールド
    snapshot_with_inputs: z.array(z.unknown()).optional(),
    frameworkRef: z.string().optional(),
  }).strict();

    // 入力はYAML, JSON, TOML文字列または既にパース済みオブジェクトの両対応
  static parse(input: unknown) {
    let obj = input as PromptSchema;
    // v1の初期データはversionプロパティを持たない可能性があるため、存在しない場合はv1として扱う
    if (obj.version === undefined) {
      obj = { ...obj, version: PromptDslV1.Version };
    }

    if (obj.version !== PromptDslV1.Version) {
      throw new Error(`PromptDslV1: Unsupported version: ${obj.version}. Only version 1 is supported.`);
    }
    return PromptDslV1.Schema.parse(obj);
  }
}

export interface PromptDslV1 extends z.infer<typeof PromptDslV1.Schema> {}