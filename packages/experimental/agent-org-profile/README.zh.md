---
description: "在 profile 中加入公开的实验性智能组织登记与它的模型工具。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-experimental-agent-org-profile

[English](README.md) | 中文

## 概述

`dsh-experimental-agent-org-profile` 是[智能组织](../agent-org/README.zh.md)公开发布的实验性 Host 层。把它放在 `@deepseek-ai/dsh-base` 与 [`@deepseek-ai/dsh-experimental-agent-team-profile`](../agent-team-profile/README.zh.md) 之后：组织登记拥有耐久的成员行，派发与消息投递仍留在 Team 的行上，因此一份 composition 里只有一个信箱。移除任一实验层都会让稳定的 base composition 保持不变。随附 profile 默认不会启用它。

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

按这个顺序把 Agent Teams 层与本层加入已初始化的 profile：

```sh
dsh plugin --profile web add @deepseek-ai/dsh-experimental-agent-team-profile
dsh plugin --profile web add @deepseek-ai/dsh-experimental-agent-org-profile
```

第一条命令提供 spawn、耐久信箱与共享任务板。第二条激活本包声明的 patch：组织登记及其四个模型工具。执行 `dsh plugin --profile web remove @deepseek-ai/dsh-experimental-agent-org-profile` 移除本包时，该层也会从 profile 的有序 bundle 列表中移除。

### 你会得到什么

manager Agent 会获得 `org_create`、`org_add_worker`、`org_list` 与 `org_members`。组织拥有自己的 id 与名字，因此它的名册比创建它的 Session 活得更久，并且一个 Session 可以同时在多个组织里持有成员行。血缘不变：worker 仍然是 spawn 它那个 manager 的 continuable 子 Session。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 —— 点击展开</summary>

本包的运行时内容就是 [`cordis.patch.yml`](cordis.patch.yml)。它唯一的 `insert` 条目加入登记的 `agent-org` 行与模型工具的 `tool-agent-org` 行。两行都采用登记自带的限额；需要别的限额的部署在自己的 patch 层里设置，而不是在这里重述默认值。这个静态 bundle 不持有可变状态，也不安装运行时 invariant。

| 文件 | 角色 |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | 含 `agent-org` 与 `tool-agent-org` 两行的有序 Host patch |
| [`src/index.ts`](src/index.ts) | 空模块入口；patch 才是运行时内容 |
| — | 不发布运行时 invariant 伴随包；本包只携带一份静态 profile patch。登记与它的工具各自拥有自己的激活要求。 |

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

- [实验性包](../README.zh.md)——孵化状态与发布策略。
- [智能组织登记](../agent-org/README.zh.md)——耐久成员行与 Remote 只读读取。
- [智能组织工具](../tool-agent-org/README.zh.md)——本层安装的四个模型工具。
- [Agent Teams Host profile](../agent-team-profile/README.zh.md)——所需的 spawn、信箱与任务板层。
- [智能组织 Web profile](../agent-org-web-profile/README.zh.md)——在浏览器里显示名册的那一层。

-----

<a id="model-experience"></a>
## 模型体验

### 组织工具

#### 模型看到什么

这四个工具名与 schema 属于 [`@deepseek-ai/dsh-experimental-tool-agent-org`](../tool-agent-org/README.zh.md)。本层只改变组装：`org_create` 给组织命名，`org_add_worker` 把一个活着的 Session 作为 worker 记进去，`org_members` 按加入顺序读回一份名册，`org_list` 回答调用方 Session 属于哪些组织。每个结果都是紧凑 JSON。spawn、发信与共享任务仍然留在 `tool-agent-team`。

#### Token 影响

本层加入的是 `@deepseek-ai/dsh-experimental-tool-agent-org` 描述的那四份工具 schema，它自己不加任何提示词文本。每次调用只追加各自的 JSON 结果：建好或加入一个组织是几个字段，而一份名册随成员数增长。

#### KV Cache 影响

安装本层会给 composition 里的每个请求加上四份工具 schema，这会让没有它们时缓存的前缀失效。只要本层的 patch 与那些 schema 不变，它的组装就是前缀稳定的。

## 已知限制与未完成工作

<a id="known-limitations-and-deferred-work"></a>

- **有序组合**——`dsh-base`、`dsh-experimental-agent-team-profile` 与本包必须保持这个顺序。组织登记记录成员资格；它不 spawn、不投递、不排程。
- **解析器一次只答一条成员资格**——存储持有 `(组织, Session, 角色)` 行，并且已经接受一个 Session 在多个组织里。Team 名册的解析器仍然只返回单条成员资格，因此跨组织投递要等那个返回类型。
- **仅 opt-in**——本包是公开的，但没有任何随附 profile 默认启用这两个实验层。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>给维护者的工作上下文 —— 点击展开</summary>

无。

</details>
