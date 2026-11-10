---
description: "面向模型的工具：给一个组织起名、把正在运行的 worker 会话记入其中、再把成员资格读回来，全部建立在持久的 agent-org 注册表之上。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-tool-agent-org

[English](README.md) | 中文

## 概述

`dsh-experimental-tool-agent-org` 在 `ctx.agentOrgs` 之上给模型四个工具：给一个组织起名、把一个正在运行的 worker 会话记入其中、列出调用方会话所属的那些组织、读取一份名册。派活与发信不在这里重新实现——manager 先用这些工具给分组起名，再用 Agent Teams 的工具 spawn worker 并投递工作，因此一个组装里只有一个信箱。这些工具写入持久的成员记录，所以分组比创建它的那个会话活得更久。

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

当分组必须由模型自己创建、而不是由部署事先配置好时，把本包加进去。

### 何时选择

当「存在一个分组」这件事由模型来决定时选它：它在对话中途给一个组织起名、把刚刚 spawn 出来的 worker 加进去，之后再把成员读回来。如果只有 host 代码或 UI 会创建组织，就别加它——注册表从一行 host 配置就能直接触达，而这些工具回答不了任何它回答不了的问题。

### 最小可用配置

<a id="smallest-working-setup"></a>

这些工具消费一个 host service、自己不发布任何 service，因此注册表的记录放在 host 平面，工具那一行放在 agent 组装里：

```yaml
# host composition — the storage domain plus the organization registry
- name: '@deepseek-ai/dsh-storage'
- name: '@deepseek-ai/dsh-storage-domain'
- name: '@deepseek-ai/dsh-experimental-agent-org'
# agent composition — the model-facing tools
- name: '@deepseek-ai/dsh-experimental-tool-agent-org'
```

该插件不接受任何配置：所有上限都属于注册表，工具集本身是固定的。

### 这四个工具

`org_create` 接收一个显示名，存下一个组织，并把调用方会话以 `manager` 身份记入其中。它返回组织自己的 id，后续每一次调用都用这个 id 点名。

`org_add_worker` 接收那个 id 外加一个正在运行的 worker 的会话 id，追加一行 `worker`。这个会话 id 就是 `spawn_teammate` 与 `list_agents` 返回的那个，所以模型传的是它手上已有的值，而不是自己拼一个出来。

`org_list` 回答调用方会话所属的每一个组织，最新的在前。worker 调用它，就能看到招募过它的每一个 manager。

`org_members` 按加入顺序读取一份名册，每行带着它的会话 id、角色，以及这一行被写下来的那个时刻。

### 成功与失败分别长什么样

成功长这样：`org_create` 返回一个 id 且 `memberCount` 为 1，每次 `org_add_worker` 返回同一个 id 且成员数加一，`org_members` 把 manager 排在第一、后面按加入顺序列出 worker。manager 会话结束之后，这些记录依然可读。

失败是带着注册表自己那条消息的工具错误，绝不会是一次无声的部分写入。没有任何活 Agent 应答的会话 id 会在任何记录被写下之前就被拒绝，消息里会点名这个 id 并指向 `spawn_teammate` 与 `list_agents`。未知的组织 id、同一组织里同一会话的第二行、空名或超长名，以及两条耗尽上限，都由注册表拒绝并原样透传。不带 Agent 的调用会被点名拒绝，因为 `org_create` 与 `org_list` 回答的就是关于调用方会话的问题。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部细节 —— 点击展开</summary>

本节解释这些工具背后的设计决定，并指向实现它们的代码；可观测行为已在[使用本包](#use-this-package)中完整覆盖。

### 设计理念

- **一个组装一个信箱。** 创建组织是本包新增的唯一动作。spawn、发信与共享任务都留在 `tool-agent-team`，因此 `pnpm run duplication` 只会找到一条投递路径，而不是两条。
- **调用方就是 manager。** `org_create` 记的是调用方会话本身，而不是接收一个 manager id，这样模型就无法把别人指成自己刚创建的那个分组的 manager。
- **错的会话 id 在写入那一刻失败。** 注册表存的是它并不拥有、也永不对账的会话 id，所以记录被写下的那一刻是唯一能拒掉一个幻觉 id 的时机。`org_add_worker` 先把这个 id 解析到活 Agent 上。

### 源码地图

| 文件 | 作用 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：四个工具定义、它们的输出 schema，以及调用方会话与活会话两个解析器 |

### 注册平面

这些工具通过 `ctx.tools.register` 注册在组装所在的平面上，而不是按 Agent scope 注册，因为每次调用都是从执行元数据里读出它的调用者，而不是从一个 scoped 闭包里读。因此该组装中的每个 Agent 看到的都是同样这四份 schema，而处置该插件会把它们从每一次组装中移除。

### 输出形状

每个结果都是建立在声明过的值 schema 之上的紧凑 JSON，因此编译器会检查承诺给模型的到底是什么。`org_create` 与 `org_add_worker` 返回不带名册、但带 `memberCount` 的组织，这是「记录确实落下来了」最便宜的证据；`org_members` 是专门用来读那些记录本身的另一次读取。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当包级约定不够用时，读这些页面。

- [agent-org 包](../agent-org/README.zh.md) —— 这些工具调用的那个持久注册表、它的上限与它的失败码。
- [tool-agent-team 包](../tool-agent-team/README.zh.md) —— manager 在给分组起名之后使用的 spawn、发信与共享任务工具。
- [添加一个工具](../../../docs/cookbook/adding-a-tool.zh.md) —— 本包遵循的工具定义、结果与展示规则。

-----

<a id="model-experience"></a>
## 模型体验

### 组织工具

#### 模型看到什么

四份 schema，没有任何提示段落：`org_create`（一个显示名）、`org_add_worker`（一个组织 id 加一个 worker 会话 id）、`org_list`（无参数）与 `org_members`（一个组织 id）。策略全部由描述承载——组织拥有自己的 id 并比创建它的会话活得更久，会话 id 来自 `spawn_teammate` 或 `list_agents` 且必须仍在运行，一个会话可以是多个组织的 worker 但在同一组织里绝不会出现两次。结果是紧凑 JSON：一条带 `memberCount` 的组织记录、一组这样的记录，或一份由 `sessionId`/`role`/`joinedAt` 组成的名册。

#### Token 影响

装载了这一行的那个组装，每次请求多出四份工具 schema，除此之外没有别的：该插件不注册任何系统提示段落，也不注册它自己的任何会话事件。每次调用追加一条简短的 JSON 结果，其体积由注册表的 `maxOrgs` 与 `maxMembersPerOrg` 上限兜住。

#### KV Cache 影响

这些 schema 加入稳定的工具列表，因此装载这一行只会改变一次可复用的请求前缀，而成员资格的变化永远不会。结果像任何别的工具结果一样追加在那段前缀之后。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

以下是本包当前的约束，不是与其他分组机制的对比。

- **实验性原型，不承诺稳定性** —— 本包公开发布，但在孵化期内它的工具名、参数与结果都可以自由变化。
- **没有权限模型** —— 任何持有这些工具的 Agent 都可以创建组织、按 id 把 worker 加进任何组织、读取任何名册。注册表目前没有权限模型，而一个执行器可以绕开的工具侧检查并不构成强制。
- **manager 那一行只由创建写入** —— `org_add_worker` 永远写 `worker` 角色。记下第二个 manager、或者改一个角色，都需要直接走注册表。
- **没有移除也没有删除** —— `leave` 与 `delete` 没有对应工具，所以一行错的记录会一直留着，直到 host 代码把它清掉。撤销成员资格的那些工具等着真正需要它们的消费者出现。
- **worker 被加进来的时候必须正在运行** —— 那条拒掉幻觉会话 id 的活 Agent 检查同样会拒掉一个已结束的 id，因此一个会话停掉之后就无法再被招募。
- **没有 `./invariant` 伴生包** —— 不发布 runtime invariant 伴生包，因为本包不拥有任何关系：它写下的每一行都属于注册表，而注册表是它唯一的观察者。这里的伴生包只能把注册表已经回答过的东西再读一遍，而[包 invariant 规则](../AGENTS.md)拒绝这种空检查。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文 —— 点击展开</summary>

本开发备注是给维护者看的工作上下文，明确不具权威性。

#### 晋升

按[实验性子树规则](../AGENTS.md)，晋升到产品角色分组需要 review 面向模型的约定、限制、测试证据、发布产物、运行时依赖方，以及一位具名的稳定 owner。

#### 未来方向

尚未决定的方向包括：移除与删除工具、在执行层面区分 manager 与 worker 的权限模型、用名字而不是会话 id 来指代一个 worker，以及招募一个已结束的会话到底该不该被允许。这些都还没有定论。

</details>
