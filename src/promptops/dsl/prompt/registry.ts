import { z } from 'zod';
import { PromptDslV2 } from './v2';
import { dumpYamlStable, loadYaml } from '../serializer';

export const LatestPromptDsl = PromptDslV2;
export type LatestPromptDslType = z.infer<typeof PromptDslV2.Schema>;

// 入力はYAML, JSON, TOML文字列または既にパース済みオブジェクトの両対応
export function parsePrompt(input: string| unknown): LatestPromptDslType {
  const obj = typeof input === 'string' ? loadYaml(input) : input;
  return PromptDslV2.parse(obj);
}

export function dumpPrompt(prompt: LatestPromptDslType): string {
  return dumpYamlStable(prompt);
}
