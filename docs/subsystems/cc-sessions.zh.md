# cc-session 目录

[English](cc-sessions.md) | 中文

实验性 cc-session 目录与读它的那块浏览器看板共用的类型。本页记录来自 [`packages/experimental/cc-sessions/src/types.ts`](../../packages/experimental/cc-sessions/src/types.ts) 的字面公开形态；端点与口令解析、那三件操作、以及失败码由 [cc-sessions 包 README](../../packages/experimental/cc-sessions/README.zh.md) 拥有。

## 寻址

这里的 session 属于一块 workbench 板子，不属于本 harness。`CcSessionName` 正因如此是[品牌化](core.zh.md#branded-ids)的：它命名的是另一个进程命名空间里的 session，而 brand 就是拦住它被当成 dsh `SessionId` 传出去的那道东西。

```ts type-equiv
/** One session as the board addresses it: the node holding it plus its name. */
interface CcSessionTarget {
  /** Address of the node whose terminal multiplexer holds the session. */
  nodeIp: string
  /** Board-side session name. */
  name: CcSessionName
}
```

节点地址是地址的一部分，不是一个展示字段。板子是通过某一个节点上的终端复用器触达每个 session 的，所以同一个名字出现在两个节点上就是两个 session。

## 看板页渲染的那一行

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

活动状态词是板子自己的词汇，原样带过来。把它映射到一个本包拥有的 union 上，会把本包没见过的词变成一个猜测；而对一个盯着共享板子的读者来说，板子自己的词更有用。

## 用明说的原因代替空答案

每次读取在失败时都带回一个原因。板子触达不到、端点没设、以及板子上一个 session 都没有，是三件不同的事；把它们渲染成同一个样子的视图，读起来会变成「什么都没在跑」。

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

写入是一批转发过去的按键，而板子可以拒收。拒收会连着明说的错误一起带回板子自己的 `refused` 词，因为「板子说不行」和「板子触达不到」要求读者做的反应并不一样。

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

## 轮询节奏

轮询节奏由 host 拥有，并供给给读它的页面；页面不自己挑间隔。一块板子是共享的，所以它被轮询的频率是那套部署的事实，而不是每个打开的浏览器标签页的偏好。

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

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

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
