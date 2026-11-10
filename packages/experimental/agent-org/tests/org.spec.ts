import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { SessionId } from '@deepseek-ai/dsh-session'
import { MemoryMediaPool, MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import OrgRegistry, { OrgError, OrgId } from '../src/index.ts'
import type { Config } from '../src/index.ts'

/** Boot storage and the domain facility without the registry. */
async function storageContext(pool = new MemoryMediaPool()) {
  const ctx = new Context()
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend(pool))
  const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', facility)
  ctx.provide('storageDomain', facility)
  return ctx
}

/** Boot the real storage/domain/registry composition over an in-memory medium. */
async function harness(config: Config = {}, pool = new MemoryMediaPool()) {
  const ctx = await storageContext(pool)
  const fiber = await ctx.plugin(OrgRegistry, config)
  return { ctx, fiber, pool, registry: ctx.agentOrgs }
}

const worker = (id: string) => SessionId(id)

describe('organization identity', () => {
  it('creates a named organization with its own id and an empty roster', async () => {
    const { registry } = await harness()
    const org = await registry.create('  研发一组  ')
    expect(org.name).toBe('研发一组')
    expect(org.members).toEqual([])
    expect(org.id).not.toBe('')
    expect(org.createdAt).toBe(org.updatedAt)
    expect(registry.get(org.id)).toEqual(org)
  })

  it('outlives the Session that configured it', async () => {
    const { registry } = await harness()
    const org = await registry.create('研发一组')
    const manager = worker('session-manager')
    await registry.join(org.id, manager, 'manager')
    await registry.leave(org.id, manager)
    expect(registry.get(org.id)?.name).toBe('研发一组')
    expect(registry.membersOf(org.id)).toEqual([])
  })

  it('survives a registry restart over the same medium', async () => {
    const pool = new MemoryMediaPool()
    const first = await harness({}, pool)
    const org = await first.registry.create('研发一组')
    await first.registry.join(org.id, worker('session-a'), 'worker')
    await first.fiber.dispose()

    const second = await harness({}, pool)
    expect(second.registry.list()).toHaveLength(1)
    expect(second.registry.membersOf(org.id)).toMatchObject([
      { sessionId: 'session-a', role: 'worker' },
    ])
  })

  it('reports an unknown id as a miss rather than an empty organization', async () => {
    const { registry } = await harness()
    expect(registry.get(OrgId('absent'))).toBeUndefined()
    expect(() => registry.membersOf(OrgId('absent')))
      .toThrow(expect.objectContaining({ code: 'ORG_NOT_FOUND' }))
    expect(await registry.delete(OrgId('absent'))).toBe(false)
  })

  it('deletes an organization without touching its member Sessions', async () => {
    const { registry } = await harness()
    const kept = await registry.create('留下')
    const removed = await registry.create('删掉')
    await registry.join(removed.id, worker('session-a'), 'worker')
    await registry.join(kept.id, worker('session-a'), 'worker')
    expect(await registry.delete(removed.id)).toBe(true)
    expect(registry.orgsOf(worker('session-a')).map(org => org.name)).toEqual(['留下'])
  })

  it('orders the registry newest first and breaks ties by id', async () => {
    const { registry } = await harness()
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-11-09T00:00:00.000Z'))
      const sameInstant = [await registry.create('同刻甲'), await registry.create('同刻乙')]
      vi.setSystemTime(new Date('2026-11-09T00:00:01.000Z'))
      const newest = await registry.create('最新')

      const tieBreak = [...sameInstant]
        .sort((left, right) => String(left.id).localeCompare(String(right.id)))
        .map(org => org.name)
      expect(registry.list().map(org => org.name)).toEqual(['最新', ...tieBreak])
      expect(newest.createdAt).toBe('2026-11-09T00:00:01.000Z')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('membership is explicit, not derived', () => {
  it('holds one Session in several organizations at once', async () => {
    const { registry } = await harness()
    const left = await registry.create('研发一组')
    const right = await registry.create('研发二组')
    const shared = worker('session-shared')
    await registry.join(left.id, shared, 'worker')
    await registry.join(right.id, shared, 'manager')

    expect(registry.orgsOf(shared).map(org => org.name).sort()).toEqual(['研发一组', '研发二组'])
    expect(registry.membersOf(left.id)).toMatchObject([{ sessionId: 'session-shared', role: 'worker' }])
    expect(registry.membersOf(right.id)).toMatchObject([{ sessionId: 'session-shared', role: 'manager' }])
  })

  it('keeps the roster in join order and stamps each row', async () => {
    const { registry } = await harness()
    const org = await registry.create('研发一组')
    await registry.join(org.id, worker('session-manager'), 'manager')
    await registry.join(org.id, worker('session-a'), 'worker')
    await registry.join(org.id, worker('session-b'), 'worker')

    const roster = registry.membersOf(org.id)
    expect(roster.map(member => member.sessionId)).toEqual(['session-manager', 'session-a', 'session-b'])
    expect(roster.every(member => member.joinedAt.endsWith('Z'))).toBe(true)
  })

  it('leaves one organization without leaving the others', async () => {
    const { registry } = await harness()
    const left = await registry.create('研发一组')
    const right = await registry.create('研发二组')
    const shared = worker('session-shared')
    await registry.join(left.id, shared, 'worker')
    await registry.join(right.id, shared, 'worker')
    await registry.leave(left.id, shared)

    expect(registry.orgsOf(shared).map(org => org.name)).toEqual(['研发二组'])
  })

  it('rejects a second row for the same Session in one organization', async () => {
    const { registry } = await harness()
    const org = await registry.create('研发一组')
    await registry.join(org.id, worker('session-a'), 'worker')
    await expect(registry.join(org.id, worker('session-a'), 'manager'))
      .rejects.toThrow(expect.objectContaining({ code: 'ORG_ALREADY_MEMBER' }))
    expect(registry.membersOf(org.id)).toHaveLength(1)
  })

  it('rejects joining or leaving an unknown organization', async () => {
    const { registry } = await harness()
    await expect(registry.join(OrgId('absent'), worker('session-a'), 'worker'))
      .rejects.toThrow(expect.objectContaining({ code: 'ORG_NOT_FOUND' }))
    await expect(registry.leave(OrgId('absent'), worker('session-a')))
      .rejects.toThrow(expect.objectContaining({ code: 'ORG_NOT_FOUND' }))
  })

  it('rejects removing a Session that holds no row', async () => {
    const { registry } = await harness()
    const org = await registry.create('研发一组')
    await registry.join(org.id, worker('session-a'), 'worker')
    await expect(registry.leave(org.id, worker('session-b')))
      .rejects.toThrow(expect.objectContaining({ code: 'ORG_NOT_MEMBER' }))
    expect(registry.membersOf(org.id)).toHaveLength(1)
  })

  it('reports a Session in no organization as an empty list', async () => {
    const { registry } = await harness()
    const org = await registry.create('研发一组')
    await registry.join(org.id, worker('session-a'), 'worker')
    expect(registry.orgsOf(worker('session-b'))).toEqual([])
  })

  it('detaches the roster it returns from the stored record', async () => {
    const { registry } = await harness()
    const org = await registry.create('研发一组')
    await registry.join(org.id, worker('session-a'), 'worker')
    const row = registry.membersOf(org.id)[0]! as { sessionId: string }
    row.sessionId = 'tampered'
    expect(registry.membersOf(org.id)[0]!.sessionId).toBe('session-a')
  })
})

describe('deployment limits', () => {
  it('refuses one organization past maxOrgs', async () => {
    const { registry } = await harness({ maxOrgs: 1 })
    await registry.create('研发一组')
    await expect(registry.create('研发二组'))
      .rejects.toThrow(expect.objectContaining({ code: 'ORG_LIMIT_REACHED' }))
    expect(registry.list()).toHaveLength(1)
  })

  it('refuses one member past maxMembersPerOrg', async () => {
    const { registry } = await harness({ maxMembersPerOrg: 1 })
    const org = await registry.create('研发一组')
    await registry.join(org.id, worker('session-a'), 'manager')
    await expect(registry.join(org.id, worker('session-b'), 'worker'))
      .rejects.toThrow(expect.objectContaining({ code: 'ORG_MEMBER_LIMIT_REACHED' }))
    expect(registry.membersOf(org.id)).toHaveLength(1)
  })

  it('refuses an empty or over-long name', async () => {
    const { registry } = await harness({ maxNameLength: 4 })
    await expect(registry.create('   '))
      .rejects.toThrow(expect.objectContaining({ code: 'ORG_INVALID_NAME' }))
    await expect(registry.create('一二三四五'))
      .rejects.toThrow(expect.objectContaining({ code: 'ORG_INVALID_NAME' }))
    await expect(registry.create('一二三四')).resolves.toMatchObject({ name: '一二三四' })
  })

  it('fails loud on a limit that is not a positive safe integer', async () => {
    for (const config of [{ maxOrgs: 0 }, { maxMembersPerOrg: 1.5 }, { maxNameLength: Number.NaN }]) {
      const ctx = await storageContext()
      expect(() => new OrgRegistry(ctx, config))
        .toThrow(expect.objectContaining({ code: 'ORG_INVALID_CONFIG' }))
    }
  })

  it('refuses a verb issued before the domain is open', async () => {
    const registry = new OrgRegistry(await storageContext())
    expect(() => registry.list()).toThrow(OrgError)
  })
})

describe('browser-readable registry', () => {
  it('answers one Remote read with the whole registry in display order', async () => {
    const { registry } = await harness()
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-11-09T00:00:00.000Z'))
      const first = await registry.create('研发一组')
      vi.setSystemTime(new Date('2026-11-09T00:00:01.000Z'))
      const second = await registry.create('研发二组')
      await registry.join(first.id, worker('session-a'), 'worker')

      expect(registry.remoteList()).toEqual({ orgs: registry.list() })
      expect(registry.remoteList().orgs.map(org => org.id)).toEqual([second.id, first.id])
      expect(registry.remoteList().orgs[1]?.members).toMatchObject([
        { sessionId: 'session-a', role: 'worker' },
      ])
    } finally {
      vi.useRealTimers()
    }
  })
})
