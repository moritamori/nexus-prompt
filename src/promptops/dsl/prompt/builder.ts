export function buildPrompt(template: string, inputs: Record<string, unknown>): string {
  let builtPrompt = template;
  if (!inputs) {
    return builtPrompt;
  }
  for (const [key, value] of Object.entries(inputs)) {
    const placeholderRegex = new RegExp(`\{\{\s*${key}\s*\}\}`, 'g');
    builtPrompt = builtPrompt.replace(placeholderRegex, String(value ?? ''));
  }
  return builtPrompt;
}
