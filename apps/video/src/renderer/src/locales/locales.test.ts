import { describe, expect, it } from 'vitest'
import en from './en.json'
import ro from './ro.json'

type Tree = { [k: string]: string | Tree }

function flatten(t: Tree, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(t)) {
    if (typeof v === 'string') out[prefix + k] = v
    else Object.assign(out, flatten(v, `${prefix}${k}.`))
  }
  return out
}

const vars = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort()

describe('translations', () => {
  const E = flatten(en as Tree)
  const R = flatten(ro as Tree)

  it('Romanian has exactly the English keys', () => {
    expect(Object.keys(R).sort()).toEqual(Object.keys(E).sort())
  })

  it('every text keeps the same {{placeholders}}', () => {
    for (const k of Object.keys(E)) expect(vars(R[k] ?? ''), k).toEqual(vars(E[k]))
  })

  it('no empty texts', () => {
    for (const [k, v] of Object.entries(R)) expect(v.trim(), k).not.toBe('')
  })
})
