---
description: "Use and debug the experimental Web cc-session board: one live card per workbench board session, with a composer that types into it."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-client-ui-cc-board

English | [中文](README.zh.md)

## Summary

Add a top-level sidebar entry to the Web client that opens a full page of cards, one per external agent session a workbench board reports. Each card carries the session's activity word, where the board reaches it, its captured screen, and a box that types into it. The page owns its polling driver: leaving it, hiding its tab, or pausing it stops every read. Reading and writing both go through the Host-side cc-session service, so no board credential and no session state lives in the browser.

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

Install the package after the stable Web bundle and the Host-side [`@deepseek-ai/dsh-experimental-cc-sessions`](../cc-sessions/README.md) service, which is where the board endpoint and token are configured. The Web Client loader mounts the `/client` export; the root Host export is inert, and the package has no user configuration fields.

### Open the board

The sidebar row sits among the global panels under the id `cc-sessions`, which is also the main-panel key it opens — the sidebar addresses the page by the id of the row that was clicked, so the two are deliberately one string. Opening it reads the board immediately rather than waiting out the first interval, then keeps reading at the cadence the Host serves. A page that never reached its own Host has been served no cadence, and it retries on its own short interval until one answer arrives rather than stopping. The header states the board URL it read, how many sessions and nodes the answer carried, which sweep the Host asked the board for, how long ago the read landed, and whether polling is paused.

### Read one session

A card shows the board's own activity word beside a dot. Screen reads cover exactly the sessions the page is showing, one batch at a time, and a card always states which of three answers it holds: no screen has been read yet, the board captured a blank screen, or the read failed and the board's own reason stands where the screen would be. A read that fails after one succeeded keeps the screen it last got with the reason stated beside it, because a reader needs both the picture that stopped moving and why it stopped.

### Type into one session

Enter submits the line and clears the box; Shift+Enter opens a line, and an IME composition commit is not a submit. A line the board never took stays in the box for the reader to retry, with the reason on the card it happened to — the board's refusal and a failed write are stated apart. The composer is shut for a row the board declined to write to, which states the board's own block, and for the board process itself.

### What failure looks like

Before the first answer the page says it is reading the board. A transport failure states the Host's code and message. A board the Host could read but that reported its own trouble keeps that reason beside the list it managed to read, rather than blanking the page. A remembered answer says it is remembered and how old it is, nodes the sweep could not reach are named, and a board that answered with no sessions says it is empty — a board that could not be read never says that, because the stated reason is what the reader needs instead.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The Client export mounts the generated `ctx.remote.ccSessions` contribution from [`@deepseek-ai/dsh-experimental-cc-sessions/remote`](../cc-sessions/README.md), then registers its locale dictionaries, one sidebar row, and one main panel through Cordis effects. A registration that fails after the mount unmounts the Remote namespace before rethrowing; disposing the plugin fiber removes all of them.

The three operations handed to the page are the whole seam. `loadRoster` keeps the Host's stated reason beside the view it answered, so an unreadable board is a sentence and not an absence. `loadPane` answers with the captured text and a reason for its absence, which keeps a screen the read could not get apart from a screen that is genuinely blank — one empty string standing for both is what leaves a card silently blank. `send` separates `refused` from `failed`, because a board that declined a write is not a board that could not be written to. A transport failure is rendered as its code and message, which never carry the board token.

### The driver

Both tickers are started by effects and cleared on unmount. `running = !paused && !hidden` is the single gate: a hidden tab counts as left, because the board is a shared service and an unwatched page must not keep sweeping it. The roster ticker starts without waiting for a first answer, because a page that only polls once it has read the board never recovers from failing to read it. Each read guards re-entrancy with a busy flag, so a slow board delays the next read instead of stacking reads; the flag is released however the read ends, and a read that threw is stated like any other failure, because a guard left set latches the page shut for as long as it stays open. The screen ticker keys off who is on the board rather than off the roster array's identity — every read hands back a fresh array — so it restarts when membership changes and keeps ticking when only state moved. Each screen batch rebuilds the whole record from its own answers, so a session the board stopped reporting leaves with its screen. A read that lands after unmount publishes nothing.

| File | Role |
|---|---|
| [`src/client/mount.ts`](src/client/mount.ts) | Generated Remote, locale, the three operations, and both slot registrations |
| [`src/client/CcBoardPanel.tsx`](src/client/CcBoardPanel.tsx) | The page, the board facts, and the polling driver |
| [`src/client/CcSessionCard.tsx`](src/client/CcSessionCard.tsx) | One session: dot mapping, the three screen states, composer, and per-card failure |
| [`src/client/face.ts`](src/client/face.ts) | Operation faces, outcome types, and the per-session key |
| [`src/client/locales.ts`](src/client/locales.ts) | English and Chinese page copy |
| [`src/index.ts`](src/index.ts) | Inert Host entry |

A session is tracked across reads under `targetKey` — node and name together, because the board addresses a session that way and names repeat across nodes. `dotOf` styles only the two words the board is known to emit; anything else stays a warning rather than being guessed into a healthy color, and the word itself reaches the reader unchanged beside the dot.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [cc-session service](../cc-sessions/README.md) — the Host half that addresses the board, resolves its credentials, and states every failure.
- [Sidebar UI](../../client/ui-sidebar/README.md) — the panel list this row joins and how a row opens its page.
- [Client UI slots](../../client/ui-slots/README.md) — the registration and localized-copy seats used here.
- [Experimental packages](../README.md) — incubation status and publication policy.

-----

<a id="model-experience"></a>
## Model Experience

None, as this browser projection registers no model-facing input. The sessions on the page belong to the board, and nothing a reader types here reaches a dsh model request.

#### KV Cache effect

No direct effect. Nothing this package produces reaches a model request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Read and type only** — the Host seam carries no lifecycle verb, so the page cannot start, stop, or kill a board session. That stays with the board, and a page that could end work it cannot see would be the wrong surface for it.
- **A screen, not a terminal** — the card renders captured text, so a board session's cursor, colors, and alternate screen are not reproduced. Reading a session interactively stays with the board's own terminal.
- **The page obeys the served cadence** — `rosterIntervalMs` and `paneIntervalMs` come from the Host and are not adjustable from the page; pausing and one manual refresh are the whole control set. The retry a page uses while it has been served no cadence is a fixed interval in the page, because that case is a browser that cannot reach its own Host and its retry never reaches the shared board.
- **Every shown session is read every batch** — there is no viewport or selection narrowing, so a board with many sessions costs one screen read per session per tick. A board large enough for that to matter wants a selection first.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The board's terminal and its own page are not this package's to change, and neither is the board's vocabulary: an activity word, a write block, and a refusal all reach the reader as the board stated them. When extending the page, add a projection or a stated reason before asking the Host for a new verb.

The driver's lifetime is behavior, not a comment: the paused, hidden-tab, and disposed cases each have their own test asserting the read counters stop moving. A change that moves polling out of this component has to carry those three claims with it.

</details>

**Runtime invariant:** No companion is published. RPC is authoritative and the package owns only disposable slot registrations.
