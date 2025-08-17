import { ViewPlugin, Decoration, EditorView } from '@codemirror/view'
import { RangeSetBuilder } from '@codemirror/state'
import type { ViewUpdate } from '@codemirror/view'
import type { DecorationSet } from '@codemirror/view'

// プレースホルダーのパターン
const inputPattern = /\{\{[^}]+\}\}/g

// 内部（エディタ内）のドラッグ中フラグ（フォールバック抑止用）
export let internalDragInProgress = false

// プロンプトエディター内部でのドラッグ&ドロップを実現するためのプラグイン
export class InputDraggablePlugin {
  public decorations: DecorationSet
  private observer: MutationObserver | null = null
  private view?: EditorView
  private keydownHandler: ((event: KeyboardEvent) => void) | null = null

  constructor(view: EditorView) {
    this.decorations = this.buildDecorations(view)
    this.setupDraggableObserver(view)
    this.makeDraggable(view)
    this.setupKeyboardListener(view)
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = this.buildDecorations(update.view)
      this.makeDraggable(update.view)
    }
  }

  // DOM要素を監視してdraggable属性を設定
  private setupDraggableObserver(view: EditorView) {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if ((node as Element).nodeType === 1) {
              this.processDraggableElements(node as Element, view)
            }
          })
        } else if (mutation.type === 'attributes' && (mutation as MutationRecord).attributeName === 'draggable') {
          const target = mutation.target as HTMLElement
          if (target.classList && target.classList.contains('cm-input-draggable')) {
            if ((target as any).draggable === false) {
              ;(target as any).draggable = true
            }
          }
        }
      })
    })

    observer.observe(view.dom, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['draggable']
    })

    this.observer = observer
    this.view = view
  }

  // 要素をドラッグ可能にする
  private processDraggableElements(element: Element, view: EditorView) {
    if (element.classList && element.classList.contains('cm-input-draggable')) {
      this.setupDraggableElement(element as HTMLElement, view)
    }
    element.querySelectorAll?.('.cm-input-draggable')?.forEach((el) => {
      this.setupDraggableElement(el as HTMLElement, view)
    })
  }

  // 個別の要素をドラッグ可能にして、イベントリスナーを追加
  private setupDraggableElement(el: HTMLElement, view?: EditorView) {
    if (!el.hasAttribute('data-drag-setup')) {
      Object.defineProperty(el as any, 'draggable', {
        value: true,
        writable: false,
        configurable: true
      })

      el.style.cursor = 'pointer'
      el.style.userSelect = 'none'
      ;(el.style as any).WebkitUserSelect = 'none'
      ;(el.style as any).MozUserSelect = 'none'
      ;(el.style as any).msUserSelect = 'none'
      ;(el.style as any).WebkitUserDrag = 'element'

      el.setAttribute('data-drag-setup', 'true')

      const editorView = view || this.view

      el.addEventListener(
        'mousedown',
        (event: MouseEvent) => {
          if (!event.shiftKey) {
            event.preventDefault()
            event.stopPropagation()
            event.stopImmediatePropagation()

            if (window.getSelection) {
              window.getSelection()?.empty()
            }

            this.handleCustomDrag(event, el, editorView)
          }
        },
        true
      )

      const handleDragStart = (event: DragEvent) => {
        // mousedown でカスタムドラッグを実装しているため、ネイティブの dragstart はキャンセルする
        // ただし、外部へのドラッグなど将来的な拡張のためにロジックは残しておく
        // event.preventDefault()

        const input = el.textContent || ''
        const editorView = view || this.view

        if (editorView) {
          const pos = editorView.posAtDOM(el)
          if (pos !== null) {
            const doc = editorView.state.doc.toString()
            const inputIndex = doc.indexOf(input, Math.max(0, pos - input.length))

            if (inputIndex !== -1) {
              const from = inputIndex
              const to = from + input.length

              this.prepareDataTransferWithGhost(event, el, input, from, to)

              el.classList.add('cm-dragging')
              internalDragInProgress = true
              return
            }
          }
        }

        const from = parseInt(el.getAttribute('data-from') || 'NaN')
        const to = parseInt(el.getAttribute('data-to') || 'NaN')

        if (!input || Number.isNaN(from) || Number.isNaN(to)) {
          return
        }

        this.prepareDataTransferWithGhost(event, el, input, from, to)

        el.classList.add('cm-dragging')
        internalDragInProgress = true
      }

      el.addEventListener('dragstart', handleDragStart, true)

      el.addEventListener('dragend', () => {
        el.classList.remove('cm-dragging')
        internalDragInProgress = false
      })

      el.addEventListener('click', (event: MouseEvent) => {
        event.preventDefault()
        event.stopPropagation()

        const editorView = view || this.view
        if (editorView) {
          const pos = editorView.posAtDOM(el)
          if (pos !== null) {
            editorView.dispatch({
              selection: { anchor: pos, head: pos }
            })
            editorView.focus()
          }
        }
      })

      // ダブルクリックで編集リクエストイベントを発火
      el.addEventListener(
        'dblclick',
        (event: MouseEvent) => {
          event.preventDefault()
          event.stopPropagation()

          const raw = el.textContent || ''
          const name = raw.replace(/^\{\{\s*/, '').replace(/\s*\}\}$/, '').trim()
          if (!name) return

          const editorView = view || this.view
          if (editorView) {
            const ev = new CustomEvent('cm-input-open', {
              detail: { name },
              bubbles: true,
              composed: true
            })

            // スパン要素から発火してバブリングで editor の DOM へ到達させる
            el.dispatchEvent(ev)
          }
        },
        true
      )
    }
  }

  // mousedown ベースのカスタムドラッグ処理
  private handleCustomDrag(event: MouseEvent, el: HTMLElement, editorView?: EditorView) {
    if (!editorView) return

    const input = el.textContent || ''
    const pos = editorView.posAtDOM(el)
    if (pos === null) return

    const doc = editorView.state.doc.toString()
    const inputIndex = doc.indexOf(input, Math.max(0, pos - input.length))
    if (inputIndex === -1) return

    const dragData = {
      input,
      from: inputIndex,
      to: inputIndex + input.length
    }

    internalDragInProgress = true
    el.classList.add('cm-dragging')

    const ghost = this.createGhostElement(input, getComputedStyle(el).fontFamily, 'fixed-follow')
    ghost.style.left = `${event.clientX + 10}px`
    ghost.style.top = `${event.clientY + 10}px`
    document.body.appendChild(ghost)

    const handleMouseMove = (e: MouseEvent) => {
      ghost.style.left = `${e.clientX + 10}px`
      ghost.style.top = `${e.clientY + 10}px`
    }

    const handleMouseUp = (e: MouseEvent) => {
      // Clean up listeners and state
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      internalDragInProgress = false
      el.classList.remove('cm-dragging')
      if (ghost.parentNode) {
        ghost.parentNode.removeChild(ghost)
      }

      // Apply changes to the editor
      const dropPos = editorView.posAtCoords({ x: e.clientX, y: e.clientY })
      if (dropPos !== null && (dropPos < dragData.from || dropPos > dragData.to)) {
        const doc = editorView.state.doc
        const movedText = dragData.input
        const currentContent = doc.toString()

        let newContent: string
        let newCursorPos: number

        if (dropPos < dragData.from) {
          const before = currentContent.slice(0, dropPos)
          const middle = currentContent.slice(dropPos, dragData.from)
          const after = currentContent.slice(dragData.to)
          newContent = before + movedText + middle + after
          newCursorPos = dropPos + movedText.length
        } else {
          const before = currentContent.slice(0, dragData.from)
          const middle = currentContent.slice(dragData.to, dropPos)
          const after = currentContent.slice(dropPos)
          newContent = before + middle + movedText + after
          newCursorPos = dropPos - (dragData.to - dragData.from) + movedText.length
        }

        editorView.dispatch({
          changes: { from: 0, to: currentContent.length, insert: newContent },
          selection: { anchor: newCursorPos }
        })
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  // 既存のプレースホルダーをドラッグ可能にする
  private makeDraggable(view: EditorView) {
    // DOMの更新が反映された後に要素をセットアップするため、requestMeasure を使用する。
    // これにより、不要な再描画を防ぎ、より効率的にDOM操作を行える。
    view.requestMeasure({
      read: () => {
        // 読み取りフェーズ: DOMから要素をクエリする
        return Array.from(view.dom.querySelectorAll('.cm-input-draggable'))
      },
      write: (elements) => {
        // 書き込みフェーズ: 読み取った要素にイベントリスナーなどを設定する
        elements.forEach((el) => this.setupDraggableElement(el as HTMLElement, view))
      }
    })
  }

  private buildDecorations(view: EditorView): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>()
    let count = 0
    for (const range of view.visibleRanges) {
      const { from, to } = range
      const text = view.state.doc.sliceString(from, to)
      inputPattern.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = inputPattern.exec(text)) !== null) {
        const mFrom = from + match.index
        const mTo = mFrom + match[0].length
        builder.add(
          mFrom,
          mTo,
          Decoration.mark({
            class: 'cm-input-draggable',
            tagName: 'span',
            attributes: {
              'data-input': match[0],
              'data-from': mFrom.toString(),
              'data-to': mTo.toString()
            }
          })
        )
        count++
      }
    }

    const deco = builder.finish()
    // Ensure newly created elements get drag behavior
    // Decorationの適用後、同様に requestMeasure を使って安全に要素をセットアップする
    view.requestMeasure({
      read: () => {
        return Array.from(view.dom.querySelectorAll('.cm-input-draggable'))
      },
      write: (elements) => {
        elements.forEach((el) => {
          this.setupDraggableElement(el as HTMLElement, view)
        })
      }
    })
    
    return deco
  }

  // ゴースト要素（ドラッグ中の見た目用）を生成
  private createGhostElement(text: string, fontFamily: string, mode: 'fixed-follow' | 'offscreen'): HTMLDivElement {
    const ghost = document.createElement('div')
    ghost.textContent = text
    ghost.style.padding = '4px 8px'
    ghost.style.backgroundColor = '#f0f0f0'
    ghost.style.color = '#333'
    ghost.style.border = '1px solid #ccc'
    ghost.style.borderRadius = '4px'
    ghost.style.fontSize = '14px'
    ghost.style.fontFamily = fontFamily
    ghost.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)'

    if (mode === 'fixed-follow') {
      ghost.style.position = 'fixed'
      ghost.style.pointerEvents = 'none'
      ghost.style.zIndex = '10000'
      ghost.style.opacity = '0.8'
    } else {
      // 'offscreen'
      ghost.style.position = 'absolute'
      ghost.style.left = '-1000px'
    }

    return ghost
  }

  // DataTransfer に必要データをセットし、ドラッグイメージ（ゴースト）を組み立て
  private prepareDataTransferWithGhost(event: DragEvent, el: HTMLElement, input: string, from: number, to: number) {
    if (!event.dataTransfer) return
    event.dataTransfer.effectAllowed = 'move'
    // 内部DnD識別用 MIME
    event.dataTransfer.setData('application/x-codemirror-input-internal', JSON.stringify({ from, to }))

    const ghost = this.createGhostElement(input, getComputedStyle(el).fontFamily, 'offscreen')
    document.body.appendChild(ghost)
    try {
      event.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, ghost.offsetHeight / 2)
    } finally {
      window.setTimeout(() => document.body.removeChild(ghost), 0)
    }
  }

  // キーボードイベントを監視してDEL/BACKSPACEでのプレースホルダー削除を処理
  private setupKeyboardListener(view: EditorView) {
    this.keydownHandler = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return

      const selection = view.state.selection.main
      const pos = selection.from

      // 可視範囲に構築されたDecorationから、カーソル付近のプレースホルダーのみを探索
      let target: { from: number; to: number } = { from: 0, to: 0 }
      // between は半開区間に注意。近傍1文字を含めて走査
      this.decorations.between(Math.max(0, pos - 1), pos + 1, (from, to, _dec) => {
        if (pos >= from && pos <= to) {
          target = { from, to }
        }
      })

      if (target.from === 0 && target.to === 0) return

      const placeholderStart = target.from
      const placeholderEnd = target.to

      let shouldDeletePlaceholder = false
      if (event.key === 'Delete') {
        // DEL: カーソル位置がプレースホルダー内
        if (pos >= placeholderStart && pos < placeholderEnd) shouldDeletePlaceholder = true
      } else {
        // Backspace: カーソル位置がプレースホルダー内または直後
        if (pos > placeholderStart && pos <= placeholderEnd) shouldDeletePlaceholder = true
      }

      if (!shouldDeletePlaceholder) return

      event.preventDefault()
      event.stopPropagation()

      // プレースホルダー全体を削除し、カーソルを先頭へ
      const deletedText = view.state.doc.sliceString(placeholderStart, placeholderEnd)
      view.dispatch({
        changes: { from: placeholderStart, to: placeholderEnd, insert: '' },
        selection: { anchor: placeholderStart }
      })

      // 親（Svelte 側）へ削除通知イベントを発火
      try {
        const name = (deletedText || '')
          .replace(/^\{\{\s*/, '')
          .replace(/\s*\}\}$/, '')
          .trim()
        if (name) {
          const ev = new CustomEvent('cm-input-delete', { detail: { name } })
          view.dom.dispatchEvent(ev)
        }
      } catch (_) {
        // noop
      }
    }
    
    view.dom.addEventListener('keydown', this.keydownHandler, true)
    
    // クリーンアップのために参照を保存
    if (!this.view) {
      this.view = view
    }
  }

  destroy() {
    if (this.observer) {
      this.observer.disconnect()
      this.observer = null
    }
    
    // キーボードイベントリスナーをクリーンアップ
    if (this.view && this.keydownHandler) {
      this.view.dom.removeEventListener('keydown', this.keydownHandler, true)
      this.keydownHandler = null
    }
  }
}

export const inputPlugin = ViewPlugin.fromClass(InputDraggablePlugin, {
  decorations: (v) => v.decorations
})
