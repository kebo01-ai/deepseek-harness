---
description: "Read-and-type access to the external agent sessions a workbench board reports, as a host service and a browser-reachable Remote face."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-cc-sessions

English | [中文](README.zh.md)

## Summary

Read one workbench board over HTTP and act on the external agent sessions it reports, with exactly three operations: list them, read one session's screen, and type into one session. Nothing here starts, stops, or kills a session, so a page built on this cannot end work the board owns. Endpoint and token resolve per request, so a token the board rotates is picked up without a restart. An unreachable board, an unset endpoint, and a refused write each arrive as a stated reason instead of an empty list. Every operation is browser-reachable through the generated Remote API.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Add this package to a host composition when a dsh deployment sits beside a workbench board that already holds agent sessions in terminal multiplexers, and a reader needs to watch them and talk to them without leaving dsh.

### When to choose it

Choose it when the sessions are not dsh Sessions: they are started, owned, and torn down by the board, and dsh is a second reader over the board's own HTTP doors. The board keeps its terminal and its own page; nothing here writes to either.

Do not choose it to run work — it has no verb that starts anything. `@deepseek-ai/dsh-subagent` and its providers are what delegate work to a session dsh owns.

### Smallest working setup

The service needs a board endpoint and a board token, and takes both from the launch environment by default:

```yaml
- id: cc-sessions
  name: '@deepseek-ai/dsh-experimental-cc-sessions'
```

```sh
DSH_CC_BOARD_URL=http://127.0.0.1:8197 DSH_CC_BOARD_TOKEN=… dsh --profile …
```

A deployment that rotates its token writes it to a file instead, which is read per request:

```yaml
- id: cc-sessions
  name: '@deepseek-ai/dsh-experimental-cc-sessions'
  config:
    boardUrl: 'http://127.0.0.1:8197'
    tokenFile: '/run/dsh/board.token'
    scan: 'cluster'
    paneLines: 24
```

`boardUrl` and `tokenFile` win over the environment when set. `boardUrlEnv` and `tokenEnv` rename the variables that are read when they are not. `scan` picks the board's sweep kind, `paneLines` how many screen lines one read asks for, `requestTimeoutMs` how long one request may take, and `rosterIntervalMs` / `paneIntervalMs` are the poll cadence this host serves to a reading page.

### What success and failure look like

Success is `roster()` answering `ok: true` with one row per session the board reported, `pane(target)` answering with captured screen text, and `send(target, text, submit)` answering `ok: true` after the board took the keystrokes.

Every failure is data, and the reason is the sentence a page shows. `ok: false` with a stated `error` covers all of them: no endpoint configured (`CC_BOARD_UNCONFIGURED`), an endpoint that is not a URL or not an http(s) one (`CC_BOARD_INVALID_CONFIG`), no token resolvable or a token file that is empty or unreadable (`CC_BOARD_NO_TOKEN`), a board that did not answer or stopped answering while its body arrived (`CC_BOARD_UNREACHABLE`), and a board that answered something other than a JSON object or a non-2xx status with no reason in it (`CC_BOARD_REFUSED`). A non-2xx answer that does state a reason reaches the reader in the board's own words instead: the board turning a request away is an outcome, not a transport failure. A refused write is kept apart from a failed one, with that reason also in `refused`. Messages never carry the token.

An unreachable board and a board with no sessions never render the same: the first answers `ok: false` with a reason and an empty list, the second `ok: true` with an empty list.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

### Design philosophy

- **The board owns the sessions.** The operation set is exactly list, read, and type. There is no stop and no kill, so no page and no model built on this package can end a session mid-work.
- **Credentials resolve per request.** The board rewrites its token file when it rotates; a token cached at boot would authorize nothing after the next rotation.
- **A failure is a sentence, not an absence.** Both halves of the seam report an unreadable board as a stated reason beside an empty list, because a reader must be told why a grid is empty.
- **The board owns its own vocabulary.** An activity word this package has not seen reaches the reader unchanged instead of collapsing into a guess.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Service entry: `Config` schema, the three `@Remote` operations, endpoint and token resolution |
| [`src/config.ts`](src/config.ts) | The `DEFAULT_*` constants and the one `resolveConfig` step that decides every field |
| [`src/board.ts`](src/board.ts) | Board addressing, bearer transport, request timeout, and keystroke hex encoding |
| [`src/project.ts`](src/project.ts) | Projection of the board's JSON into the views a page renders |
| [`src/error.ts`](src/error.ts) | `CcBoardError`, its closed code set, and the one reader-facing reason helper |
| [`src/types.ts`](src/types.ts) | Session identity, row and view types, and the config faces |

### Addressing one session

The board addresses a session by node and name together, and names repeat across nodes, so `CcSessionTarget` carries both. `CcSessionName` is branded: it names a session in another process' namespace and must never stand in for a dsh `SessionId`. The board's own names carry a `cc-` prefix, applied exactly once by `boardFullName`, and a write must also carry a `confirm` string naming its target — the board rejects a keystroke batch whose confirmation does not match.

### Typing into a session

Keystrokes travel as space-separated lowercase hex of the Unicode code points, one token per keystroke, which is the alphabet the board's input door validates; the board itself expands each code point into the UTF-8 bytes its terminal layer needs. `submit: true` appends a carriage return, which is what a reader expects of Enter. Empty text with no submission is refused here rather than sent, because it is a request to deliver nothing.

### Projection

The board answers snake_case JSON; `project.ts` maps it to the camelCase views. A row missing a node or a name is dropped rather than rendered as a half-addressed card, an unreported field reads as empty rather than guessed, and a screen capture is taken from `output`, which is where both the read door and the echo of a write put it. The addresses in the list view are the ones the board swept (`scanned_nodes`), not the entries of its node table. A board-reported staleness age appears only when the board reported a number.

### Timeouts

Every request carries `AbortSignal.timeout(requestTimeoutMs)`, so a board that accepts a connection and then stops answering fails as `CC_BOARD_UNREACHABLE` within the configured budget instead of holding a page's poll open.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [cc-session board page](../client-ui-cc-board/README.md) — the browser projection that polls these operations and types into a session.
- [Typert protocol](../../typert/protocol/README.md) — how `@Remote` operations become a browser-reachable namespace.
- [Launch environment](../../util/launch-environment/README.md) — where the endpoint and token are read from.
- [Experimental packages](../README.md) — incubation status and publication policy.

-----

<a id="model-experience"></a>
## Model Experience

None, as this package registers no tool and no prompt contribution; it is a host service with a browser-reachable Remote face.

#### KV Cache effect

No direct effect. Nothing this package produces reaches a model request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **No lifecycle verbs, by design** — list, read, and type are the whole set. Starting, stopping, or killing a board session stays with the board, and adding any of them here would hand a page the ability to end work it cannot see.
- **One board per plugin row** — the endpoint is a single configured value. A deployment watching two boards composes two rows with different ids and credentials; there is no discovery and no failover.
- **The cadence is served, not enforced** — `rosterIntervalMs` and `paneIntervalMs` are reported to the reading page, which obeys them. A second consumer polling faster is not rate-limited here.
- **No model-facing face yet** — the operations are reachable from a browser and from host code, not from a model. A tool face would have to answer first what a model may type into a session it does not own.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The seam deliberately stops at the board's HTTP doors. The board's terminal, its own page, and its tmux and cluster plumbing are not this package's to change, and a change here that required a board change would be the wrong shape. When extending it, add a projection or a stated reason before adding a verb.

`resolveConfig` is the only place a default is decided. Keeping it exported and separate from the schema is what makes every default reachable from a unit test, since a directly constructed service never sees the schemastery defaults.

</details>

**Runtime invariant:** No companion is published. Both observations of a board session come from the same HTTP answer, so there is no second, independent observation here that could diverge from the first.
