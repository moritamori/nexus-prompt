import { appData, showToast } from '../stores';

export function movePrompt(promptId: string, direction: 'up' | 'down'): void {
  appData.update((current) => {
    if (!current) return null;
    const promptsSorted = [...(current.prompts ?? [])].sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0)
    );
    const index = promptsSorted.findIndex((p) => p.id === promptId);
    if (index < 0) return current;
    if (direction === 'up' && index === 0) return current;
    if (direction === 'down' && index === promptsSorted.length - 1) return current;

    const swapWithIndex = direction === 'up' ? index - 1 : index + 1;
    const a = promptsSorted[index];
    const b = promptsSorted[swapWithIndex];

    const tempOrder = a.order ?? 0;
    a.order = b.order ?? 0;
    b.order = tempOrder;

    return current;
  });
  showToast('並び替えを保存しました', 'success');
}
