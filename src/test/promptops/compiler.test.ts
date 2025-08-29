import { describe, it, expect } from 'vitest';
import { compilePromptToString } from '../../promptops/dsl/compiler';
import type { LatestPromptDslType } from '../../promptops/dsl/prompt/registry';

const basePrompt = (overrides: Partial<LatestPromptDslType> = {}): LatestPromptDslType => ({
  version: 2,
  id: '123e4567-e89b-12d3-a456-426614174000',
  name: 'compile-test',
  template: 'Hello {{name}} of {{team}}! Extra: {{unknown}}',
  inputs: [
    { name: 'name', type: 'string', default: 'Alice', required: true },
    { name: 'team', type: 'string', required: true },
  ],
  tags: [],
  ...overrides,
});

describe('compilePromptToString', () => {
  it('defaultsのみで埋め込む（providedなし）', () => {
    const p = basePrompt();
    const rendered = compilePromptToString(p);
    expect(rendered).toBe('Hello Alice of {{team}}! Extra: {{unknown}}');
  });

  it('providedでdefaultsを上書きする', () => {
    const p = basePrompt();
    const rendered = compilePromptToString(p, { variables: { team: 'Platform', name: 'Bob' } });
    expect(rendered).toBe('Hello Bob of Platform! Extra: {{unknown}}');
  });

  it('nullは空文字、undefinedは無視される', () => {
    const p = basePrompt();
    const rendered = compilePromptToString(p, { variables: { team: null as unknown as string, name: undefined as unknown as string } });
    expect(rendered).toBe('Hello Alice of ! Extra: {{unknown}}');
  });

  it('非文字列は文字列化して展開される', () => {
    const p = basePrompt();
    const rendered = compilePromptToString(p, { variables: { team: 123, name: true } });
    expect(rendered).toBe('Hello true of 123! Extra: {{unknown}}');
  });
});
