import type { LatestPromptDslType } from './registry';

export interface TemplateInputsConsistencyResult {
  missingInTemplate: string[]; // inputs にあるが template に無い
  missingInInputs: string[];   // template にあるが inputs に無い
}

const VARIABLE_REGEX = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

export function extractTemplateVariables(template: string): Set<string> {
  if (!template) return new Set();
  const result = new Set<string>();
  let match: RegExpExecArray | null;
  const re = new RegExp(VARIABLE_REGEX);
  while ((match = re.exec(template)) !== null) {
    const name = match[1];
    if (name) result.add(name);
  }
  return result;
}

export function validateTemplateInputsConsistencyFromDsl(prompt: LatestPromptDslType): TemplateInputsConsistencyResult {
  const template = typeof prompt.template === 'string' ? prompt.template : String(prompt.template ?? '');
  const templateVars = extractTemplateVariables(template);
  const inputNames = new Set<string>((prompt.inputs ?? []).map((i) => i?.name).filter(Boolean) as string[]);
  const missingInInputs = Array.from(templateVars).filter((v) => !inputNames.has(v)).sort();
  const missingInTemplate = Array.from(inputNames).filter((n) => !templateVars.has(n)).sort();
  return { missingInTemplate, missingInInputs };
}

export function validateTemplateInputsConsistency(template: string, inputs: Array<{ name: string }>): TemplateInputsConsistencyResult {
  const templateVars = extractTemplateVariables(template);
  const inputNames = new Set<string>((inputs ?? []).map((i) => i?.name).filter(Boolean) as string[]);
  const missingInInputs = Array.from(templateVars).filter((v) => !inputNames.has(v)).sort();
  const missingInTemplate = Array.from(inputNames).filter((n) => !templateVars.has(n)).sort();
  return { missingInTemplate, missingInInputs };
}

export function hasRemainingPlaceholders(text: string): boolean {
  return extractTemplateVariables(text).size > 0;
}
