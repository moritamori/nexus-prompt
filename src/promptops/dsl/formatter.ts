import yaml from 'js-yaml';
import { loadYaml, sortKeysShallow } from './serializer';

// 1) フォーマッター: 浅いキー順ソート（テキスト→テキスト）
export function formatSortKeysShallow(yamlText: string): string {
  const obj = loadYaml(yamlText);
  const normalized = sortKeysShallow(obj);
  // 他のフォーマッタに委ねるため、ここではデフォルト設定でdump
  return yaml.dump(normalized);
}

// 2) フォーマッター: インデント幅を2に固定（テキスト→テキスト）
export function formatIndent2(yamlText: string): string {
  const obj = loadYaml(yamlText);
  return yaml.dump(obj, { indent: 2 });
}

// 3) フォーマッター: 行幅を120に固定（テキスト→テキスト）
export function formatLineWidth120(yamlText: string): string {
  const obj = loadYaml(yamlText);
  return yaml.dump(obj, { lineWidth: 120 });
}
