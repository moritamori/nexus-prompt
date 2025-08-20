export function copyToClipboard(text: string, textarea: HTMLTextAreaElement | null, showToast: (message: string, type: 'success' | 'error') => void): void {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text)
      .then(() => {
        showToast('クリップボードにコピーしました', 'success');
      })
      .catch((err) => {
        console.warn('クリップボードへのコピーに失敗:', err);
        textarea && fallbackCopy(text, textarea, showToast);
      });
   } else {
    textarea && fallbackCopy(text, textarea, showToast);
   }
}

function fallbackCopy(text: string, textarea: HTMLTextAreaElement, showToast: (message: string, type: 'success' | 'error') => void): void {
  if (textarea) {
    textarea.value = text;
    textarea.select();
    try {
      document.execCommand('copy');
      showToast('クリップボードにコピーしました', 'success');
    } catch (err) {
      console.warn('コピーに失敗:', err);
      showToast('コピーに失敗しました', 'error');
    }
  }
}