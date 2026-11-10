---
description: "Web 客户端的部署皮肤 —— 品牌填充、主题 token 与排版全部以追加方式提供；供需要让部署拥有自己的身份、又不想改动上游 UI 包的维护者阅读。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-skin

[English](README.md) | 中文

## 概述

本包承载一个部署的视觉身份：侧栏与首屏的品牌填充，以及它的配色、排版、标签页图标与安装清单。它改动的每一个面都以追加方式提供 —— 一个 slot 填充、一次主题 token 覆盖、一张落在主题包自身样式表之后的样式表，或者 Node 半边自己应答的一条路由 —— 因此部署可以拥有自己的外观，而不必改动 `dsh-client-ui-theme`、`dsh-client-ui-sidebar`、`dsh-client-ui-conversation`，也不必改动 `apps/web` 下的任何文件。从 profile patch 挂载即可；不挂载时外壳渲染自带兜底。本包不保留运行时状态，也没有任何内容进入模型请求。

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

把这一行插在 Web profile patch 的末尾，这样本包追加的样式表就落在主题包那几张样式表之后：

```yaml
- insert:
    - id: ui-skin
      name: '@deepseek-ai/dsh-client-ui-skin'
```

这一行从 profile 目录能解析到的位置解析，因此部署可以把本包放在自己的 profile 旁边，而不必放进产品的依赖树。

### 给部署起名

产品名只有一个落点：`src/brand.ts`，它读 `DSH_CLIENT_BRAND_NAME`，缺省回落到 `Harness`。浏览器包在构建时把这个变量内联进去，Node 半边则从服务进程自己的环境里读。因此要改名的部署必须在两处都设 —— 客户端构建时与宿主进程 —— 否则侧栏与安装清单会不一致。浏览器标签页标题是另一个构建环境取值 `DSH_CLIENT_TITLE`，由 `apps/web` 拥有。

### 它占用什么

侧栏标志、侧栏名称与会话首屏标志都是带兜底的 slot，注册填充即替换兜底。配色与字体值走 `ctx.theme.overrideTokens()`，它写成 `body` 上的内联自定义属性，因此不需要与任何上游样式表比拼选择器优先级。

### 它提供什么

有 Web 服务器在场时，Node 半边应答一个路由前缀 `/_skin`：把已安装字体包的 `@font-face` 样式表拼起来、样式表点名的那些 `woff2` 文件、标签页图标，以及安装清单。字体 URL 带一段由样式表摘要导出的修订号，因此以不可变缓存提供，而字体升级会改变摘要从而使其失效。样式表的 `<link>` 经 `webserver/index-inject` 表到达；图标与清单的引用则靠改写送出的文档完成 —— 自带的两个标签留在 `apps/web/index.html` 里，而第二个图标 link 只会让浏览器在两者之间挑一个。

没有 Web 服务器时 —— Electron 宿主走 `file://`，worker 部署自带载荷 —— Node 半边什么也不注册。

### 它不做什么

本包没有配置面。需要不同取值的部署应改动本包，或用另一个包取代它 —— 一次只有一行皮肤。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部细节 —— 点击展开</summary>

Node 半边（[`src/index.ts`](src/index.ts)）提供本皮肤自己的资源，并在送出的 index 文档上打一个改写口；没有 Web 服务器时它什么也不注册。[`src/fonts.ts`](src/fonts.ts) 在首次请求时读已安装字体包的样式表，只保留其中的 `woff2` 源，把每个相对 URL 改写到这条路由上，并返回该路由据以应答的文件白名单 —— 因此请求无法点名样式表从未指向过的路径，而字体字节既不进本仓库也不进 Web 包。浏览器半边（[`src/client/index.ts`](src/client/index.ts)）在 `ctx.effect()` 里追加样式表，因此该行停用时样式表随之撤回，重载过程中不会留下半套皮肤。标志的几何与两个墨色住在两个面无关的模块里（[`src/mark-geometry.ts`](src/mark-geometry.ts)、[`src/ink.ts`](src/ink.ts)），两个半边都从那里引入，因此标签页图标不会与侧栏的那个走偏。

本包有两个编译面：[`tsconfig.host.json`](tsconfig.host.json) 给需要 node 环境类型的 Node 半边，[`tsconfig.client.json`](tsconfig.client.json) 给必须没有这些类型的浏览器半边。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当某个本包触及不到的面需要改动时，阅读以下页面。

- [ui-theme](../ui-theme/README.zh.md) —— 拥有本包覆盖的 token 层级，以及本包追加于其后的那几张样式表。
- [ui-sidebar](../ui-sidebar/README.zh.md) —— 声明 `sidebar.brand.mark` 与 `sidebar.brand.name`。
- [ui-conversation](../ui-conversation/README.zh.md) —— 在空首屏中声明 `conversation.hero.brand.mark`。
- [ui-brand-official](../ui-brand-official/README.zh.md) —— 本包形状所遵循的那套按 profile 开关的填充集。

-----

<a id="model-experience"></a>
## 模型体验

无，本包仅贡献浏览器呈现；没有任何内容进入模型请求。

#### KV Cache 影响

无；本包既不组装也不发送供应方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>


以下限制描述一套皮肤今天能触及与不能触及的范围。它们是当前的装配约束，不是设计待办。

- **只覆盖有 slot 的面** —— 既没有 slot 也没有 token 的文案，例如空首屏的大标题，位于上游的文案字典，无法从这里覆盖；locale 运行时对重复的 namespace-locale 组合直接抛错。
- **没有配置面** —— 取值是源码而不是配置，因此两个身份不同的部署需要两个包，而不是两段配置。
- **启动闪屏触及不到** —— 它在任何插件行加载之前就渲染了。
- **名字要设两遍** —— 浏览器包在构建时把 `DSH_CLIENT_BRAND_NAME` 烤进去，Node 半边在运行时读它，因此改名的部署必须两处都设；只有共享的缺省值能自己保持一致。
- **字体依赖 Web 服务器** —— 字体经本包的路由到达页面，因此不带 Web 服务器提供客户端的部署只会保留两条字体栈的平台尾部。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文 —— 点击展开</summary>

本包无法以追加方式触及的那些面改在上游，每一笔补丁都记在[部署皮肤补丁账](../../../docs/skin-patches.zh.md)里，连同能删掉它的那条缝。把这份清单保持得短：每次升级都要人工读一遍补丁。

</details>

**运行时不变量：** 不发布伴随包。本包不保留可变状态，其样式表通过一次 effect 装上与撤回。
