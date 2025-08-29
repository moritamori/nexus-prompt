import yaml from 'js-yaml';

// 共通シリアライザ: YAML load/dump + 差分安定のための正規化

export function loadYaml(text: string): unknown {
  return yaml.load(text);
}

// キー順を安定化させる（浅いレベルのソート）。必要なら深い正規化を拡張
// GitHubレビューで読みやすい順序（DSLの想定フィールド順）
// 未知のキーはこの順の後にアルファベット順で続く
const PREFERRED_PROMPT_KEYS = [
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

const defaultPriority = buildPriorityMap(PREFERRED_PROMPT_KEYS);

export function sortKeysShallow(
  obj: unknown,
  preferredOrder: readonly string[] = PREFERRED_PROMPT_KEYS,
): unknown {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;

  const priority = preferredOrder === PREFERRED_PROMPT_KEYS
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

export function dumpYamlStable(obj: unknown): string {
  const normalized = sortKeysShallow(obj, PREFERRED_PROMPT_KEYS);
  return yaml.dump(normalized, { indent: 2, lineWidth: 120 });
}
