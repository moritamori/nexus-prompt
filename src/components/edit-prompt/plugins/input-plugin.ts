import { ViewPlugin, Decoration, EditorView } from '@codemirror/view'
import { RangeSetBuilder } from '@codemirror/state'
import type { ViewUpdate } from '@codemirror/view'
import type { DecorationSet } from '@codemirror/view'

// プレースホルダーのパターン
const inputPattern = /\{\{[^}]+\}\}/g

// プロンプトエディター内部でのドラッグ&ドロップを実現するためのプラグイン
export class InputDraggablePlugin {
  public decorations: DecorationSet
  private observer: MutationObserver | null = null
  private view?: EditorView

  constructor(view: EditorView) {
    this.decorations = this.buildDecorations(view)
    this.setupDraggableObserver(view)
    this.makeDraggable(view)
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged) {
      console.debug('[InputDraggablePlugin] update triggered', {
        docChanged: update.docChanged,
        viewportChanged: update.viewportChanged
      })
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
              console.log('[InputDraggablePlugin] draggable was set to false, restoring')
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
      ;(el.style as any).userModify = 'read-only'
      ;(el.style as any).WebkitUserModify = 'read-only'

      el.setAttribute('data-drag-setup', 'true')
      el.setAttribute('contenteditable', 'false')

      const editorView = view || this.view

      let isDragging = false
      let dragData: { input: string; from: number; to: number } | null = null

      el.addEventListener(
        'mousedown',
        (event: MouseEvent) => {
          console.log('[InputDraggablePlugin] mousedown on element', el.textContent)
          if (!event.shiftKey) {
            event.preventDefault()
            event.stopPropagation()
            event.stopImmediatePropagation()

            if (window.getSelection) {
              window.getSelection()?.removeAllRanges()
            }

            const input = el.textContent || ''
            if (editorView) {
              const pos = editorView.posAtDOM(el)
              if (pos !== null) {
                const doc = editorView.state.doc.toString()
                const inputIndex = doc.indexOf(input, Math.max(0, pos - input.length))

                if (inputIndex !== -1) {
                  dragData = {
                    input,
                    from: inputIndex,
                    to: inputIndex + input.length
                  }

                  isDragging = true
                  el.classList.add('cm-dragging')

                  const ghost = this.createGhostElement(input, getComputedStyle(el).fontFamily, 'fixed-follow')
                  ghost.style.left = `${(event as MouseEvent).clientX + 10}px`
                  ghost.style.top = `${(event as MouseEvent).clientY + 10}px`
                  document.body.appendChild(ghost)

                  const handleMouseMove = (e: MouseEvent) => {
                    if (ghost) {
                      ghost.style.left = `${e.clientX + 10}px`
                      ghost.style.top = `${e.clientY + 10}px`
                    }
                  }

                  const handleMouseUp = (e: MouseEvent) => {
                    if (isDragging && dragData) {
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

                    isDragging = false
                    dragData = null
                    el.classList.remove('cm-dragging')
                    if (ghost && ghost.parentNode) {
                      ghost.parentNode.removeChild(ghost)
                    }
                    document.removeEventListener('mousemove', handleMouseMove)
                    document.removeEventListener('mouseup', handleMouseUp)
                  }

                  document.addEventListener('mousemove', handleMouseMove)
                  document.addEventListener('mouseup', handleMouseUp)
                }
              }
            }
          }
        },
        true
      )

      const handleDragStart = (event: DragEvent) => {
        console.log('[InputDraggablePlugin] dragstart fired directly', el.textContent)

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

              console.log('[InputDraggablePlugin] calculated position', { from, to, input })

              this.prepareDataTransferWithGhost(event, el, input, from, to)

              el.classList.add('cm-dragging')
              return
            }
          }
        }

        const from = parseInt(el.getAttribute('data-from') || 'NaN')
        const to = parseInt(el.getAttribute('data-to') || 'NaN')

        if (!input || Number.isNaN(from) || Number.isNaN(to)) {
          console.warn('[InputDraggablePlugin] invalid drag data', { input, from, to })
          return
        }

        this.prepareDataTransferWithGhost(event, el, input, from, to)

        el.classList.add('cm-dragging')
      }

      el.addEventListener('dragstart', handleDragStart, true)

      el.addEventListener('dragend', () => {
        console.log('[InputDraggablePlugin] dragend fired directly')
        el.classList.remove('cm-dragging')
      })

      el.addEventListener('click', (event: MouseEvent) => {
        console.log('[InputDraggablePlugin] click fired directly')
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

      console.debug('[InputDraggablePlugin] setup draggable element', el.textContent)
    }
  }

  // 既存のプレースホルダーをドラッグ可能にする
  private makeDraggable(view: EditorView) {
    window.setTimeout(() => {
      const inputs = view.dom.querySelectorAll('.cm-input-draggable')
      inputs.forEach((el) => {
        this.setupDraggableElement(el as HTMLElement, view)
      })
    }, 10)
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
    console.debug('[InputDraggablePlugin] buildDecorations:end', { count })

    // Ensure newly created elements get drag behavior
    window.setTimeout(() => {
      const inputs = view.dom.querySelectorAll('.cm-input-draggable')
      inputs.forEach((el) => {
        this.setupDraggableElement(el as HTMLElement, view)
      })
    }, 0)

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
    event.dataTransfer.setData('application/x-codemirror-input', JSON.stringify({ from, to }))

    const ghost = this.createGhostElement(input, getComputedStyle(el).fontFamily, 'offscreen')
    document.body.appendChild(ghost)
    try {
      event.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, ghost.offsetHeight / 2)
    } finally {
      window.setTimeout(() => document.body.removeChild(ghost), 0)
    }
  }

  destroy() {
    if (this.observer) {
      this.observer.disconnect()
      this.observer = null
      console.debug('[InputDraggablePlugin] observer disconnected')
    }
  }
}

export const inputPlugin = ViewPlugin.fromClass(InputDraggablePlugin, {
  decorations: (v) => v.decorations
})
