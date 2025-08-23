import { z } from 'zod';
import { Slug, type PromptSchema, EnumGroups, Labels, Test, UuidV1toV6, PromptModelSchema, PromptInputSchema } from './schema';
import { PromptDslV1 } from './v1';

// Prompt DSL v2 クラス: Schema/parseを集約
export class PromptDslV2 {
  static Version = 2 as const;
  static Model = PromptModelSchema;

  static Input = PromptInputSchema;

  static Schema = z.object({
    version: z.literal(PromptDslV2.Version),
    id: UuidV1toV6,
    name: z.string().min(1),
    slug: Slug.optional(),
    template: z.string().min(1),
    inputs: z.array(PromptDslV2.Input).optional().default([]),
    model: PromptDslV2.Model.optional(),
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
  }).strip();

  static parse(input: unknown) {
    let obj = input as PromptSchema;
   // v1はversionプロパティを持たない可能性があるため、存在チェックも行う
   const version = obj.version ?? 1;

    if (version === 1) {

      obj = {
        ...PromptDslV1.parse(input),
        version: 2,
      };
    } else if (version !== PromptDslV2.Version) {
      throw new Error(`Unsupported prompt version: ${version}`);
    }
    return PromptDslV2.Schema.parse(obj);
  }
}

export interface PromptDslV2 extends z.infer<typeof PromptDslV2.Schema> {}
