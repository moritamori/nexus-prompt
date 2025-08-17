// src/lib/actions/palette.ts
export type EditorRef = {
    insertTextAtCursor?: (text: string, type: string) => void;
  } | undefined | null;
  

/**
 * use:dragStart
 * - 要素を draggable にし、Drag&Drop で 'text/plain' を渡す
 * 使い方: <div use:dragStart={text} />
 */
export function dragStart(node: HTMLElement, text: string) {
  node.setAttribute('draggable', 'true');

  function onDragStart(e: DragEvent) {
    if (!text) return;
    // ドロップ側で type を認識できるよう、カスタム MIME に data-type を入れる
    const type = node.getAttribute('data-type') ?? ''
    e.dataTransfer?.setData('text/plain', text);
    if (type) {
      try {
        e.dataTransfer?.setData('application/x-codemirror-input', type)
      } catch {}
    }
  }

  node.addEventListener('dragstart', onDragStart);

  return {
    update(newText: string) {
      text = newText;
    },
    destroy() {
      node.removeEventListener('dragstart', onDragStart);
    }
  };
}

/**
 * use:clickDraggable
 * - クリック時に editorRef.insertTextAtCursor(text) を実行
 * 使い方: <div use:clickDraggable={{ text, editorRef }} />
 * - editorRef がない場合、insert コールバックで差し替え可
 */
export function clickDraggable(
  node: HTMLElement,
  params: { text: string; editorRef?: EditorRef; insert?: (t: string) => void }
) {
  let { text, editorRef, insert } = params ?? {};

  function onClick() {
    const type = node.getAttribute('data-type') ?? ''
    if (!type) {
      return;
    }
    try {
      if (insert) {
        insert(text);
      } else {
        editorRef?.insertTextAtCursor?.(text, type);
      }
    } catch (e) {
      console.warn('palette click insert failed', e);
    }
  }

  node.addEventListener('click', onClick);

  return {
    update(p: { text: string; editorRef?: EditorRef; insert?: (t: string) => void }) {
      ({ text, editorRef, insert } = p ?? {});
    },
    destroy() {
      node.removeEventListener('click', onClick);
    }
  };
}

/**
 * ドラッグ状態ハンドラを生成（コンポーネント側の状態更新関数を受け取る）
 * basic.svelte などで ondragstart/ondragend に渡して利用
 */
export function onDragStartLocal(setIsDragging: (v: boolean) => void) {
  return (_e?: DragEvent) => setIsDragging(true);
}

export function onDragEndLocal(setIsDragging: (v: boolean) => void) {
  return (_e?: DragEvent) => setIsDragging(false);
}
  
