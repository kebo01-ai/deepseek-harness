---
description: "使用与排查实验性的 Web 智能组织名册、成员实时状态与成员跳转面板。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-client-ui-agent-org

[English](README.md) | 中文

## 概述

本包在 Web 对话头部加一个组织入口：用户可以看到当前查看的 Session 所属的每一个组织、读到每个成员此刻可被观测到的活动、并跳进某个成员的对话。成员资格来自登记表那一次全局 Remote 读取；活动来自浏览器自己的会话存储，因为登记表从不拿自己的行去和活 Session 对账。通过已经带了 Host 侧组织登记表的 profile 选用它。这个浏览器投影不存任何组织状态，也不注册任何面向模型的输入。

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

在稳定版 Web 包与 Host 侧的 [`@deepseek-ai/dsh-experimental-agent-org`](../agent-org/README.zh.md) 登记表之后安装本包。Web Client 加载器挂载 `/client` 导出；根 Host 导出是惰性的，本包没有任何用户配置字段。

### 读名册

打开面板会调用 `agentOrgs/list`，它用整张登记表作答，面板保留其名册点到了当前查看 Session 的那些组织。每一行显示成员的角色、一个缩短的 Session id、以 tooltip 呈现的入组时刻，以及这个浏览器此刻能观测到的活动。活动来自 Host 本来就维护的那份 Session 列表，所以它跟着那个存储实时走，不需要再开第二个面板。

### 跳到某个成员

选中一个成员就打开它的对话。只有 Session 列表已经持有行的成员可选；跳转层自己解析那个 id 的地址，成员是可续谈子 session 时也包括它的直接父 subagent 地址。没有行的成员报 `unobserved`，不提供跳转目标。用户已经切到别的对话时这次跳转作废，面板是通过问「当前查看的 Session 是否仍然持有主视图」来判断的。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部 —— 点击展开</summary>

Client 导出挂载来自 [`@deepseek-ai/dsh-experimental-agent-org/remote`](../agent-org/README.zh.md) 的生成式 `ctx.remote.agentOrgs` 贡献，然后通过 Cordis effect 注册它的语言词典与一个对话头部槽位。处置插件 fiber 会移除这两处注册。

组织列举是按当前查看 Session 自己的成员行寻址的，而不是爬那条单一父边 —— 这正是一个 worker 能同时出现在多个组织下面的原因。名册里没有任何行声称 manager 的组织，仍然和其他组织一样列出它的成员：成员资格本身并不授予地址。

活动解析读的是 Session 列表，它的行是 Host 的目录条目加上被保留的 subagent 兜底行；成员没有行时报 `unobserved`。这个第三态刻意与「不活跃」区分开：登记表存的是它并不拥有的成员资格，一条存下来的行可以点到一个已经结束的 Session。

| 文件 | 职责 |
|---|---|
| [`src/client/mount.ts`](src/client/mount.ts) | 生成式 Remote、语言、跳转与槽位注册 |
| [`src/client/OrgAction.tsx`](src/client/OrgAction.tsx) | 名册交互状态与活动解析 |
| [`src/client/locales.ts`](src/client/locales.ts) | 面板的中英文案 |
| [`src/index.ts`](src/index.ts) | 惰性 Host 入口 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [智能组织登记表](../agent-org/README.zh.md) —— 权威成员行、限额与 Remote 行为。
- [智能组织子系统](../../../docs/subsystems/agent-org.zh.md) —— 身份、成员资格与投影类型。
- [Agent Teams Web UI](../client-ui-agent-team/README.zh.md) —— 挨着它的那块以 Lead 为根的名册面板。
- [对话 UI](../../client/ui-conversation/README.zh.md) —— 稳定的头部槽位与带地址的子 agent 跳转面。
- [实验性包](../README.zh.md) —— 孵化状态与发布策略。

-----

<a id="model-experience"></a>
## 模型体验

无，因为这个浏览器投影不注册任何面向模型的输入。

#### KV Cache 影响

无直接影响；组织工具与普通的对话提交拥有之后任何模型可见的用法。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **只读面板** —— 登记表的 Remote 面没有任何写动词，所以用户无法从这里建组织、加成员或移除成员。在出现按读者的授权模型之前，这些仍归面向模型的 [`tool-agent-org`](../tool-agent-org/README.zh.md) 工具。
- **成员资格是快照式刷新** —— 成员资格在面板打开与显式刷新时重载；只有成员活动持续跟着会话存储走。在别处做的成员资格变更会在下一次刷新时出现。
- **活动是这个浏览器的观测** —— 没有列表行的成员 Session 报 `unobserved`，它既不是活性断言也不是失败。
- **可达性只到已加载的行** —— 只有在 Session 列表持有某个成员的行时，它才可跳转。Client 的 session 契约不再按父暴露子 agent 目录，所以一个在 Host 上存在、但还没被加载进这个浏览器列表的成员，在别的东西把它加载进来之前从面板里到不了。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>给维护者的工作上下文 —— 点击展开</summary>

这块面板存在的意义是在用户可见的面上把血缘与成员资格拆开：挨着它的 Agent Teams 面板从单一父边推导名册，而这一块什么都不推导，只读存下来的行。扩展它时保持这个方向 —— 地址是从 manager 行解析出来的跳转细节，永远不是一条成员资格的身份。

</details>

**运行时不变量：** 不发布伴生包。RPC 是权威，本包只拥有一处可处置的槽位注册。
