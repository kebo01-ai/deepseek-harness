---
description: "在 Web profile 中、Host 目录层之后加入公开的实验性 cc-session 看板页。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-experimental-cc-sessions-web-profile

[English](README.md) | 中文

## 概述

`dsh-experimental-cc-sessions-web-profile` 是 [cc-session 目录](../cc-sessions/README.zh.md)公开发布的实验性 Web 层。把它放在 `@deepseek-ai/dsh-web-app` 与 [`@deepseek-ai/dsh-experimental-cc-sessions-profile`](../cc-sessions-profile/README.zh.md) 之后，就会得到一个顶级侧边栏入口和它背后的整页看板：每个外部 agent session 一张实时卡片，并带一个能往里打字的输入框。这一行占的是随附 Web composition 本来留空的座位，所以不会替换任何随附面板。移除任一实验层都会让稳定的 base 与 Web composition 保持不变。随附 Web profile 默认不会启用它。

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

按这个顺序把 Host 层与 Web 层加入已初始化的 `web` profile：

```sh
dsh plugin --profile web add @deepseek-ai/dsh-experimental-cc-sessions-profile
dsh plugin --profile web add @deepseek-ai/dsh-experimental-cc-sessions-web-profile
```

第一条命令提供目录、它的端点与口令解析、以及生成的 Remote 面。第二条激活本包声明的 patch 及其浏览器呈现。执行 `dsh plugin --profile web remove @deepseek-ai/dsh-experimental-cc-sessions-web-profile` 移除本包时，该 Web 层也会从 profile 的有序 bundle 列表中移除。

### 你会得到什么

侧边栏会多出一个顶级入口，点进去是一整页卡片。每张卡片带有该 session 的活动状态词、板子从哪里触达它、它被捕获的屏幕，以及一个能往里打字的撰写框。页面自己拥有轮询驱动：离开它、把它的标签页藏起来、或者手动暂停，都会停掉全部读取——这正是读者对「关掉一个看共享板子的页面」的预期。[`@deepseek-ai/dsh-experimental-client-ui-cc-board`](../client-ui-cc-board/README.zh.md) 拥有这些浏览器交互，并挂载用来触达 Host 目录的那个生成的 Client Remote 命名空间，因此浏览器不持有任何板子凭据。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 —— 点击展开</summary>

本包的运行时内容就是 [`cordis.patch.yml`](cordis.patch.yml)。它在 `dsh-web-app` 与 Host 目录层之后生效，唯一的 `insert` 条目加入 `ui-cc-board` 行，对应 `@deepseek-ai/dsh-experimental-client-ui-cc-board`。被插入的 Client 插件拥有生成的 Remote 装配、侧边栏入口与页面；这个静态 bundle 不持有可变状态，也不安装运行时 invariant。

| 文件 | 角色 |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | 含 `ui-cc-board` 行的有序 Web patch |
| [`src/index.ts`](src/index.ts) | 空模块入口；patch 才是运行时内容 |
| — | 不发布运行时 invariant 伴随包；本包只携带一份静态 profile patch。Remote 装配与看板页各自拥有自己的激活要求。 |

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

- [实验性包](../README.zh.md)——孵化状态与发布策略。
- [cc-session Host profile](../cc-sessions-profile/README.zh.md)——所需的目录与 Remote 层。
- [cc-session 看板浏览器 UI](../client-ui-cc-board/README.zh.md)——页面、卡片与它的轮询驱动。
- [Web bundle](../../bundle/web-app/README.zh.md)——本 patch 所扩展的稳定浏览器层。

-----

<a id="model-experience"></a>
## 模型体验

无，因为本 Web bundle 不注册任何工具，也不贡献任何 prompt；它所依赖的 Host 目录同样一个都没有。

#### KV Cache 影响

无直接影响。这条路径上的任何东西都不会到达模型请求。

## 已知限制与未完成工作

<a id="known-limitations-and-deferred-work"></a>

- **有序组合**——`dsh-base`、`dsh-web-app`、`dsh-experimental-cc-sessions-profile` 与本包必须保持这个顺序。没有 Host 层，页面就没有东西可读。
- **读取随页面一起停**——驱动由打开的那个页面拥有，这是 owner 定下的：一块共享板子不该被没人看的浏览器一直轮询。想要后台观察者的部署需要一个本层不提供的 Host 侧驱动。
- **仅 opt-in**——本包是公开的，但没有任何随附 Web profile 默认启用这两个 cc-session 层。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>给维护者的工作上下文 —— 点击展开</summary>

无。

</details>
