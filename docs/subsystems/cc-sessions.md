# cc-session directory

English | [中文](cc-sessions.zh.md)

Types shared by the experimental cc-session directory and the browser board that reads it. This page records the literal public forms from [`packages/experimental/cc-sessions/src/types.ts`](../../packages/experimental/cc-sessions/src/types.ts); the [cc-sessions package README](../../packages/experimental/cc-sessions/README.md) owns endpoint and token resolution, the three operations, and the failure codes.

## Addressing

A session here belongs to a workbench board, not to this harness. `CcSessionName` is [branded](core.md#branded-ids) for that reason: it names a session in another process' namespace, and the brand is what stops it from being passed where a dsh `SessionId` is required.

```ts type-equiv
/** One session as the board addresses it: the node holding it plus its name. */
interface CcSessionTarget {
  /** Address of the node whose terminal multiplexer holds the session. */
  nodeIp: string
  /** Board-side session name. */
  name: CcSessionName
}
```

The node address is part of the address rather than a display field. The board reaches each session through the terminal multiplexer on one node, so the same name on two nodes is two sessions.

## The list a page renders

```ts type-equiv
/** One row of the board's session list, reduced to what a board page renders. */
interface CcSessionRow extends CcSessionTarget {
  /**
   * Activity word verbatim from the board (`busy` and `idle` observed). Kept
   * raw rather than mapped onto an owned union: the board owns this
   * vocabulary, and a word this package has not seen should reach the reader
   * unchanged instead of collapsing into a guess.
   */
  state: string
  /** Last lines of the session's screen, as the board captured them. */
  summary: string
  /** Working directory the session was started in, empty when unreported. */
  cwd: string
  /** Role label the board carries for the session, empty when unreported. */
  role: string
  /** Where the board reaches the session, for display beside the node address. */
  where: string
  /** Whether the board accepts keystrokes for this session. */
  writable: boolean
  /** The board's stated reason when {@link writable} is false. */
  writeBlock: string
  /** Whether the board recognizes this session as the one asking. */
  isSelf: boolean
}
```

The activity word is the board's vocabulary, carried verbatim. Mapping it onto an owned union would turn a word this package has not seen into a guess, and a reader watching a shared board is better served by the board's own word.

## Stated reasons instead of empty answers

Each read answers with a reason when it fails. An unreachable board, an unset endpoint, and a board with no sessions are three different facts; a view that rendered them identically would read as "nothing is running".

```ts type-equiv
/**
 * The session list as one page load sees it. A failed read is reported as
 * `ok: false` with a stated `error`, never as an empty list: an unreachable
 * board and a board with no sessions must not render the same.
 */
interface CcRosterView {
  /** Whether this answer came from a successful board read. */
  ok: boolean
  /** Why the read failed, empty while {@link ok}. */
  error: string
  /** Whether the board served a remembered answer instead of a fresh sweep. */
  stale: boolean
  /** Age in seconds of a stale answer, absent when the board reported none. */
  staleAgeS?: number
  /** Board-reported sweep kind (`registry` or `cluster`). */
  scan: string
  /** Rows in board order. */
  sessions: readonly CcSessionRow[]
  /** Nodes the board swept. */
  nodes: readonly string[]
  /** Nodes the board could not reach during the sweep. */
  unreachableNodes: readonly string[]
  /** Cadence the reading page should poll at. */
  cadence: CcCadence
  /** Board endpoint this answer came from, without credentials. */
  boardUrl: string
}
```

```ts type-equiv
/** One screen read of one session. */
interface CcPaneView {
  /** Whether the screen was captured. */
  ok: boolean
  /** Why the capture failed, empty while {@link ok}. */
  error: string
  /** The session that was read. */
  target: CcSessionTarget
  /** Captured screen text, empty on failure. */
  text: string
}
```

Writing is one forwarded keystroke batch, and the board may decline it. A refusal arrives as the board's own `refused` word beside the stated error, because "the board said no" and "the board could not be reached" call for different reactions from the reader.

```ts type-equiv
/** The board's answer to one forwarded keystroke batch. */
interface CcSendResult {
  /** Whether the board accepted and delivered the keystrokes. */
  ok: boolean
  /** Why delivery failed, empty while {@link ok}. */
  error: string
  /** The board's refusal word when it declined the write, empty otherwise. */
  refused: string
  /** Screen the board returned after delivery, empty when it returned none. */
  screen: string
}
```

## Cadence

The host owns the poll cadence and serves it to the page that reads; the page does not choose its own intervals. One board is shared, so how often it is polled is a fact of that deployment rather than a preference of each open browser tab.

```ts type-equiv
/** Poll cadence the host was configured with, obeyed by the page that reads it. */
interface CcCadence {
  /** Milliseconds between session-list reads. */
  rosterIntervalMs: number
  /** Milliseconds between screen reads of the sessions a page is showing. */
  paneIntervalMs: number
  /** Screen lines one read requests. */
  paneLines: number
}
```

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxccsessions--ccsessiondirectory"></a>

### `ctx.ccSessions` — `CcSessionDirectory`

Read-and-type access to one workbench board's sessions.

Endpoint and token resolve per request rather than at load: both come from the launch environment or a file the board rewrites when it rotates its token, so neither is knowable when the composition boots. A missing one is reported to the reader as a stated reason, which is what a board page must show instead of an empty grid.

```ts cordis-catalog
/**
 * Poll cadence this host serves to reading pages.
 * @returns the roster interval, the screen interval, and the capture height.
 */
cadence(): CcCadence

/**
 * List the sessions the board reports.
 * @returns the list, or a stated reason with an empty list.
 */
@Remote('roster') async roster(): Promise<CcRosterView>

/**
 * Read one session's screen.
 * @param target - session to read.
 * @returns the captured screen, or a stated reason with empty text.
 */
@Remote('pane') async pane(target: CcSessionTarget): Promise<CcPaneView>

/**
 * Forward one keystroke batch into a session, as the reader typed it.
 * @param target - session to type into.
 * @param text - text to deliver; empty text is refused rather than sent.
 * @param submit - whether to append a carriage return, submitting the line.
 * @returns the board's answer, including its refusal when it declined.
 */
@Remote('send') async send(target: CcSessionTarget, text: string, submit: boolean): Promise<CcSendResult>
```

Source: [`packages/experimental/cc-sessions/src/index.ts`](../../packages/experimental/cc-sessions/src/index.ts)
<!-- END GENERATED cordis-surface -->
