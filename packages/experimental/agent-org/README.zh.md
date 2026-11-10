---
description: "持久的具名 agent 组织与显式的多对多会话成员资格，用于「组织必须比配置它的那个会话活得更久」的部署。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-agent-org

[English](README.md) | 中文

## 概述

`dsh-experimental-agent-org` 存储由 agent 会话组成的具名组织。组织拥有自己的 id，因此它在配置它的 manager 会话之前就已存在，并在所有加入过它的会话结束之后依然留存。成员资格是一条显式存储的记录——`(组织, 会话, 角色)`——而不是从 spawn 边反推出来的结论，因此一个 worker 会话可以同时属于多个组织。该注册表回答跨会话读取，这正是它属于 host 组合的原因；它本身不提供工具，也不提供 UI。它以实验性名称公开发布、不承诺稳定性，并且需要 storage domain 才能激活。

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

当 agent 会话必须归到一个「不是其中任何一个会话」的名字之下、并且一个会话可能同时属于多个这样的分组时，把本包加入 host 组合。

### 何时选择

当分组必须比它的创建者活得更久时选择它：manager 会话配置一个组织、派发工作、然后结束，而组织与它的 roster 仍然可读。当一个 worker 会话被两个 manager 派活、必须同时出现在两份 roster 里时，也选择它。

当分组恰好就是某一个会话的助手时，应改选兄弟包 `@deepseek-ai/dsh-experimental-agent-team`：一支 Team 的身份**就是**它的 Lead 会话，而它带着本包没有的持久信箱、共享任务板与 roster UI。两者可以组合——组织负责给这个群体命名并让它活得更久，Team 负责在群体内部投递消息。

### 最小工作配置

<a id="smallest-working-setup"></a>

注册表是一行 host 行，并且需要 storage domain：

```yaml
# smallest organization setup — the storage domain plus the registry
- name: '@deepseek-ai/dsh-storage'
- name: '@deepseek-ai/dsh-storage-domain'
- name: '@deepseek-ai/dsh-experimental-agent-org'
```

所有上限都是可选的，并在启动时、打开 domain 之前校验：

| 字段 | 默认值 | 含义 |
|---|---|---|
| `maxOrgs` | `64` | 同时存储的组织数上限 |
| `maxMembersPerOrg` | `32` | 一个组织内成员记录数上限 |
| `maxNameLength` | `120` | 显示名长度上限（按码元计） |

生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-experimental-agent-org)是所有可接受字段及其 JSDoc 的详尽来源。

### 组织

`create(name)` 存储一个空组织，并带着它自己的 id 返回。名字是一个显示标签：会被 trim、不允许为空、并且不要求唯一，因此两个组织合法地可以叫同一个名字。`get(id)` 读一个，`list()` 按最新优先读全部，`delete(id)` 把一个组织连同它的整份 roster 一起删掉。

删除组织不会碰它点过名的那些会话。它删掉的是分组关系，不是那些会话做过的工作；而属于两个组织的会话仍然保留另一个。

### 成员资格

`join(组织, 会话, 角色)` 追加一条记录；`leave(组织, 会话)` 删掉它。角色是 `manager` 或 `worker`，并且属于这条记录而不属于会话本身，因此同一个会话可以在一个组织里当 manager、在另一个组织里当 worker。

`membersOf(组织)` 按加入顺序返回一份 roster，每条记录都盖着写入时刻的时间戳。`orgsOf(会话)` 是那条多对多读取：该会话所属的全部组织。两者都返回脱离存储的副本，因此调用方改动返回的数组不会触及已存储的记录。

### 成功与失败分别是什么样

成功的样子是：`create` 返回一个 id 与一份空 roster，`join` 返回多了一条记录的组织，而在 manager 会话结束之后、以及进程在同一介质上重启之后，这两种读取依然答得出来。

失败是有类型的，绝不静默。未知 id 在需要记录的操作上是 `ORG_NOT_FOUND`，在 `get` 与 `delete` 上则分别是朴素的 `undefined` 与 `false`。同一个会话在同一个组织里的第二条记录是 `ORG_ALREADY_MEMBER`；移除一个本来没有记录的会话是 `ORG_NOT_MEMBER`。空名或超长名是 `ORG_INVALID_NAME`，两种耗尽情况分别是 `ORG_LIMIT_REACHED` 与 `ORG_MEMBER_LIMIT_REACHED`。不是正安全整数的上限是 `ORG_INVALID_CONFIG`，它在插件加载期间抛出，而不是等到第一次使用。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部细节 —— 点击展开</summary>

本节解释服务背后的设计决定，并指向实现它们的代码；可观察的行为已在[使用本包](#use-this-package)中完整覆盖。

### 设计理念

注册表建立在一条切分与两条承诺之上：

- **身份先于成员资格。** 组织的 id 是它自己的，不是会话 id 上的一个 brand。正是这一个选择，让记录能比它的 manager 活得更久，也让一个会话能在多个组织里各持一条记录。
- **成员资格是存出来的，不是推出来的。** 记录由显式动词写入。没有任何地方去读父会话边来推断谁属于哪里，因此血缘与成员资格可以不一致，而两者都没错。
- **一次改动一次写。** 每个动词都是 domain 写链上的一次记录写入，因此没有第二次写可以与它发散，也没有恢复标记需要解读。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`Config` schema、上限校验、服务注册，以及全部动词 |
| [`src/spec.ts`](src/spec.ts) | 持久 domain 声明，以及校验存储格式的 zod schema |
| [`src/types.ts`](src/types.ts) | 公开身份、角色与脱离存储的投影 |
| [`src/error.ts`](src/error.ts) | `OrgError` 与那组封闭的失败码 |

### 记录与排序

一个组织就是 `orgs` 表里按自身 id 为键的一条记录，持有显示名、按加入顺序排列的 roster，以及两个 ISO-8601 时刻。该 domain 不声明 global 槽位：注册表顺序由 `createdAt` 推出、以 id 作为稳定的次级比较键，因此 `create` 与 `delete` 各是一次表写入。存一个顺序单例会把这两个操作都变成两次可以发散的写入，而它只在「人可以手动重排的顺序」那种场景下才值得它的恢复标记——本注册表并不提供这种顺序。

记录点了一些它并不拥有的会话的名。一条记录比它点名的会话活得更久，而这里没有任何东西拿记录去和活着的会话对账；那属于能观察到会话的那个消费方。

### 持久性模型

`Service.init` 打开 domain，并通过 `ctx.effect` 把它的 close 交给拥有它的 fiber，因此处置插件就会关闭 domain。读取由 domain 的内存快照回答。`create` 与 `delete` 直接写记录；`join` 与 `leave` 走 `KvTable.update()`，它的读—改—写跑在 domain 的单条写链上，因此并发的成员变更不可能交错。两条拒绝成员变更的检查——重复记录与成员上限——都在那个 update 回调里判定，也就是做出该决定的那个操作里。

### 上限

三个上限在构造函数里校验，早于打开 domain，因此部署写错会在加载时以 `ORG_INVALID_CONFIG` 失败，而不是在第一次写入时才浮现。schema 本身已经会拒掉来自 `cordis.yml` 的非整数；构造函数里这道检查另外覆盖 host 代码直接 `new OrgRegistry(ctx, config)` 的情况。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当包级别的约定不够用时，读这些页面。

- [agent-team 包](../agent-team/README.zh.md) —— 以 Lead 为根的兄弟包，带着持久信箱与共享任务板。
- [Storage domain 包](../../storage/storage-domain/README.zh.md) —— 本注册表存放记录所用的数据形式。
- [实验性包决定](../../../.agents/notes/implemented/architecture/2026-08-18-experimental-agent-teams-packages.zh.md) —— 该子树的位置、发布与依赖隔离。

-----

<a id="model-experience"></a>
## 模型体验

无，因为注册表不添加任何工具、prompt 段落或会话事件，并把组织留在 storage domain 里、位于每一份会话日志之外。

#### KV Cache 影响

无；注册表不向任何对话历史追加内容，因此成员变更不会让任何可复用前缀失效。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些是当前的包级约束，不是与其他分组机制的比较。

- **实验性原型，不承诺稳定性** —— 本包公开发布，但在孵化期间其约定可以自由变化。
- **它自己不带工具** —— 注册表可以从 host 代码触达，也可以从生成出来的 Remote 面触达。面向模型的那个表面是独立的 [`tool-agent-org`](../tool-agent-org/README.zh.md) 包。
- **Remote 面是只读且全局的** —— `list` 回答的是每一个存下来的组织，因为组织并不按会话划分，而这里也没有任何东西能判定某个浏览器读取方可以看见哪些组织。会写的 Remote 动词要等那个授权模型。
- **没有 `./invariant` 伴生包** —— 不发布 runtime invariant 伴生包，因为注册表是它自己那些记录的唯一观察者，不存在第二路独立观测可以与它发散。这里的伴生包只能把刚写进去的表再读一遍，而[包 invariant 规则](../AGENTS.md)拒绝这种空检查。
- **记录不与活着的会话对账** —— 一条点了已结束会话名的成员记录会一直留在 roster 里，直到有东西把它删掉。这里没有任何东西能观察会话存活。
- **单进程** —— 注册表不持有跨进程锁；两个 harness 进程共用同一介质不受支持。
- **没有改名，也没有归档** —— 已存储的名字与已存储的组织集合只通过 `create` 与 `delete` 改变。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>面向维护者的工作上下文 —— 点击展开</summary>

本开发备注是面向维护者的工作上下文，明确不具权威性。

#### 晋升

按[实验性子树规则](../AGENTS.md)，晋升到产品角色分组需要 review 公开约定、限制、测试证据、发布产物、运行时依赖方，以及一位具名的稳定 owner。

#### 未来方向

尚未定下的方向包括：一个按读取方划分的授权模型（它才能放开会写的 Remote 动词）、拿记录与观察到的会话存活对账、改名与归档动词，以及解析成员资格的消费方是否应该按会话读出 N 个组织而不是一个。以上都未作承诺。

</details>
