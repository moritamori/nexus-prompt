import { describe, it, expect } from 'vitest'
import type { PromptInputView } from '../../promptops/dsl/prompt/renderer'
import { generateUniqueInputName } from '../../utils/unique-input-generator'

function input(name: string): PromptInputView {
  return { name, type: 'string', required: false }
}

describe('generateUniqueInputName', () => {
  it('重複が無ければ元の名前を返す', () => {
    const name = generateUniqueInputName('foo', [], '')
    expect(name).toBe('foo')
  })

  it('前後空白はtrimして判定する', () => {
    const name = generateUniqueInputName('  foo  ', [], '')
    expect(name).toBe('foo')
  })

  it('inputs 内に同名があるときは連番(2〜)を付与する', () => {
    const name = generateUniqueInputName('foo', [input('foo')], '')
    expect(name).toBe('foo2')
  })

  it('inputs 側に foo, foo2, foo3 が埋まっていれば foo4 を返す', () => {
    const name = generateUniqueInputName('foo', [input('foo'), input('foo2'), input('foo3')], '')
    expect(name).toBe('foo4')
  })

  it('エディタ本文に {{foo}} があれば foo2 を返す', () => {
    const name = generateUniqueInputName('foo', [], 'prefix {{foo}} suffix')
    expect(name).toBe('foo2')
  })

  it('エディタ本文に {{ foo }} と空白があっても検出できる', () => {
    const name = generateUniqueInputName('foo', [], 'text {{  foo   }} text')
    expect(name).toBe('foo2')
  })

  it('inputs と本文の両方を考慮して最小の未使用連番を返す', () => {
    // inputs: foo, foo2 / doc: {{foo3}} -> foo4
    const name = generateUniqueInputName('foo', [input('foo'), input('foo2')], 'aaa {{foo3}} bbb')
    expect(name).toBe('foo4')
  })

  it('空文字や空白だけの場合は空文字を返す', () => {
    expect(generateUniqueInputName('', [], '')).toBe('')
    expect(generateUniqueInputName('   ', [], '')).toBe('')
  })
})


