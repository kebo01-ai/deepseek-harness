/**
 * Projection of board answers into this package's reader-facing views. The
 * board is a separate process, so every field is read defensively here and
 * nowhere else: past this module the types are trusted.
 * @module @deepseek-ai/dsh-experimental-cc-sessions/project
 */

import type { CcCadence, CcRosterView, CcSessionName, CcSessionRow } from './types.ts'

/**
 * Read one string field, treating a missing or non-string value as unreported.
 * @param source - board object.
 * @param key - field name.
 * @returns the string, or an empty string.
 */
function str(source: Record<string, unknown>, key: string): string {
  const value = source[key]
  return typeof value === 'string' ? value : ''
}

/**
 * Read one boolean field, treating anything else as false.
 * @param source - board object.
 * @param key - field name.
 * @returns the boolean, or false.
 */
function flag(source: Record<string, unknown>, key: string): boolean {
  return source[key] === true
}

/**
 * Read one array-of-strings field.
 * @param source - board object.
 * @param key - field name.
 * @returns the strings it carried, in order.
 */
function strings(source: Record<string, unknown>, key: string): readonly string[] {
  const value = source[key]
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

/**
 * Project one board session row. A row without a name addresses nothing and
 * is dropped by the caller.
 * @param raw - one element of the board's `sessions` array.
 * @returns the row, or undefined when it carries no name.
 */
function projectRow(raw: unknown): CcSessionRow | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const source = raw as Record<string, unknown>
  const name = str(source, 'name')
  if (name === '') return undefined
  return {
    name: name as CcSessionName,
    nodeIp: str(source, 'node_ip'),
    state: str(source, 'state'),
    summary: str(source, 'summary'),
    cwd: str(source, 'cwd'),
    role: str(source, 'role'),
    where: str(source, 'where'),
    writable: flag(source, 'writable'),
    writeBlock: str(source, 'write_block'),
    isSelf: flag(source, 'is_self'),
  }
}

/**
 * Project the board's session list.
 * @param payload - the board's `/api/cc/roster` object.
 * @param cadence - cadence this host serves to reading pages.
 * @param boardUrl - endpoint the answer came from, without credentials.
 * @returns the list view a page renders.
 */
export function projectRoster(
  payload: Record<string, unknown>,
  cadence: CcCadence,
  boardUrl: string,
): CcRosterView {
  const sessions = Array.isArray(payload['sessions'])
    ? payload['sessions'].map(projectRow).filter((row): row is CcSessionRow => row !== undefined)
    : []
  const age = payload['stale_age_s']
  return {
    ok: payload['ok'] === true,
    error: projectReason(payload),
    stale: flag(payload, 'stale'),
    ...typeof age === 'number' ? { staleAgeS: age } : {},
    scan: str(payload, 'scan'),
    sessions,
    // The board's own `nodes` is its cluster node table, one object per node
    // including nodes it never asked; the addresses it swept are the strings
    // under `scanned_nodes`, which is what `unreachable_nodes` counts against.
    nodes: strings(payload, 'scanned_nodes'),
    unreachableNodes: strings(payload, 'unreachable_nodes'),
    cadence,
    boardUrl,
  }
}

/**
 * The screen text out of a board read answer. The board returns the capture
 * under `output` on both the read door and the echo of a write.
 * @param payload - the board's read answer.
 * @returns the captured text, or an empty string when it carried none.
 */
export function projectScreen(payload: Record<string, unknown>): string {
  const value = payload['output']
  return typeof value === 'string' ? value : ''
}

/**
 * The board's stated reason behind an unsuccessful answer.
 * @param payload - the board's answer.
 * @returns the refusal or error text, or an empty string when it stated none.
 */
export function projectReason(payload: Record<string, unknown>): string {
  const refused = payload['refused']
  if (typeof refused === 'string' && refused !== '') return refused
  return str(payload, 'error')
}
