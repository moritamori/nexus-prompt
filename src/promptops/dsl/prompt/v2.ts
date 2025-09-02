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
    const parsed = PromptDslV2.Schema.parse(obj);

    // inputs 内のキー順を schema 定義順に固定
    const inputKeyOrder = Object.keys(PromptInputSchema.shape);
    const orderInput = (item: Record<string, unknown>) => {
      const entries = Object.entries(item);
      entries.sort(([a], [b]) => {
        const ai = inputKeyOrder.indexOf(a);
        const bi = inputKeyOrder.indexOf(b);
        const av = ai === -1 ? Number.POSITIVE_INFINITY : ai;
        const bv = bi === -1 ? Number.POSITIVE_INFINITY : bi;
        if (av !== bv) return av - bv;
        return a.localeCompare(b);
      });
      const out: Record<string, unknown> = {};
      for (const [k, v] of entries) out[k] = v;
      return out;
    };

    const inputsOrdered = (parsed.inputs ?? []).map((i) =>
      (i && typeof i === 'object' && !Array.isArray(i))
        ? (orderInput(i as Record<string, unknown>) as any)
        : i
    );
    return { ...parsed, inputs: inputsOrdered } as any;
  }
}

export interface PromptDslV2 extends z.infer<typeof PromptDslV2.Schema> {}
