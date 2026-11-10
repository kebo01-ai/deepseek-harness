---
description: "以 host 服务与浏览器可达的 Remote 面，读取并打字进 workbench 板子所报告的外部 agent 会话。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-cc-sessions

[English](README.md) | 中文

## 概述

通过 HTTP 读一块 workbench 板子，并对它所报告的外部 agent 会话只做三个动作：列出它们、读一个会话的屏幕、往一个会话里打字。这里没有任何东西会启动、停止或杀掉一个会话，所以建在它上面的页面不可能结束板子正在干的活。端点与口令按请求解析，所以板子轮换掉的口令不必重启就能被取到。连不上的板子、没设的端点、以及被拒绝的那次写入，都带着一句明说的原因回来，而不是一个空列表。每个动作都通过生成的 Remote API 对浏览器可达。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

当一套 dsh 部署旁边就有一块 workbench 板子、板子已经把 agent 会话握在终端复用器里，而读者需要在不离开 dsh 的前提下看着它们、跟它们说话时，把本包加进 host 装配。

### 什么时候选它

当这些会话不是 dsh Session 时选它：它们由板子启动、持有、拆除，dsh 只是板子自己那几道 HTTP 门的第二个读者。板子保留它自己的终端和它自己的页面；这里的任何东西都不写这两处。

别拿它去跑活 —— 它没有任何启动什么东西的动词。把活派给一个 dsh 自己持有的会话，那是 `@deepseek-ai/dsh-subagent` 与它的 provider 的事。

### 最小可用配置

服务需要一个板子端点和一个板子口令，默认两样都从启动环境取：

```yaml
- id: cc-sessions
  name: '@deepseek-ai/dsh-experimental-cc-sessions'
```

```sh
DSH_CC_BOARD_URL=http://127.0.0.1:8197 DSH_CC_BOARD_TOKEN=… dsh --profile …
```

会轮换口令的部署把口令写进一个文件，该文件按请求读取：

```yaml
- id: cc-sessions
  name: '@deepseek-ai/dsh-experimental-cc-sessions'
  config:
    boardUrl: 'http://127.0.0.1:8197'
    tokenFile: '/run/dsh/board.token'
    scan: 'cluster'
    paneLines: 24
```

`boardUrl` 与 `tokenFile` 一旦写了就压过环境。没写时读哪两个变量，由 `boardUrlEnv` 与 `tokenEnv` 改名决定。`scan` 挑板子的扫法，`paneLines` 定一次读取要多少屏幕行，`requestTimeoutMs` 定一次请求可以花多久，`rosterIntervalMs` / `paneIntervalMs` 则是这个 host 服给读取页面的轮询节奏。

### 成功与失败分别是什么样

成功是 `roster()` 答 `ok: true`，板子报告的每个会话一行；`pane(target)` 答回捕获到的屏幕文本；`send(target, text, submit)` 在板子收下按键之后答 `ok: true`。

每一种失败都是数据，而那个原因就是页面要显示的那句话。`ok: false` 配一句说明过的 `error` 覆盖全部：没配端点（`CC_BOARD_UNCONFIGURED`）、端点不是 URL 或不是 http(s) 的（`CC_BOARD_INVALID_CONFIG`）、解析不到口令或口令文件为空、读不动（`CC_BOARD_NO_TOKEN`）、板子没答或答到一半就断了（`CC_BOARD_UNREACHABLE`）、以及板子答了不是 JSON 对象的东西、或答了一个非 2xx 状态却没在里面说原因（`CC_BOARD_REFUSED`）。一个非 2xx 却说了原因的回答则按板子自己的话送到读者面前：板子把一个请求挡回去是一个结果，不是传输失败。被拒绝的写入与失败的写入分开记，那句原因同时也落在 `refused` 里。消息里永远不带口令。

连不上的板子和没有会话的板子永不渲染成同一个样子：前者答 `ok: false` 带原因加一个空列表，后者答 `ok: true` 加一个空列表。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内幕 —— 点击展开</summary>

### 设计理念

- **会话归板子所有。** 动作集恰好是列出、读取、打字。没有停止也没有杀掉，所以建在本包上的任何页面、任何模型都不可能把一个会话从活干到一半的状态中结束掉。
- **凭据按请求解析。** 板子轮换口令时会重写它的口令文件；一份在启动时缓存下来的口令，在下一次轮换之后什么都授权不了。
- **失败是一句话，不是一片空白。** 这道缝的两半都把读不动的板子报成一句说明过的原因，摆在那个空列表旁边，因为读者必须被告知一个网格为什么是空的。
- **板子拥有它自己的词汇。** 本包没见过的活动状态词原样抵达读者，而不是坍缩成一个猜测。

### 源码地图

| 文件 | 角色 |
|---|---|
| [`src/index.ts`](src/index.ts) | 服务入口：`Config` schema、三个 `@Remote` 动作、端点与口令解析 |
| [`src/config.ts`](src/config.ts) | 那些 `DEFAULT_*` 常量，以及决定每一个字段的那一个 `resolveConfig` 步骤 |
| [`src/board.ts`](src/board.ts) | 板子寻址、bearer 传输、请求超时、按键的十六进制编码 |
| [`src/project.ts`](src/project.ts) | 把板子的 JSON 投影成页面要渲染的那几个视图 |
| [`src/error.ts`](src/error.ts) | `CcBoardError`、它那套封闭的错误码，以及那一个面向读者的原因助手 |
| [`src/types.ts`](src/types.ts) | 会话身份、行与视图类型、以及那几个配置面 |

### 寻址一个会话

板子用节点与名字一起寻址一个会话，而名字会在不同节点上重复，所以 `CcSessionTarget` 两样都带。`CcSessionName` 打了 brand：它命名的是另一个进程命名空间里的会话，绝不可以顶替一个 dsh 的 `SessionId`。板子自己的名字带一个 `cc-` 前缀，由 `boardFullName` 恰好加一次；一次写入还必须带一个点名目标的 `confirm` 字符串 —— 确认对不上的按键批次会被板子驳回。

### 往一个会话里打字

按键以空格分隔的小写十六进制码点传输，一个按键一个 token，这正是板子那道输入门校验的字母表；把码点展开成终端层要的 UTF-8 字节是板子自己做的事。`submit: true` 追加一个回车，这正是读者对 Enter 的期待。空文本且不提交在这里就被拒掉、不会发出去，因为那是一个「投递虚无」的请求。

### 投影

板子答的是 snake_case 的 JSON；`project.ts` 把它映到那几个 camelCase 视图。缺节点或缺名字的一行被丢掉，而不是渲染成一张只有半个地址的卡片；没报告的字段读成空，而不是猜一个；屏幕截取取自 `output`，读门与写入的回声都把它放在那里；列表视图里的地址是板子真扫过的那些（`scanned_nodes`），不是它节点表里的条目。板子报告的陈旧秒龄只在板子真报了一个数时才出现。

### 超时

每一个请求都带 `AbortSignal.timeout(requestTimeoutMs)`，所以一块接下了连接然后不再回答的板子会在配置的预算之内失败成 `CC_BOARD_UNREACHABLE`，而不是把一个页面的轮询一直挂着。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [cc-session 看板页](../client-ui-cc-board/README.zh.md) —— 轮询这几个动作、并往一个会话里打字的那个浏览器投影。
- [Typert 协议](../../typert/protocol/README.zh.md) —— `@Remote` 动作是怎么变成一个浏览器可达的命名空间的。
- [启动环境](../../util/launch-environment/README.zh.md) —— 端点与口令是从哪里读的。
- [实验包](../README.zh.md) —— 孵化状态与发布策略。

-----

<a id="model-experience"></a>
## 模型体验

没有，因为本包不注册任何工具、不贡献任何提示词；它是一个带浏览器可达 Remote 面的 host 服务。

#### KV Cache 影响

无直接影响。本包产出的任何东西都到不了一次模型请求里。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **没有生命周期动词，这是故意的** —— 列出、读取、打字就是全部。启动、停止、杀掉一个板子会话仍然归板子，在这里加上其中任何一个，都等于把「结束它看不见的工作」这个能力交给一个页面。
- **一行插件一块板子** —— 端点是一个单独的配置值。要同时看两块板子的部署组两行、用不同的 id 与凭据；这里没有发现机制，也没有故障转移。
- **节奏是服出去的，不是强制的** —— `rosterIntervalMs` 与 `paneIntervalMs` 报给读取页面，由它遵守。第二个消费者轮得更快，在这里不会被限速。
- **还没有面向模型的面** —— 这几个动作可以从浏览器和 host 代码到达，还到不了模型。要加一个工具面，得先回答一个模型可以往一个它并不拥有的会话里打什么。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>给维护者的工作上下文 —— 点击展开</summary>

这道缝刻意停在板子的 HTTP 门口。板子的终端、它自己的页面、它的 tmux 与集群管路都不是本包该改的，而一个需要板子跟着改的本地改动，形状就是错的。要扩它的时候，先加一个投影或一句说明过的原因，再考虑加一个动词。

`resolveConfig` 是唯一决定默认值的地方。把它导出、并与 schema 分开，就是让每一个默认值都能从单元测试里到达的原因 —— 一个直接构造出来的服务永远看不到 schemastery 的默认值。

</details>

**运行期不变式：** 不发布 companion。对一个板子会话的两次观测来自同一个 HTTP 回答，所以这里没有第二个独立的观测可以与第一个分歧。
