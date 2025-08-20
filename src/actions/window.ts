export function scrollToBottom(): void {
  const scrollTarget = Math.max(
    document.documentElement?.scrollHeight ?? 0,
    document.body?.scrollHeight ?? 0,
    document.documentElement?.offsetHeight ?? 0,
    document.body?.offsetHeight ?? 0
  );
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.scrollTo({ top: scrollTarget, behavior: 'smooth' });
    });
  });
}