import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  ACCENT,
  ACCENT_HOVER,
  FONT_FAMILIES,
  LITERAL_ACCENT_ALIASES,
  SKIN_TOKENS,
  TEXT_BEARING_ACCENT_ALIASES,
} from '../src/client/tokens.ts'
import { CHINESE_FAMILY, CODE_STACK, LATIN_FAMILY, MONO_FAMILY, TEXT_STACK } from '../src/families.ts'

/**
 * The stock palette sheet this layer overrides. Read from source rather than
 * imported: the assertions below are about the declarations in that file, and
 * reading them is what turns an upgrade that adds a ladder step into a failure
 * here instead of blue on screen.
 */
const STOCK = readFileSync(
  fileURLToPath(new URL('../../ui-theme/src/styles/design-platform.css', import.meta.url)),
  'utf8',
)

/**
 * The stock sheet that declares the two font stacks. Read from source for the
 * same reason: the override names have to be the names this file declares, and
 * an upgrade that renames one should fail here rather than silently stop
 * reaching the page.
 */
const STOCK_BASE = readFileSync(
  fileURLToPath(new URL('../../ui-theme/src/styles/base.css', import.meta.url)),
  'utf8',
)

/** Every `--dsw-static-*` colour on a ladder this skin replaces. */
function stockLadderSteps(): Map<string, [number, number, number]> {
  const steps = new Map<string, [number, number, number]>()
  const pattern = /(--dsw-static-(?:deepseek|neutral)[\w-]*):\s*rgb\((\d+),\s*(\d+),\s*(\d+)\)/g
  for (const [, name, r, g, b] of STOCK.matchAll(pattern)) {
    if (name !== undefined && !steps.has(name)) steps.set(name, [Number(r), Number(g), Number(b)])
  }
  return steps
}

function channels(hex: string): [number, number, number] {
  return [1, 3, 5].map(at => Number.parseInt(hex.slice(at, at + 2), 16)) as [number, number, number]
}

/** WCAG relative luminance — the quantity every contrast pair is computed from. */
function luminance([r, g, b]: [number, number, number]): number {
  const channel = (raw: number) => {
    const c = raw / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrast(a: string, b: string): number {
  const pair = [luminance(channels(a)), luminance(channels(b))].sort((x, y) => y - x)
  return (pair[0]! + 0.05) / (pair[1]! + 0.05)
}

const WHITE = '#FFFFFF'

describe('skin palette against the stock sheet', () => {
  it('covers every ladder step the stock sheet declares', () => {
    const steps = [...stockLadderSteps().keys()]
    expect(steps.length).toBeGreaterThan(40)
    expect(steps.filter(name => SKIN_TOKENS[name] === undefined)).toEqual([])
  })

  it('reads warm at every ladder step', () => {
    for (const name of stockLadderSteps().keys()) {
      const [r, g, b] = channels(SKIN_TOKENS[name]!.light)
      expect([name, r >= g, g >= b]).toEqual([name, true, true])
    }
  })

  it('holds each neutral step at the luminance it replaces', () => {
    for (const [name, stock] of stockLadderSteps()) {
      if (!name.startsWith('--dsw-static-neutral')) continue
      const drift = Math.abs(luminance(channels(SKIN_TOKENS[name]!.light)) - luminance(stock))
      expect([name, drift < 0.01]).toEqual([name, true])
    }
  })

  it('keeps the accent ladder ordered from fill to ink', () => {
    const ordered = [...stockLadderSteps().keys()]
      .filter(name => name.startsWith('--dsw-static-deepseek'))
      .sort((a, b) => luminance(stockLadderSteps().get(b)!) - luminance(stockLadderSteps().get(a)!))
    const ours = ordered.map(name => luminance(channels(SKIN_TOKENS[name]!.light)))
    expect(ours).toEqual([...ours].sort((a, b) => b - a))
    expect(new Set(ours).size).toBe(ours.length)
  })

  it('declares both palettes for every token, because one value goes illegible', () => {
    for (const [name, modes] of Object.entries(SKIN_TOKENS)) {
      expect([name, typeof modes.light, typeof modes.dark]).toEqual([name, 'string', 'string'])
    }
  })
})

describe('accent aliases', () => {
  it('clears WCAG AA where the accent carries a label', () => {
    for (const [name, modes] of Object.entries(TEXT_BEARING_ACCENT_ALIASES)) {
      if (modes.light === ACCENT) continue
      expect([name, contrast(modes.light, WHITE) >= 4.5]).toEqual([name, true])
    }
    expect(contrast(ACCENT, WHITE)).toBeLessThan(4.5)
    expect(contrast(ACCENT_HOVER, WHITE)).toBeGreaterThanOrEqual(4.5)
  })

  it('still faces an rgb() literal the ladder cannot reach', () => {
    const [name] = Object.keys(LITERAL_ACCENT_ALIASES)
    const declared = [...STOCK.matchAll(new RegExp(`${name}:\\s*([^;]+);`, 'g'))]
      .map(([, value]) => value)
    expect(declared).toEqual(['rgb(65, 118, 230)', 'var(--dsw-static-deepseek-450)'])
  })
})


describe('typography', () => {
  it('overrides exactly the two stacks the stock sheet declares', () => {
    const declared = [...STOCK_BASE.matchAll(/(--d[\w-]*font-family[\w-]*):/g)].map(([, name]) => name)
    expect(new Set(declared)).toEqual(new Set(Object.keys(FONT_FAMILIES)))
    for (const name of Object.keys(FONT_FAMILIES)) {
      expect([name, name in SKIN_TOKENS]).toEqual([name, true])
    }
  })

  it('leads each stack with a bundled family and covers Chinese before the platform tail', () => {
    expect(TEXT_STACK.startsWith(`'${LATIN_FAMILY}'`)).toBe(true)
    expect(CODE_STACK.startsWith(`'${MONO_FAMILY}'`)).toBe(true)
    for (const stack of [TEXT_STACK, CODE_STACK]) {
      // A glyph none of the bundled faces carries has to reach an installed
      // face, so the Chinese family sits ahead of the platform names.
      expect(stack.indexOf(CHINESE_FAMILY)).toBeGreaterThan(0)
      expect(stack.indexOf(CHINESE_FAMILY)).toBeLessThan(stack.indexOf('PingFang SC'))
    }
  })

  it('keeps the stock tails, including the code stack without a bare monospace', () => {
    expect(TEXT_STACK.endsWith('sans-serif')).toBe(true)
    expect(CODE_STACK.split(',').map(entry => entry.trim())).not.toContain('monospace')
    for (const name of ['-apple-system', 'Helvetica Neue', 'Microsoft YaHei']) {
      expect([name, TEXT_STACK.includes(name)]).toEqual([name, true])
    }
    for (const name of ['SF Mono', 'Consolas', 'Menlo']) {
      expect([name, CODE_STACK.includes(name)]).toEqual([name, true])
    }
  })

  it('names the same palette value in both modes, because a typeface is not a colour', () => {
    for (const [name, modes] of Object.entries(FONT_FAMILIES)) {
      expect([name, modes.light]).toEqual([name, modes.dark])
    }
  })
})
