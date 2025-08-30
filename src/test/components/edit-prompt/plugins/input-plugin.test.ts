// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { EditorView } from '@codemirror/view'
import { inputPlugin } from '../../../../components/edit-prompt/plugins/input-plugin'

describe('inputPlugin (InputDraggablePlugin)', () => {
  let container: HTMLDivElement
  let view: EditorView

  const doc = 'Hello {{name}} and {{ target }}!'

  const flush = () => new Promise((r) => setTimeout(r, 0))

  beforeEach(async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    view = new EditorView({
      doc,
      parent: container,
      extensions: [inputPlugin]
    })
    // Allow requestMeasure/write and MutationObserver callbacks to run
    await flush()
  })

  afterEach(() => {
    view?.destroy()
    container?.remove()
  })

  it('decorates placeholders with draggable spans and attributes', async () => {
    const spans = Array.from(container.querySelectorAll('.cm-input-draggable')) as HTMLElement[]
    expect(spans.length).toBe(2)

    // Validate attributes on the first placeholder
    const first = spans[0]
    expect(first.getAttribute('data-input')).toBe('{{name}}')
    expect(first.getAttribute('data-from')).not.toBeNull()
    expect(first.getAttribute('data-to')).not.toBeNull()

    // Ensure the element has cursor/user-select styles applied
    expect(first.style.cursor).toBe('pointer')
    expect(first.style.userSelect).toBe('none')
  })

  it('dispatches cm-input-open on double click with the name', async () => {
    const openHandler = vi.fn()
    view.dom.addEventListener('cm-input-open', openHandler as unknown as EventListener)

    const span = container.querySelector('.cm-input-draggable') as HTMLElement
    expect(span).toBeTruthy()

    span.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))

    expect(openHandler).toHaveBeenCalledTimes(1)
    const ev = openHandler.mock.calls[0][0] as CustomEvent
    expect(ev.detail?.name).toBe('name')
  })

  it('does not delete a placeholder when the same-name placeholder still exists', async () => {
    const container2 = document.createElement('div')
    document.body.appendChild(container2)
    const multiDoc = 'Hello, {{name}} {{name}} {{user}}'
    const multiView = new EditorView({ doc: multiDoc, parent: container2, extensions: [inputPlugin] })
    await flush()

    const deleteHandler = vi.fn()
    multiView.dom.addEventListener('cm-input-delete', deleteHandler as unknown as EventListener)

    const firstStart = multiDoc.indexOf('{{name}}')
    multiView.dispatch({ selection: { anchor: firstStart, head: firstStart } })

    const evt = new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true })
    multiView.dom.dispatchEvent(evt)

    // Should NOT trigger plugin-driven delete event because there are 2 name placeholders
    expect(deleteHandler).not.toHaveBeenCalled()

    multiView.destroy()
    container2.remove()
  })

  it('deletes when it is the last occurrence of the same-name placeholder (others with different names ignored)', async () => {
    const container2 = document.createElement('div')
    document.body.appendChild(container2)
    // Only one {{name}} remains, {{user}} is different and should be ignored
    const doc2 = 'Hello, {{name}} {{user}}'
    const view2 = new EditorView({ doc: doc2, parent: container2, extensions: [inputPlugin] })
    await flush()

    const deleteHandler = vi.fn()
    view2.dom.addEventListener('cm-input-delete', deleteHandler as unknown as EventListener)

    const start = doc2.indexOf('{{name}}')
    view2.dispatch({ selection: { anchor: start, head: start } })

    const evt = new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true })
    view2.dom.dispatchEvent(evt)

    expect(deleteHandler).toHaveBeenCalledTimes(1)
    const ev = deleteHandler.mock.calls[0][0] as CustomEvent
    expect(ev.detail?.name).toBe('name')

    view2.destroy()
    container2.remove()
  })

  it('deletes placeholder via Delete key only when it is the last placeholder', async () => {
    // Use a fresh editor with a single placeholder
    const container2 = document.createElement('div')
    document.body.appendChild(container2)
    const singleDoc = 'Hello {{name}}!'
    const singleView = new EditorView({ doc: singleDoc, parent: container2, extensions: [inputPlugin] })
    await flush()

    const deleteHandler = vi.fn()
    singleView.dom.addEventListener('cm-input-delete', deleteHandler as unknown as EventListener)

    const start = singleDoc.indexOf('{{name}}')
    singleView.dispatch({ selection: { anchor: start, head: start } })

    const before = singleView.state.doc.toString()
    expect(before.includes('{{name}}')).toBe(true)

    const evt = new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true })
    singleView.dom.dispatchEvent(evt)

    const after = singleView.state.doc.toString()
    expect(after.includes('{{name}}')).toBe(false)
    expect(deleteHandler).toHaveBeenCalledTimes(1)
    const ev = deleteHandler.mock.calls[0][0] as CustomEvent
    expect(ev.detail?.name).toBe('name')

    singleView.destroy()
    container2.remove()
  })

  it('moves the caret to the placeholder position on click', async () => {
    const span = container.querySelector('.cm-input-draggable') as HTMLElement
    expect(span).toBeTruthy()

    // Move selection away first
    view.dispatch({ selection: { anchor: 0, head: 0 } })

    // Click on the span should set the selection to its DOM position
    span.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

    const pos = view.posAtDOM(span)
    expect(pos).not.toBeNull()
    expect(view.state.selection.main.anchor).toBe(pos)
  })

  it('calls view.dispatch when deleting via Delete key (only when last placeholder)', async () => {
    const container2 = document.createElement('div')
    document.body.appendChild(container2)
    const singleDoc = 'Hello {{name}}!'
    const singleView = new EditorView({ doc: singleDoc, parent: container2, extensions: [inputPlugin] })
    await flush()

    const start = singleDoc.indexOf('{{name}}')
    singleView.dispatch({ selection: { anchor: start, head: start } })

    const spy = vi.spyOn(singleView, 'dispatch')
    const evt = new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true })
    singleView.dom.dispatchEvent(evt)

    expect(spy).toHaveBeenCalled()

    singleView.destroy()
    container2.remove()
  })

  it('calls view.dispatch when deleting via Backspace key (only when last placeholder)', async () => {
    const container2 = document.createElement('div')
    document.body.appendChild(container2)
    const singleDoc = 'Hello {{name}}!'
    const singleView = new EditorView({ doc: singleDoc, parent: container2, extensions: [inputPlugin] })
    await flush()

    const start = singleDoc.indexOf('{{name}}')
    const end = start + '{{name}}'.length
    singleView.dispatch({ selection: { anchor: end, head: end } })

    const spy = vi.spyOn(singleView, 'dispatch')
    const evt = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true })
    singleView.dom.dispatchEvent(evt)

    expect(spy).toHaveBeenCalled()

    singleView.destroy()
    container2.remove()
  })
})
