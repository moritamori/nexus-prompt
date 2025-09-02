import yaml from 'js-yaml';
import { PromptInputSchema } from './prompt/schema';

// 共通シリアライザ: YAML load/dump + 差分安定のための正規化

export function loadYaml(text: string): unknown {
  return yaml.load(text);
}

// キー順を安定化させる（浅いレベルのソート）。必要なら深い正規化を拡張
// GitHubレビューで読みやすい順序（DSLの想定フィールド順）
// 未知のキーはこの順の後にアルファベット順で続く
const PREFERRED_KEYS = [
  'version',
  'id',
  'name',
  'slug',
  'template',
  'inputs',
  'model',
  'controls',
  'enums',
  'labels',
  'metadata',
  'tests',
  'context',
  'policies',
  'tags',
  'snapshot_with_inputs',
  'frameworkRef',
] as const;

function buildPriorityMap(order: readonly string[]) {
  const map = new Map<string, number>();
  order.forEach((k, i) => map.set(k, i));
  return map;
}

const defaultPriority = buildPriorityMap(PREFERRED_KEYS);

export function sortKeysShallow(
  obj: unknown,
  preferredOrder: readonly string[] = PREFERRED_KEYS,
): unknown {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;

  const priority = preferredOrder === PREFERRED_KEYS
    ? defaultPriority
    : buildPriorityMap(preferredOrder);

  const entries = Object.entries(obj as Record<string, unknown>);
  entries.sort(([a], [b]) => {
    const ai = priority.has(a) ? (priority.get(a) as number) : Number.POSITIVE_INFINITY;
    const bi = priority.has(b) ? (priority.get(b) as number) : Number.POSITIVE_INFINITY;
    if (ai !== bi) return ai - bi;
    return a.localeCompare(b);
  });

  const out: Record<string, unknown> = {};
  for (const [k, v] of entries) out[k] = v;
  return out;
}

// Prompt v2 専用: inputs 配列内のオブジェクトもキー順を固定
const INPUT_KEY_ORDER: readonly string[] = Object.keys(PromptInputSchema.shape);

function orderObjectByKeys(
  obj: Record<string, unknown>,
  order: readonly string[],
): Record<string, unknown> {
  const priority = buildPriorityMap(order);
  const entries = Object.entries(obj);
  entries.sort(([a], [b]) => {
    const ai = priority.has(a) ? (priority.get(a) as number) : Number.POSITIVE_INFINITY;
    const bi = priority.has(b) ? (priority.get(b) as number) : Number.POSITIVE_INFINITY;
    if (ai !== bi) return ai - bi;
    return a.localeCompare(b);
  });
  const out: Record<string, unknown> = {};
  for (const [k, v] of entries) out[k] = v;
  return out;
}

function normalizePromptNested(obj: unknown): unknown {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const root = obj as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(root)) {
    if (k === 'inputs' && Array.isArray(v)) {
      const normalizedInputs = v.map((item) => {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          return orderObjectByKeys(item as Record<string, unknown>, INPUT_KEY_ORDER);
        }
        return item;
      });
      out[k] = normalizedInputs;
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function dumpYamlStable(obj: unknown): string {
  // 1) ネスト（inputs配列要素）のキー順を先に固定
  const nestedNormalized = normalizePromptNested(obj);
  // 2) ルートのキー順を固定
  const normalized = sortKeysShallow(nestedNormalized, PREFERRED_KEYS);
  return yaml.dump(normalized, { indent: 2, lineWidth: 120 });
}
