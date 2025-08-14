<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte'
  import { EditorState } from '@codemirror/state'
  import { EditorView, basicSetup } from 'codemirror'
  import { keymap } from '@codemirror/view'
  import { defaultKeymap, historyKeymap } from '@codemirror/commands'
  import { searchKeymap } from '@codemirror/search'
  import { inputPlugin } from './plugins/inputPlugin'

  let editorElement: HTMLElement | null = null;
  let view: EditorView | null = null;
  export let value: string;
  const dispatch = createEventDispatcher<{ input: string; change: string }>()

  // EditorView のテーマ拡張
  function editorTheme() {
    return EditorView.theme({
      "&": {
        height: "100%",
        fontSize: "14px"
      },
      ".cm-scroller": {
        fontFamily: "'Fira Code', 'Consolas', 'Monaco', monospace"
      },
      ".cm-content": {
        padding: "16px",
        textAlign: "left"
      },
      ".cm-focused .cm-cursor": {
        borderLeftColor: "#ff3e00"
      },
      ".cm-focused .cm-selectionBackground, ::selection": {
        backgroundColor: "#ff3e0030"
      },
      ".cm-gutters": {
        backgroundColor: "#f5f5f5",
        color: "#999",
        border: "none"
      },
      // プレースホルダーのスタイル（Decoration.mark用）
      ".cm-placeholder-draggable": {
        cursor: "pointer !important",
        backgroundColor: "#f0f0f0",
        borderRadius: "3px",
        padding: "2px 4px",
        transition: "background-color 0.2s, opacity 0.2s",
        display: "inline-block",
        userSelect: "none !important",
        WebkitUserSelect: "none !important",
        MozUserSelect: "none !important",
        msUserSelect: "none !important",
        WebkitUserDrag: "element",  // macOS Safariでのドラッグサポート
        pointerEvents: "auto !important"  // ポインターイベントを確実に受け取る
      },
      ".cm-placeholder-draggable:hover": {
        backgroundColor: "#e0e0e0",
        boxShadow: "0 1px 3px rgba(0,0,0,0.2)"
      },
      ".cm-placeholder-draggable.cm-dragging": {
        opacity: "0.5"
      },
      // Hide autocomplete tooltip suggestions
      ".cm-tooltip-autocomplete": {
        display: "none !important"
      }
    })
  }

  // EditorView の DOM イベントハンドラ拡張を関数化
  function createDomEventHandlers() {
    return EditorView.domEventHandlers({
      dragenter: (event) => {
        event.stopPropagation()
        event.stopImmediatePropagation()
        const dt = event.dataTransfer
        if (!dt) return false
        const types = Array.from(dt.types || [])
        const isKnown = types.includes('text/plain') || types.includes('application/x-codemirror-input')
        if (isKnown) {
          event.preventDefault()
          return true
        }
        return false
      },
      dragover: (event) => {
        event.stopPropagation()
        event.stopImmediatePropagation()
        console.debug('[Editor] dragover', {
          types: Array.from(event.dataTransfer?.types || []),
          clientX: event.clientX,
          clientY: event.clientY
        })
        const dt = event.dataTransfer
        if (!dt) return false
        const types = Array.from(dt.types || [])
        const isKnown = types.includes('text/plain') || types.includes('application/x-codemirror-placeholder')
        if (isKnown) {
          event.preventDefault()
          dt.dropEffect = types.includes('application/x-codemirror-placeholder') ? 'move' : 'copy'
          return true
        }
        return false
      },
      drop: (event, view) => {
        event.stopPropagation()
        event.stopImmediatePropagation()
        event.preventDefault()
        Promise.resolve().then(() => {
          try {
            const dt = event.dataTransfer
            if (!dt) {
              console.warn('[Editor] drop: no dataTransfer')
              return
            }
            const types = Array.from(dt.types || [])
            const isKnown = types.includes('text/plain') || types.includes('application/x-codemirror-placeholder')
            if (!isKnown) {
              console.warn('[Editor] drop: unknown type', types)
              return
            }
            const hasTextTry = (() => { try { return dt.getData('text/plain') !== '' } catch { return false } })()
            console.debug('[Editor] drop', {
              types,
              hasText: hasTextTry,
              items: dt.items ? Array.from(dt.items).map(i => ({ kind: i.kind, type: i.type })) : [],
              files: dt.files ? Array.from(dt.files).map(f => ({ name: f.name, size: f.size, type: f.type })) : [],
              clientX: event.clientX,
              clientY: event.clientY
            })
            const text = dt.getData('text/plain') || ''
            const placeholderData = types.includes('application/x-codemirror-placeholder') ? dt.getData('application/x-codemirror-placeholder') : ''
            const dropPos = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.head
            console.debug('[Editor] drop:pos', { dropPos, text, placeholderData })
            if (placeholderData) {
              let parseError = false
              try {
                const parsed = JSON.parse(placeholderData)
                const from = parsed.from
                const to = parsed.to
                console.debug('[Editor] drop:move', { from, to, dropPos })
                if (dropPos <= from || dropPos >= to) {
                  const doc = view.state.doc
                  const movedText = doc.sliceString(from, to)
                  const currentContent = doc.toString()
                  let before, middle, after
                  if (dropPos < from) {
                    before = currentContent.slice(0, dropPos)
                    middle = currentContent.slice(dropPos, from)
                    after = currentContent.slice(to)
                    const newContent = before + movedText + middle + after
                    const newCursorPos = dropPos + movedText.length
                    view.dispatch({
                      changes: { from: 0, to: currentContent.length, insert: newContent },
                      selection: { anchor: newCursorPos }
                    })
                  } else {
                    before = currentContent.slice(0, from)
                    middle = currentContent.slice(to, dropPos)
                    after = currentContent.slice(dropPos)
                    const newContent = before + middle + movedText + after
                    const newCursorPos = dropPos - (to - from) + movedText.length
                    view.dispatch({
                      changes: { from: 0, to: currentContent.length, insert: newContent },
                      selection: { anchor: newCursorPos }
                    })
                  }
                  console.debug('[Editor] drop:move completed')
                } else {
                  console.debug('[Editor] drop:move ignored (drop within same placeholder)')
                }
              } catch (e) {
                parseError = true
                console.warn('[Editor] drop:placeholder parse error', e)
              }
              if (parseError && text) {
                console.debug('[Editor] drop:dispatch insert after parse error', { from: dropPos, insert: text })
                view.dispatch({ changes: { from: dropPos, to: dropPos, insert: text } })
              }
            } else if (text) {
              console.debug('[Editor] drop:dispatch insert', { from: dropPos, insert: text })
              view.dispatch({ changes: { from: dropPos, to: dropPos, insert: text } })
            }
          } catch (e) {
            console.error('[Editor] Drop handling error (inner)', e)
          }
        }).catch(e => {
          console.error('[Editor] Drop handling error (promise)', e)
        })
        return true
      }
    })
  }

  // drop とプログラム挿入で共有するテキスト挿入ヘルパー
  function handleEditorTextInsert(view: EditorView, pos: number, text: string, opts?: { moveCursorToEnd?: boolean }) {
    console.debug('[Editor] text-insert', { from: pos, insert: text, via: opts?.moveCursorToEnd ? 'programmatic' : 'drop' })
    if (opts?.moveCursorToEnd) {
      view.dispatch({ changes: { from: pos, to: pos, insert: text }, selection: { anchor: pos + text.length } })
    } else {
      view.dispatch({ changes: { from: pos, to: pos, insert: text } })
    }
    view.focus()
  }

  // 親から渡される value の変更をエディタへ反映（無限ループ防止のため差分時のみ）
  $: if (view && typeof value === 'string' && value !== view.state.doc.toString()) {
    const currentLength = view.state.doc.length
    view.dispatch({ changes: { from: 0, to: currentLength, insert: value } })
  }

  onMount(() => {
    console.debug('[Editor] onMount')
    // エディタの状態を作成
    const startState = EditorState.create({
      doc: value,
      extensions: [
        basicSetup,
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
        ]),
        editorTheme(),
        inputPlugin,
        createDomEventHandlers(),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            // ドキュメントが変更されたときの処理
            const newValue = update.state.doc.toString()
            console.log('Document changed:', newValue)
            if (newValue !== value) {
              value = newValue
              // bind:value 用に値を更新し、一般的な互換性のため input/change も発火
              dispatch('input', value)
              dispatch('change', value)
            }
          }
        })
      ]
    })

    // エディタビューを作成
    view = new EditorView({
      state: startState,
      parent: editorElement ?? undefined
    })
  })

  onDestroy(() => {
    // コンポーネントが破棄されるときにエディタをクリーンアップ
    if (view) {
      view.destroy()
    }
  })

  export function insertTextAtCursor(text: string) {
    if (!view) return
    const pos = view.state.selection.main.head
    handleEditorTextInsert(view, pos, text, { moveCursorToEnd: true })
  }
</script>

<div bind:this={editorElement} class="editor" id="promptContent"></div>

<style>
  .editor {
    width: 100%;
    height: 100%;
    overflow: auto;
  }

  :global(.cm-editor) {
    height: 100%;
  }

  :global(.cm-editor.cm-focused) {
    outline: none;
  }
</style>
