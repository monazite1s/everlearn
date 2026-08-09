# 里程碑 01：设计系统与应用壳

完成后得到可复用主题、基础组件和知识库优先的响应式导航壳，不接业务 API。

## UI-01 实现 Design Tokens 与主题

- 状态：已完成。
- 依赖：FND-05。
- 必读：`docs/01-design/design-system.md`、`docs/03-engineering/quality-gates.md`。
- 目标：实现纸张棕金、中性预设及各自浅色/深色 Token，支持跟随系统和持久化选择。
- 实施：颜色、排版、间距、圆角、阴影和动效分别建 Token；用展示页覆盖全部语义角色。
- 非目标：可视化主题编辑器和业务组件。
- 验收：切换主题无需业务分支；刷新保持选择；对比度和 reduced motion 检查通过。
- 验证：Token 单元检查、组件视觉截图、键盘切换测试。

### UI-01 完成证据

- 改动：拆分六类语义 Token，建立纸张棕金/雾灰中性两套浅深色主题、首屏恢复脚本、跟随系统、本地持久化及语义色展示页。
- 验证：`pnpm check` 全部退出 0，17 个测试通过且全局分支覆盖率 80%；`pnpm test:e2e` 退出 0，1 个 Chromium E2E 通过。
- 证据：`switches and persists semantic theme selection`、`opens the foundation page`；浏览器实测刷新后保持 `neutral:dark`，320px 视口无水平溢出。
- 风险：当前仅提供预设主题；新增预设需同时补充主题元数据和 CSS Token 值，不影响业务组件。

## UI-02 封装 Radix 基础组件

- 状态：已完成。
- 依赖：UI-01。
- 必读：`docs/01-design/design-system.md`、`docs/03-engineering/development.md`、`docs/03-engineering/research-and-dependencies.md`。
- 目标：在 `packages/ui` 封装 Button、Dialog、Popover、Menu、Tooltip、Tabs、Select、Toast 和表单基础件。
- 实施：保留 Radix 可访问行为；CSS Modules 引用 Token；API 只暴露稳定语义变体。
- 非目标：领域卡片、编辑器工具栏和 Workflow 节点。
- 验收：键盘、焦点恢复和错误文本可用；无原子化 CSS；无空壳代理组件。
- 验证：组件测试、axe 检查、浅/深主题视觉回归。

### UI-02 完成证据

- 改动：在 `packages/ui` 提供 Button、表单、Dialog、Popover、Menu、Tooltip、Tabs、Select 和 Toast；Web 标本页验证共享包编译及主题适配。
- 验证：`pnpm check` 退出 0，26 个测试通过，全局分支覆盖率 86.32%，UI 包分支覆盖率 91.93%；Chrome 中基础页及 Dialog 的 axe 检查无违规。
- 证据：组件测试覆盖键盘导航、焦点恢复、错误关联、选择和通知动作；人工检查纸张主题浅色、深色及 Dialog，页面无水平溢出。
- 风险：当前 Codex 终端中 Playwright 在断言全部通过后未自动退出；测试结果有效，进程清理问题留待工程基础设施任务处理。

## UI-03 实现桌面应用壳

- 依赖：UI-02。
- 必读：`docs/01-design/layout-and-navigation.md`、`docs/01-design/pages/home.md`、`docs/01-design/design-system.md`。
- 目标：实现顶栏、六项一级导航、左右可折叠栏和中央工作区。
- 实施：建立真实路由、焦点管理、知识脊线和 Skeleton；使用静态数据占位。
- 非目标：首页业务数据和各模块二级导航。
- 验收：当前入口有文本和 `aria-current`；路由后焦点到标题；中央区不被侧栏压缩低于规格。
- 验证：Playwright 桌面导航与截图、键盘测试。

## UI-04 实现移动只读壳

- 依赖：UI-03。
- 必读：`docs/01-design/layout-and-navigation.md`、`docs/00-product/product-spec.md`。
- 目标：在 ≤768px 使用导航抽屉并阻止创作界面降级为不可用的小屏编辑器。
- 实施：定义只读路由能力表；创作入口展示桌面端提示；保留阅读、搜索和运行状态容器。
- 非目标：移动编辑、离线缓存和 PWA。
- 验收：无整体水平滚动；编辑路由不加载编辑器；抽屉焦点陷阱和返回焦点正确。
- 验证：Playwright 移动视口、axe、截图比较。

## UI-05 实现首页静态结构

- 依赖：UI-03、UI-04。
- 必读：`docs/01-design/pages/home.md`、`docs/01-design/design-system.md`。
- 目标：用类型安全 Mock 实现最近文档、知识库、快速记录和右侧运行摘要的全部视觉状态。
- 实施：覆盖正常、首次使用、局部失败、加载和离线；业务数据接入由后续任务完成。
- 非目标：创建知识库 API、Inbox 写入和真实运行状态。
- 验收：知识库是视觉主体；无任务时不显示空状态卡片；每个错误提供局部重试。
- 验证：组件状态测试、桌面/移动视觉回归。

## 检查点

完成后运行 UI package 测试、axe、桌面/移动 Playwright 和 `pnpm check`；人工确认默认主题没有聊天或 AI 渐变风格。
