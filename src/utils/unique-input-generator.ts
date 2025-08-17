import type { PromptInputView } from '../promptops/dsl/prompt/renderer'

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function generateUniqueInputName(
  originalName: string,
  existingInputs: PromptInputView[],
  docText: string
): string {
  console.log('generateUniqueInputName', originalName, existingInputs, docText)
  const baseName = originalName.trim()
  if (!baseName) return baseName

  const isTaken = (candidate: string) => {
    const existsInInputs = existingInputs.some(input => input.name === candidate)
    const existsInDoc = docText
      ? new RegExp(`\\{\\{\\s*${escapeRegExp(candidate)}\\s*\\}\\}`, 'g').test(docText)
      : false
    return existsInInputs || existsInDoc
  }

  if (!isTaken(baseName)) return baseName

  let suffix = 2
  let candidate = `${baseName}${suffix}`
  while (isTaken(candidate)) {
    suffix += 1
    candidate = `${baseName}${suffix}`
    if (suffix > 100) {
      break
    }
  }
  return candidate
}
