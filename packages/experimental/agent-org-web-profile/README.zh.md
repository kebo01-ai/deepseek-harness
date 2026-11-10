---
description: "在 Host 层之后，把公开的实验性智能组织名册加入 Web profile。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-experimental-agent-org-web-profile

[English](README.md) | 中文

## 概述

`dsh-experimental-agent-org-web-profile` 是[智能组织](../agent-org/README.zh.md)公开发布的实验性 Web 层。把它放在 `@deepseek-ai/dsh-web-app` 与 [`@deepseek-ai/dsh-experimental-agent-org-profile`](../agent-org-profile/README.zh.md) 之后，即可在浏览器中显示组织名册、成员实时状态与成员导航。移除任一实验层都会让稳定的 base 与 Web composition 保持不变。随附 Web profile 默认不会启用它。

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

按这个顺序把 Host 与 Web 两个组织层加入已初始化的 `web` profile：

```sh
dsh plugin --profile web add @deepseek-ai/dsh-experimental-agent-org-profile
dsh plugin --profile web add @deepseek-ai/dsh-experimental-agent-org-web-profile
```

第一条命令提供组织 domain、生成的 Remote 只读读取与模型工具。第二条激活本包声明的 patch 及其浏览器 presentation。执行 `dsh plugin --profile web remove @deepseek-ai/dsh-experimental-agent-org-web-profile` 移除本包时，Web 层也会从 profile 的有序 bundle 列表中移除。

### 你会得到什么

对话页头部会出现组织名册，每个成员带实时状态。选中一个成员会把那个 Session 作为 continuable 子 Session 打开，因此普通对话页与它的输入框可以直接到达 worker。[`@deepseek-ai/dsh-experimental-client-ui-agent-org`](../client-ui-agent-org/README.zh.md) 拥有这些浏览器交互，并挂载用于到达 Host 登记的生成式 Client Remote 命名空间。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 —— 点击展开</summary>

本包的运行时内容就是 [`cordis.patch.yml`](cordis.patch.yml)。它在 `dsh-web-app` 与 Host 侧组织层之后应用，唯一的 `insert` 条目为 `@deepseek-ai/dsh-experimental-client-ui-agent-org` 加入 `ui-agent-org` 行。被插入的 Client plugin 拥有生成式 Remote 装配与名册 UI；这个静态 bundle 不持有可变状态，也不安装运行时 invariant。

| 文件 | 角色 |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | 含 `ui-agent-org` 行的有序 Web patch |
| [`src/index.ts`](src/index.ts) | 空模块入口；patch 才是运行时内容 |
| — | 不发布运行时 invariant 伴随包；本包只携带一份静态 profile patch。Remote 装配与名册 UI 各自拥有自己的激活要求。 |

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

- [实验性包](../README.zh.md)——孵化状态与发布策略。
- [智能组织 Host profile](../agent-org-profile/README.zh.md)——所需的 domain、Remote 与模型工具层。
- [智能组织浏览器 UI](../client-ui-agent-org/README.zh.md)——名册、实时状态与成员导航的行为。
- [Web bundle](../../bundle/web-app/README.zh.md)——本 patch 扩展的稳定浏览器层。

-----

<a id="model-experience"></a>
## 模型体验

间接体现——通过与本 Web 层一起选用的 Host 侧组织 profile。

#### KV Cache 影响

这个 Web bundle 不增加模型请求内容；prompt、schema 与缓存影响由 Host 侧的组织工具拥有。

## 已知限制与未完成工作

<a id="known-limitations-and-deferred-work"></a>

- **有序组合**——`dsh-base`、`dsh-web-app`、`dsh-experimental-agent-org-profile` 与本包必须保持这个顺序。
- **名册与旧的子 Session 控件并存**——稳定 Web preset 仍在 preset scope 内挂载 continuable Subagent 控件。顶层 Host profile 覆盖不会替换那些 scoped 注册，因此在 Web 有一个组织感知的 preset 之前，组织名册与旧的子控件可能同时出现。
- **仅 opt-in**——本包是公开的，但没有任何随附 Web profile 默认启用这两个组织层。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>给维护者的工作上下文 —— 点击展开</summary>

无。

</details>
