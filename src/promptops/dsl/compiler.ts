import type { LatestPromptDslType } from './prompt/registry';

export interface CompileOptions {
  // テンプレ埋め込み用の変数（UIやCLIから渡される任意値）
  variables?: Record<string, unknown>;
}

export function compilePromptToString(
  prompt: LatestPromptDslType,
  options: CompileOptions = {}
): string {
  const baseTemplate = typeof prompt.template === 'string' ? prompt.template : String(prompt.template);
  return fillTemplateVariables(baseTemplate, prompt, options.variables);
}

function fillTemplateVariables(
  template: string,
  prompt: LatestPromptDslType,
  provided?: Record<string, unknown>
): string {
  if (!provided || Object.keys(provided).length === 0) {
    // default だけで埋め込みを試みる
    const defaultsOnly = collectDefaultValues(prompt);
    return replaceTemplate(template, defaultsOnly);
  }

  const defaults = collectDefaultValues(prompt);
  const providedStr: Record<string, string> = {};
  for (const [k, v] of Object.entries(provided)) {
    // undefined は無視、null は 'null' にせず空文字に変換（誤展開防止）
    if (v === undefined) continue;
    if (v === null) { providedStr[k] = ''; continue; }
    providedStr[k] = String(v);
  }
  const values = { ...defaults, ...providedStr };
  return replaceTemplate(template, values);
}

function collectDefaultValues(prompt: LatestPromptDslType): Record<string, string> {
  const defaults: Record<string, string> = {};
  if (Array.isArray(prompt.inputs)) {
    for (const input of prompt.inputs) {
      if (!input?.name) continue;
      if (input.default !== undefined && input.default !== null) {
        defaults[input.name] = String(input.default);
      }
    }
  }
  return defaults;
}

function replaceTemplate(template: string, values: Record<string, string>): string {
  if (!values || Object.keys(values).length === 0) return template;
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (m, key: string) => {
    return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : m;
  });
}
