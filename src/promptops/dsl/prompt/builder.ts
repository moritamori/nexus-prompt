export function buildPrompt(template: string, inputs: Record<string, unknown>): string {
  let builtPrompt = template;
  if (!inputs) {
    return builtPrompt;
  }
  for (const [key, value] of Object.entries(inputs)) {
    const placeholderRegex = new RegExp(`\{\{\s*${key}\s*\}\}`, 'g');
    const v = value === 'true' ? 'はい' : value === 'false' ? 'いいえ' : value;
    builtPrompt = builtPrompt.replace(placeholderRegex, String(v ?? ''));
  }
  return builtPrompt;
}
