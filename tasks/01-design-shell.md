# 里程碑 01：设计系统与应用壳

完成后得到可复用主题、基础组件和知识库优先的响应式导航壳，不接业务 API。

## UI-01 实现 Design Tokens 与主题

- 依赖：FND-02。
- 必读：`docs/01-design/design-system.md`、`docs/03-engineering/quality-gates.md`。
- 目标：实现纸张棕金、中性预设及各自浅色/深色 Token，支持跟随系统和持久化选择。
- 实施：颜色、排版、间距、圆角、阴影和动效分别建 Token；用展示页覆盖全部语义角色。
- 非目标：可视化主题编辑器和业务组件。
- 验收：切换主题无需业务分支；刷新保持选择；对比度和 reduced motion 检查通过。
- 验证：Token 单元检查、组件视觉截图、键盘切换测试。

## UI-02 封装 Radix 基础组件

- 依赖：UI-01。
- 必读：`docs/01-design/design-system.md`、`docs/03-engineering/development.md`、`docs/03-engineering/research-and-dependencies.md`。
- 目标：在 `packages/ui` 封装 Button、Dialog、Popover、Menu、Tooltip、Tabs、Select、Toast 和表单基础件。
- 实施：保留 Radix 可访问行为；CSS Modules 引用 Token；API 只暴露稳定语义变体。
- 非目标：领域卡片、编辑器工具栏和 Workflow 节点。
- 验收：键盘、焦点恢复和错误文本可用；无原子化 CSS；无空壳代理组件。
- 验证：组件测试、axe 检查、浅/深主题视觉回归。

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
