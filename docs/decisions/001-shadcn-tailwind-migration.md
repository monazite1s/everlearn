# ADR 001：组件系统与样式方案迁移至 shadcn/ui + Tailwind CSS v4

- 状态：已接受（用户于 2026-08-15 批准）
- 决策日期：2026-08-15
- 取代：2026-08-12 Mantine 迁移决策（见 `docs/03-engineering/research-and-dependencies.md` 研究记录）

## 背景与约束

- 当前 UI 由 Mantine 9.5.1 + CSS Modules + 自定义语义 Token 实现，仅进入约 10 个源码文件；编辑器、Workflow 画布、Command Menu、复杂表单尚未开工，迁移窗口成本最低。
- 视觉现状未达商业化门槛：页面结构模板化、三栏 Shell 过早占据视觉中心、Token 映射完成但组件级视觉（Button/Input/Dialog/Menu/Card）未完成设计。根因分析结论：换库本身不修复页面层级，需与 UI 重构同时进行。
- Mantine 于 2026-08-12 采用，当时研究未评估 shadcn/ui，对比面不足；本次研究补全三条路径（Mantine 深度定制 / shadcn + Tailwind v4 / shadcn 源码改写 CSS Modules）。
- 产品对标 Linear/Notion/Raycast 的密度与质感；shadcn 的默认比例、边界、浮层与表单视觉基线最接近该目标。

## 决策

1. 采用 **shadcn/ui + Tailwind CSS v4** 作为唯一组件与样式系统；组件源码进仓库由项目维护，通过 shadcn CLI 管理安装与升级。
2. 底层原语采用本次 shadcn CLI 生成的 **Radix** 预设与 `new-york` 风格；`shadcn info` 必须能复核 `base=radix`，更换底座视为新的 ADR 决策。
3. 主题体系保留现有语义 Token 结构（paper/neutral × light/dark 四套色板），按 shadcn 三层变量模式迁移：`:root`/`.dark` 裸值切换层 + `@theme inline` 映射层 + utility 消费层。
4. 暗色模式采用 class 策略（`@custom-variant dark`），由现有自研 theme-provider 驱动 `<html>` class，保留 `localStorage` 持久化与预绘制脚本；不引入 next-themes（现有 provider 功能完整）。
5. 应用壳改用 shadcn Sidebar 体系（`SidebarProvider`/`Sidebar`/`SidebarInset`，`collapsible="icon"`），移动端复用其内置 Sheet 行为；右侧上下文栏为普通 `aside` + Sheet 降级。
6. **一次性迁移，禁止 Mantine 与 shadcn 并存**；迁移序列内完成 Mantine 依赖删除。
7. Tailwind 与 CSS Modules 在迁移过渡期短暂共存，迁移完成后新代码禁止新建 CSS Modules；存量 CSS Modules 在后续任务中逐步消解。

## 备选方案与拒绝原因

- **继续 Mantine 深度定制**：视觉潜力相同，但仍需自行完成完整组件级视觉系统，且 Mantine 默认视觉语言与目标质感存在持续摩擦。保留为回退路径：若 shadcn 落地出现不可解的工程障碍，回 Mantine 并补做视觉系统。
- **shadcn 源码改写成 CSS Modules**：失去 CLI 官方工作流与升级通道，形成自维护分叉，成本高于收益。拒绝。
- **保留双组件库渐进迁移**：违反"同时引入职责重叠组件库"禁令，且长期并存会导致视觉与可访问性行为分裂。拒绝。

## 代价

- 项目此前禁止 Tailwind 的技术边界（AGENTS.md、design-system.md、research-and-dependencies.md）废止，相关规范文档与 lint 门禁需要同步改写。
- Stylelint token 门禁（`stylelint-declaration-strict-value`）与 `scripts/check-design-tokens.mjs` 基于 CSS Modules 体系，迁移后需改写为 Tailwind 体系下的等价纪律（语义色 utility 强制、断点双档制等）。
- 组件可访问性行为由项目自维护源码承担（shadcn 所有权模式），升级靠 `shadcn add --diff` 合并；此前"拒绝 Radix 包装层"的自维护顾虑以接受源码所有权的形式重新计入。
- 学习与生态成本：团队从 Mantine API 切换到 shadcn 组合式 API。

## 移除条件

- shadcn CLI 停止维护或与 Next/React 大版本长期不兼容（超过两个大版本未适配）时，重新评估组件底座。
- Tailwind v4 出现不可绕过的工程限制（构建、扫描、产物）且官方无修复路线时，回到 ADR 状态重开决策。
