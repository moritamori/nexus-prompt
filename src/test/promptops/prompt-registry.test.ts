import { describe, it, expect } from 'vitest';
import { parsePrompt, dumpPrompt, LatestPromptDsl } from '../../promptops/dsl/prompt/registry';

describe('prompt registry', () => {
  it('YAML/JSON文字列/オブジェクトの入力を受け取ってv2に正規化して返す', () => {
    const obj = parsePrompt({ version: 2, id: '11111111-1111-1111-8111-111111111111', name: 'p', template: 't' });
    expect(obj.version).toBe(2);
    expect(obj.name).toBe('p');
    const yaml = dumpPrompt(obj);
    expect(typeof yaml).toBe('string');
    expect(LatestPromptDsl.Version).toBe(2);
  });

  it('v1相当の入力をv2へマイグレートする', () => {
    const parsed = parsePrompt({ id: '11111111-1111-1111-8111-111111111111', name: 'p', template: 't' });
    expect(parsed.version).toBe(2);
    expect(parsed.template).toBe('t');
  });
});
