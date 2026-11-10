# 部署皮肤补丁账

[English](skin-patches.md) | 中文

想要自己身份的部署加上 [`@deepseek-ai/dsh-client-ui-skin`](../packages/client/ui-skin/README.zh.md)，并从 profile patch 挂载它。该包能触及的一切 —— 品牌 slot、配色与字体 token、字体文件、标签页图标、安装清单 —— 在升级时零成本，因为一个新目录和一行新 profile 配置永远不会冲突。本页列出它**触及不到**的部分，这样下一次上游合并有一处可查，而不是在冲突标记里一个个发现。

让这份清单值得维护的那次测量：`master..upgrade/0.1.7-alpha.2` 在 `packages/client` 与 `apps/web` 下改写了 1783 个文件（+98002/−26318），而以追加方式贡献同类面的 `ui-brand-official` 源码一行未动。下表每一行都是在那种规模的升级里要人工读一遍的代码；每行的**缺失缝隙**就是能删掉该行的那个诉求。

## 已打补丁的上游文件

| 文件 | 皮肤需要什么 | 缺失的缝隙 |
|---|---|---|
| [`packages/client/ui-conversation/src/client/locales.ts`](../packages/client/ui-conversation/src/client/locales.ts) | 空首屏大标题，两种语言 | 大标题是 `t('hero.headline')`，没有 slot，而 locale 运行时给每个 namespace-locale 组合恰好一个所有者，因此后来的插件无法覆盖单个 key。给大标题加一个 slot，或者支持按 key 覆盖，都能删掉这一行。 |
| [`packages/client/web/src/boot-page.ts`](../packages/client/web/src/boot-page.ts) | 让闪屏字标说出部署的名字 | 闪屏在任何插件行加载之前渲染，因此没有填充能触及它。它现在读 `DSH_CLIENT_BRAND_NAME` —— 皮肤的名字缺省也来自这个构建变量 —— 于是这一行是一次性的改动，而不是反复的改动。 |
| [`scripts/gen-third-party-notices.ts`](../scripts/gen-third-party-notices.ts) | 让 OFL-1.1 字体包通过运行期许可闸门 | 该闸门只认宽松的代码许可和一条按身份授权的例外，没有一类用于「交付资源而非代码」的依赖。新增的 `isAssetOnly` 放行字体许可，同时不把它重分类为宽松。 |
| [`scripts/package-dependency-policy.ts`](../scripts/package-dependency-policy.ts) | 让三个字体包留在运行期依赖里 | 一个有 Client 面的包，它的外部依赖都是浏览器构建输入，因此该策略要求它们只能出现在 `devDependencies`。皮肤的主机半边按路径解析已安装的字体包并从里面提供文件，而没有任何静态 import 点到它们的名字，所以新增的 `hostRuntimeAssetDependencies` 按包记录这一关系。一个能把「按路径解析」看成运行期使用的闸门可以删掉这一行。 |

测试与录制输出是跟着文案改动走的，不是为自身而打的补丁：[`packages/client/ui-conversation/tests/skeleton.client.spec.tsx`](../packages/client/ui-conversation/tests/skeleton.client.spec.tsx)、[`packages/client/web/tests/boot-page.client.spec.ts`](../packages/client/web/tests/boot-page.client.spec.ts)、[`scripts/gen-third-party-notices.spec.ts`](../scripts/gen-third-party-notices.spec.ts)、[`scripts/verify-package-dependencies.spec.ts`](../scripts/verify-package-dependencies.spec.ts)、[`apps/web/tests/`](../apps/web/tests/) 下按文本选中首屏的五套 Playwright 用例，以及 `snapshots/web/lifecycle-chrome/` 里记录它的两份文档。

## 是登记，不是补丁

加任何一个包都会动到这些文件；列出来是为了让升级时的冲突可被认出，而不是把它算成皮肤本可避免的代价。

- [`tsconfig.base.json`](../tsconfig.base.json) —— 两条 import 路径，每个工作区包都要声明。
- [`tsconfig.host.json`](../tsconfig.host.json) 与 [`tsconfig.client.json`](../tsconfig.client.json) —— 各一条引用，这是[工程布局](development.zh.md#typescript-project-layout)对有两个编译面的包的要求。
- [`scripts/verify-package-readme-model-experience.ts`](../scripts/verify-package-readme-model-experience.ts) —— 每个包 README 都要声明的那一行句式约定。
- `pnpm-lock.yaml`、[`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md)、[`docs/module-graph.zh.md`](module-graph.zh.md) 与 [`packages/extensions/cordis-client-runner/src/client/slot-catalog.ts`](../packages/extensions/cordis-client-runner/src/client/slot-catalog.ts) —— 生成物；重新生成，不要合并。

## 故意不打补丁的地方

- **`DSH_CLIENT_BUILD_PROFILE` 保持不设。** 把它设成 `official` 会唤醒 `ui-brand-official`，它的填充会把三个品牌 slot 夺回去。
- **`ui-settings-models` 那一行保持启用。** 禁用它会把模型设置页和它的引导提示一起拿走。
- **`apps/web` 下不改任何文件。** 标签页图标与安装清单由皮肤自己的路由提供，送出文档里的两处品牌引用在出门时被改写。
- **`CONTRIBUTING.zh.md` 保留它的结尾句。** 那是仓库自己的声音，不是产品 UI。
