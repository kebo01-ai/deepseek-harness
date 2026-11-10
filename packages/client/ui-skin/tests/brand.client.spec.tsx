// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { BRAND_NAME } from '../src/brand.ts'
import { MARK_ATTRIBUTE, WORDMARK_ATTRIBUTE } from '../src/client/attributes.ts'
import { SkinBrandMark, SkinBrandName, SkinHeroMark } from '../src/client/Brand.tsx'
import { apply, inject } from '../src/client/index.ts'
import { ACCENT } from '../src/client/tokens.ts'

afterEach(async () => {
  cleanup()
  for (const fiber of started.splice(0)) await fiber.dispose()
})

/** Every skin fiber a test started, so one leaving its sheet behind cannot change another's reading. */
const started: Array<{ dispose(): Promise<unknown> }> = []

/**
 * Start the skin on a bench context and wait for it to activate.
 * @param ctx - bench context carrying the slot registry and the theme stub.
 * @returns the started fiber, also torn down after the test.
 */
async function start(ctx: Context) {
  const fiber = ctx.plugin({ inject: [...inject], apply })
  started.push(fiber)
  await fiber.await()
  return fiber
}

/** The three brand slots this skin occupies, with the occupant each expects. */
const OCCUPANTS = [
  ['sidebar.brand.mark', SkinBrandMark],
  ['sidebar.brand.name', SkinBrandName],
  ['conversation.hero.brand.mark', SkinHeroMark],
] as const

/**
 * A root context carrying the real slot registry, a theme stub recording the
 * layers it is handed, and the three slot declarations the host packages make.
 * @param declare - whether the slots are declared before the skin applies.
 * @returns the context, the registry, the recorded layers and a redeclare hook.
 */
async function bench(declare = true) {
  const layers: string[] = []
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.provide('theme', {
    overrideTokens(source: string) {
      layers.push(source)
      return () => { layers.splice(layers.indexOf(source), 1) }
    },
  } as never)
  const slots = ctx.get('slots') as SlotRegistry
  const declareSlots = () => slots.register({
    name: 'root',
    children: Object.fromEntries(
      OCCUPANTS.map(([name]) => [name, { kind: 'single', scope: 'root' }]),
    ),
  } as never, () => null)
  const disposeSlots = declare ? declareSlots() : undefined
  return { ctx, slots, layers, declareSlots, disposeSlots }
}

describe('the skin plugin', () => {
  it('declares only the services it uses', () => {
    expect(inject).toEqual(['theme', 'slots'])
  })

  it('registers one named token layer and withdraws it on teardown', async () => {
    const subject = await bench()
    const fiber = await start(subject.ctx)
    expect(subject.layers).toEqual(['skin'])
    await fiber.dispose()
    expect(subject.layers).toEqual([])
  })

  it('fills each brand slot with its own occupant', async () => {
    const subject = await bench()
    await start(subject.ctx)
    for (const [name, component] of OCCUPANTS) {
      expect(subject.slots.entries(name).map(entry => entry.component)).toEqual([component])
    }
  })

  it('fills declarations that arrive after it and empties every slot on teardown', async () => {
    const before = await bench()
    const fiber = await start(before.ctx)
    before.disposeSlots?.()
    before.declareSlots()
    await Promise.resolve()
    for (const [name] of OCCUPANTS) expect(before.slots.entries(name)).toHaveLength(1)
    await fiber.dispose()
    for (const [name] of OCCUPANTS) expect(before.slots.entries(name)).toHaveLength(0)

    const after = await bench(false)
    await start(after.ctx)
    for (const [name] of OCCUPANTS) expect(after.slots.entries(name)).toHaveLength(0)
    after.declareSlots()
    await Promise.resolve()
    for (const [name] of OCCUPANTS) expect(after.slots.entries(name)).toHaveLength(1)
  })

  it('appends one sheet reaching both brand surfaces and removes it on teardown', async () => {
    const subject = await bench()
    const fiber = await start(subject.ctx)
    const sheets = [...document.head.querySelectorAll('style[data-plugin]')]
    expect(sheets).toHaveLength(1)
    const css = sheets[0]?.textContent ?? ''
    expect(css).toContain('--dsh-skin-installed: 1')
    expect(css).toContain(`[${WORDMARK_ATTRIBUTE}]`)
    expect(css).toContain(`[${MARK_ATTRIBUTE}]`)
    await fiber.dispose()
    expect(document.head.querySelectorAll('style[data-plugin]')).toHaveLength(0)
  })
})

describe('the brand occupants', () => {
  it('draws the mark at whatever edge each host asks for', () => {
    const sidebar = render(<SkinBrandMark size={24} />)
    expect(sidebar.container.querySelector('svg')?.getAttribute('width')).toBe('24')
    sidebar.unmount()

    const hero = render(<SkinHeroMark size={34} />)
    const svg = hero.container.querySelector('svg')
    expect(svg?.getAttribute('width')).toBe('34')
    expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24')
  })

  it('keeps the mark reachable by the skin sheet and off the accessibility tree', () => {
    const mark = render(<SkinBrandMark size={24} />)
    const svg = mark.container.querySelector('svg')
    expect(svg?.hasAttribute(MARK_ATTRIBUTE)).toBe(true)
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
  })

  it('leaves the brackets on the host ink and the cursor on the accent', () => {
    const mark = render(<SkinBrandMark size={24} />)
    const strokes = [...mark.container.querySelectorAll('path')]
    expect(strokes).toHaveLength(2)
    for (const stroke of strokes) expect(stroke.getAttribute('stroke')).toBe('currentColor')
    expect(mark.container.querySelector('rect')?.getAttribute('fill'))
      .toBe('var(--dsw-static-deepseek-500)')
  })

  it('carries the accent into the cursor through the overridden ladder step', async () => {
    const { ACCENT_LADDER } = await import('../src/client/tokens.ts')
    expect(ACCENT_LADDER['--dsw-static-deepseek-500']).toEqual({ light: ACCENT, dark: ACCENT })
  })

  it('writes the brand name alone, with nothing riding along', () => {
    const name = render(<SkinBrandName />)
    expect(name.container.textContent).toBe(BRAND_NAME)
    expect(BRAND_NAME).not.toMatch(/DeepSeek|Local Build/i)
    const span = name.container.querySelector(`[${WORDMARK_ATTRIBUTE}]`)
    expect(span?.children).toHaveLength(0)
  })
})
