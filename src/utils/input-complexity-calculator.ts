export function caluculateComplexity(inputs: { type: string }[]): number {
  if (!inputs) return 0;

  const complexity = inputs.reduce((acc, input) => {
    return acc + (input.type === 'string' ? 2 : 1);
  }, 0);

  return complexity;
}