---
description: "在 profile 中加入公开的实验性 cc-session 目录，经 HTTP 读取一块 workbench 板子。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-experimental-cc-sessions-profile

[English](README.md) | 中文

## 概述

`dsh-experimental-cc-sessions-profile` 是 [cc-session 目录](../cc-sessions/README.zh.md)公开发布的实验性 Host 层。把它放在 `@deepseek-ai/dsh-base` 之后，部署就获得对一块 workbench 板子所报告的外部 agent session 的读与写入能力。这一行只提供列出、读屏与打字三件事，因此携带它的 composition 无法启动、停止或杀掉板子所拥有的 session。移除这一层会让稳定的 base composition 保持不变。随附 profile 默认不会启用它。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与未完成工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

### 安装进 profile

把本层加入已初始化的 profile：

```sh
dsh plugin --profile web add @deepseek-ai/dsh-experimental-cc-sessions-profile
```

这条命令激活本包声明的 patch：`cc-sessions` 行及其生成的 Remote 面。执行 `dsh plugin --profile web remove @deepseek-ai/dsh-experimental-cc-sessions-profile` 移除本包时，该层也会从 profile 的有序 bundle 列表中移除。

### 把这一层指向一块板子

端点与口令是部署事实，不是默认值。插入的这一行每次请求都从启动环境读取它们——`DSH_CC_BOARD_URL` 与 `DSH_CC_BOARD_TOKEN`——除非部署在自己的 patch 层里设置了 `boardUrl`、`boardUrlEnv`、`tokenEnv` 或 `tokenFile`。每次请求都重读口令，正是板子轮换口令时无需重启的原因。未设置的端点、读不到的口令文件、以及不应答的板子，都会作为明说的原因到达读者，而不是变成一份空列表。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 —— 点击展开</summary>

本包的运行时内容就是 [`cordis.patch.yml`](cordis.patch.yml)。它唯一的 `insert` 条目加入 `cc-sessions` 行。该行采用目录自带的轮询节奏与端点解析；需要别的取值的部署在自己的 patch 层里设置，而不是在这里重述默认值。这个静态 bundle 不持有可变状态，也不安装运行时 invariant。

| 文件 | 角色 |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | 含 `cc-sessions` 行的有序 Host patch |
| [`src/index.ts`](src/index.ts) | 空模块入口；patch 才是运行时内容 |
| — | 不发布运行时 invariant 伴随包；本包只携带一份静态 profile patch。目录拥有自己的激活要求。 |

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

- [实验性包](../README.zh.md)——孵化状态与发布策略。
- [cc-session 目录](../cc-sessions/README.zh.md)——端点与口令解析，以及那三件操作。
- [cc-session 看板 Web profile](../cc-sessions-web-profile/README.zh.md)——在浏览器里显示板子的那一层。
- [cc-session 看板浏览器 UI](../client-ui-cc-board/README.zh.md)——页面、卡片与它的轮询驱动。

-----

<a id="model-experience"></a>
## 模型体验

无，因为插入的这一行不注册任何工具，也不贡献任何 prompt；它是一个带浏览器可达 Remote 面的 host service。

#### KV Cache 影响

无直接影响。本层加入的任何东西都不会到达模型请求。

## 已知限制与未完成工作

<a id="known-limitations-and-deferred-work"></a>

- **有序组合**——`dsh-base` 与本包必须保持这个顺序。目录只读一块板子；它不拥有板子上的 session。
- **一份 composition 一块板子**——这一行只解析单个端点。要盯两块板子的部署需要两份 composition。
- **仅 opt-in**——本包是公开的，但没有任何随附 profile 默认启用这个实验层。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>给维护者的工作上下文 —— 点击展开</summary>

无。

</details>
