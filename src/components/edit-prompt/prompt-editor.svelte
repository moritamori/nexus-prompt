<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte'
  import { EditorState } from '@codemirror/state'
  import { EditorView, basicSetup } from 'codemirror'
  import { keymap } from '@codemirror/view'
  import { defaultKeymap, historyKeymap } from '@codemirror/commands'
  import { searchKeymap } from '@codemirror/search'
  import { inputPlugin, internalDragInProgress } from './plugins/input-plugin'
  import type { PromptInputView } from '../../promptops/dsl/prompt/renderer'
  import { generateUniqueInputName } from '../../utils/unique-input-generator'

  let editorElement: HTMLElement | null = null;
  let view: EditorView | null = null;
  let cmInputOpenCleanup: (() => void) | null = null;
  export let value: string;
  export let inputs: PromptInputView[];
  const dispatch = createEventDispatcher<{ input: string; change: string; openAddInput: { name: string; type: string, required: boolean }; openEditInputByIndex: { index: number }, deleteInput: { name: string } }>()

  // inputのパターン
  const inputPattern = /\{\{[^}]+\}\}/g

  function escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  // EditorView のテーマ拡張
  function editorTheme() {
    return EditorView.theme({
      "&": {
        height: "100%",
        fontSize: "14px"
      },
      ".cm-scroller": {
        overflow: "auto",
        fontFamily: "'Fira Code', 'Consolas', 'Monaco', monospace"
      },
      ".cm-content": {
        minHeight: "300px",
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
        minHeight: "300px !important",
        backgroundColor: "#f5f5f5",
        color: "#999",
        border: "none"
      },
      // プレースホルダーのスタイル（Decoration.mark用）
      ".cm-input-draggable": {
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
        WebkitUserDrag: "element",
        pointerEvents: "auto !important"
      },
      ".cm-input-draggable:hover": {
        backgroundColor: "#e0e0e0",
        boxShadow: "0 1px 3px rgba(0,0,0,0.2)"
      },
      ".cm-input-draggable.cm-dragging": {
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
        const isKnown = types.includes('text/plain') ||
          types.includes('application/x-codemirror-input-type') ||
          types.includes('application/x-codemirror-input-internal')
        if (isKnown) {
          event.preventDefault()
          return true
        }
        return false
      },
      dragover: (event) => {
        event.stopPropagation()
        event.stopImmediatePropagation()
        const dt = event.dataTransfer
        if (!dt) return false
        const types = Array.from(dt.types || [])
        const isKnown = types.includes('text/plain') ||
          types.includes('application/x-codemirror-input-type') ||
          types.includes('application/x-codemirror-input-internal')
        if (isKnown) {
          event.preventDefault()
          if (types.includes('application/x-codemirror-input-internal')) {
            dt.dropEffect = 'move'
          } else if (types.includes('application/x-codemirror-input-type')) {
            dt.dropEffect = 'copy'
          } else {
            dt.dropEffect = 'copy'
          }
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
              return
            }
            const types = Array.from(dt.types || [])
            const isKnown = types.includes('text/plain') ||
              types.includes('application/x-codemirror-input-type') ||
              types.includes('application/x-codemirror-input-internal')
            if (!isKnown) {
              return
            }
            // 内部DnD（エディタ内の移動）はプラグイン側で処理し、ここでは何もしない
            if (types.includes('application/x-codemirror-input-internal') || internalDragInProgress) {
              return
            }

            const text = dt.getData('text/plain') || ''
            const dropPos = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.head
            if (!text) return

            if (types.includes('application/x-codemirror-input-type')) {
              // 外部DnD（パレット→エディタ）。型情報付きで差し込み追加＋モーダルを開く
              const type = dt.getData('application/x-codemirror-input-type') || ''
              handleEditorTextInsert(view, dropPos, text, type)
            } else {
              // 純テキストのDnDはそのまま挿入（モーダルは開かない）
              view.dispatch({ changes: { from: dropPos, to: dropPos, insert: text } })
              view.focus()
            }
          } catch (_) {
            // noop
          }
        }).catch(_ => {
          // noop
        })
        return true
      }
    })
  }

  // drop とプログラム挿入で共有するテキスト挿入ヘルパー
  function handleEditorTextInsert(view: EditorView, pos: number, text: string, type: string, opts?: { moveCursorToEnd?: boolean, openModal?: boolean }) {
    // テキストから {{name}} の name を抽出して、親に入力追加モーダルを開くリクエストを通知
    const match = text.match(inputPattern)
    if (match && match[0]) {
      let name = match[0].slice(2, -2).trim()
      const docText = view ? view.state.doc.toString() : ''
      name = generateUniqueInputName(name, inputs, docText)

      if (opts?.moveCursorToEnd) {
        view.dispatch({ changes: { from: pos, to: pos, insert: `{{${name}}}` }, selection: { anchor: pos + text.length } })
      } else {
        view.dispatch({ changes: { from: pos, to: pos, insert: `{{${name}}}` } })
      }
      view.focus()

      if (name && (opts?.openModal ?? true)) {
        dispatch('openAddInput', { name, type, required: false })
      }
    }
  }

  // 親から渡される value の変更をエディタへ反映（無限ループ防止のため差分時のみ）
  $: if (view && typeof value === 'string' && value !== view.state.doc.toString()) {
    const currentLength = view.state.doc.length
    view.dispatch({ changes: { from: 0, to: currentLength, insert: value } })
  }

  onMount(() => {
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
        EditorView.lineWrapping,
        createDomEventHandlers(),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            // ドキュメントが変更されたときの処理
            const newValue = update.state.doc.toString()
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

    const handleCmInputOpen = (event: Event) => {
      try {
        const anyEvent = event as unknown as CustomEvent<{ name: string }>
        const name = anyEvent?.detail?.name
        if (!name) return
        const idx = Array.isArray(inputs) ? inputs.findIndex(i => (i?.name ?? '').trim() === name) : -1
        if (idx >= 0) {
          dispatch('openEditInputByIndex', { index: idx })
        }
      } catch {
        // noop
      }
    }
    view.dom.addEventListener('cm-input-open', handleCmInputOpen as EventListener)
    view.contentDOM.addEventListener('cm-input-open', handleCmInputOpen as EventListener)

    const handleCmInputDelete = (ev: Event) => {
      try {
        const anyEvent = ev as unknown as CustomEvent<{ name: string }>
        const name = anyEvent?.detail?.name
        if (!name) return
        const idx = Array.isArray(inputs) ? inputs.findIndex(i => (i?.name ?? '').trim() === name) : -1
        if (idx >= 0) {
          dispatch('deleteInput', { name })
        }
      } catch {
        // noop
      }
    }
    view.dom.addEventListener('cm-input-delete', handleCmInputDelete as EventListener)
    view.contentDOM.addEventListener('cm-input-delete', handleCmInputDelete as EventListener)

    // クリーンアップ
    const cleanup = () => {
      view?.dom.removeEventListener('cm-input-open', handleCmInputOpen as EventListener)
      view?.contentDOM.removeEventListener('cm-input-open', handleCmInputOpen as EventListener)
      view?.dom.removeEventListener('cm-input-delete', handleCmInputDelete as EventListener)
      view?.contentDOM.removeEventListener('cm-input-delete', handleCmInputDelete as EventListener)
    }
    // onDestroy で呼ばれるようにフック
    cmInputOpenCleanup = cleanup
  })

  onDestroy(() => {
    // コンポーネントが破棄されるときにエディタをクリーンアップ
    if (cmInputOpenCleanup) {
      cmInputOpenCleanup()
      cmInputOpenCleanup = null
    }
    if (view) {
      view.destroy()
    }
  })

  export function insertTextAtCursor(text: string, type: string) {
    if (!view) return
    const pos = view.state.selection.main.head
    handleEditorTextInsert(view, pos, text, type, { moveCursorToEnd: true, openModal: true })
  }

  export function replaceVarName(oldName: string, newName: string) {
    if (!view) return
    const trimmedOld = (oldName ?? '').trim()
    const trimmedNew = (newName ?? '').trim()
    if (!trimmedOld || !trimmedNew || trimmedOld === trimmedNew) return
    const docText = view.state.doc.toString()
    const pattern = new RegExp(`\\{\\{\\s*${escapeRegExp(trimmedOld)}\\s*\\}\\}`, 'g')
    if (!pattern.test(docText)) return
    const replaced = docText.replace(pattern, `{{${trimmedNew}}}`)
    view.dispatch({ changes: { from: 0, to: docText.length, insert: replaced } })
    view.focus()
  }
  export function deleteVarName(name: string) {
    if (!view) return
    const trimmed = (name ?? '').trim()
    if (!trimmed) return
    const docText = view.state.doc.toString()
    const pattern = new RegExp(`\\{\\{\\s*${escapeRegExp(trimmed)}\\s*\\}\\}`, 'g')
    const replaced = docText.replace(pattern, '')
    view.dispatch({ changes: { from: 0, to: docText.length, insert: replaced } })
    view.focus()
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
