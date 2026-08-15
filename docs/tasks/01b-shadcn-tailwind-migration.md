# 里程碑 01B：shadcn/ui + Tailwind v4 迁移与 UI 重构

依据 `docs/decisions/001-shadcn-tailwind-migration.md`（用户 2026-08-15 批准）。本里程碑完成规范更新、组件与样式系统迁移、页面按新组件库重构，并一次性删除 Mantine。

## STW-00 决策与深度调研

- 状态：已完成。
- 调研：三路并行——GitHub 高赞 skill（shadcn 官方 skill 源码 `shadcn-ui/ui/skills`、`mattbx/shadcn-skills`）、Tailwind v4 官方规范（@theme/dark-mode/@source/monorepo）、shadcn 布局方案（Sidebar API、Blocks、Linear/Raycast 密度惯例）。一手调研（官方 skill/CLI 文档）由主 agent 直接核验。
- 采纳：shadcn CLI 源码所有权模式；官方 skill 的组合规则（gap-* 优先、语义色强制、Dialog 必须有标题等）与审查清单；Tailwind 三层变量结构。
- 拒绝：shadcn MCP（CLI search/docs 已覆盖）、prettier-plugin-tailwindcss（后续评估）、第三方主题 preset（仅参考）。
- 验证：官方文档 URL 与内容逐项核对（skills、CLI flag、theming、monorepo、@theme inline 语义）。

## STW-01 规范与配置更新

- 状态：已完成。
- 改动：新增 `docs/decisions/001-shadcn-tailwind-migration.md`；更新 `AGENTS.md`（技术边界、Skill 路由表新增 everlearn-shadcn-ui）、`research-and-dependencies.md`（新研究记录 + 基线表 + Tailwind 禁令废止）、`design-system.md`（Tailwind token 映射验收项、组件规则、禁止项）、`layout-and-navigation.md`（Sidebar 应用壳实现约定）、`system.md`、`vibe-coding-standards.md`、`quality-gates.md`、`development-handoff-spec.md`、`.agents/roles/ui-designer.md`；`ui-redesign-proposal.md` 标注 Mantine 部分为历史参考。
- 新增项目 Skill：`.agents/skills/everlearn-shadcn-ui/`（SKILL.md + references/tailwind-standards.md、component-usage.md、layout-patterns.md、cli.md、review-checklist.md），吸收官方 skill 规则并叠加 Everlearn 门禁。

## STW-02 基础设施与主题移植

- 状态：已完成。
- 改动：`packages/ui/src/styles/globals.css` 三层变量主题（四套色板 × 双模式保留；`:root`/`.dark` 裸值层、`@theme inline` 映射层、语义 utility 消费层；断点 md=48rem/xl=80rem token 化）；`packages/ui` 改为 shadcn 组件宿主（components.json、18 个组件 + use-mobile、cn()；Radix 底座 new-york 风格）；`apps/web` Tailwind 入口（globals.css 引包内主题 + `@source` 跨包扫描）+ PostCSS；theme-provider 切换 `.dark` class；workspace catalog 收录全部新依赖。
- vendored 治理：`scripts/check-file-size.mjs`、`check-comments.mjs`、ESLint 配置对 `packages/ui/src/components`（CLI 生成源码）按第三方豁免；`check-design-tokens.mjs` 重写为 Tailwind 纪律门禁（token 引用完整性、断点双档制、裸色/任意值/`dark:`/动态类禁令，spec 文件豁免类名检查）；stylelint 保留为存量 CSS Modules 过渡门禁。
- 验证：PostCSS 直接编译入口 CSS 确认 `bg-canvas → var(--canvas)`、`md: → @media (width >= 48rem)`；生产构建产物包含全部四套色板。

## STW-03 应用壳与页面迁移（删除 Mantine）

- 状态：已完成。
- 改动：应用壳重建为 shadcn Sidebar（`collapsible="icon"`、Cmd/Ctrl+B 内建、折叠持久化沿用、移动端内置 Sheet）；顶栏 48px sticky + Breadcrumb；右栏 320px 上下文面板（xl 断点，按路由持久化）；假数据「运行中 2」与死链「搜索」按钮删除（规格：能力上线前不渲染）；主题控制改 shadcn Select。features/home、features/knowledge、shared 全部迁移（Dialog/AlertDialog/DropdownMenu/Field/Card/Empty/Skeleton/Badge），顺手修复「保存中字段未禁用」旧缺陷；全部 7 个 CSS Modules 删除，仓库不再存在 CSS Modules；`@mantine/*` 从依赖与 catalog 移除。
- 并行实施：外壳+主题 与 页面+共享层 由两个 frontend-developer sub agent 按契约并行完成，主 agent 负责集成与门禁。
- 验证（真实命令）：
  - `pnpm check` 全链通过（file-size、design-tokens、structure、format、lint、typecheck、test、build）。
  - `pnpm test`：14 文件 46 用例通过（组件 7 文件 25 用例）。
  - `pnpm --filter @everlearn/ui typecheck`、`pnpm --filter @everlearn/web typecheck` 通过。
  - ESLint 对 vendored 目录豁免 JSDoc/规模/风格规则后 `pnpm lint` 全绿。

## STW-04 真实浏览器走查（生产构建 + 真实数据）

- 状态：已完成。
- 环境：`next start -p 3002`（生产构建）+ 本地 API（127.0.0.1:3001）+ 真实知识库数据；PostgreSQL/Redis 容器运行中。
- 走查页面：首页（浅色/深色/390px）、知识库列表（浅色桌面）、知识库详情（浅色桌面）、新建知识库对话框（含表单标签与校验禁用态）。
- 截图留档：`docs/tasks/evidence/2026-08-15-shadcn-tailwind-migration/`（home-light-desktop / home-dark-desktop / home-mobile-390 / knowledge-light-desktop / detail-light-desktop）。
- 视觉评审结论（图像模型走查）：无破损渲染、无横向溢出、无重叠；深色主题正确应用且三层表面可辨；卡片三级文本（名称/描述/元信息）区分清晰；整体接近 Linear/Notion 商业质感，剩余为打磨级问题（卡片内边距偏舒适、侧栏与画布的表面差异可再拉开）。
- 修复：vendored 组件英文可访问名称汉化（SidebarTrigger sr-only、SidebarRail aria-label/title、Dialog/Sheet Close→关闭/切换导航/切换侧栏），重构建后快照复核无英文标签残留。
- 风险与残留：
  - Radix Sheet 关闭后「焦点回触发器」在 jsdom 无法断言（组件内建行为），真实浏览器走查中未逐项验证键盘焦点路径；编辑器任务前建议按 delivery-checklist 做一次键盘全流程走查。
  - `check-design-tokens.mjs` 类名检查为正则级（非 AST），可被注释中的类样式文本绕过；依赖评审兜底。
  - prettier-plugin-tailwindcss 未引入，类名顺序暂无自动排序；形成实际痛点后再评估。
  - Stylelint 对已清零的 CSS Modules 仅作过渡门禁，待确认无回潮后可移除 `lint:css`。

## STW-05 迁移复核与提交准备

- 状态：已完成。
- 范围复核：`shadcn info --json` 确认 `new-york`、`base=radix`、Tailwind v4 与 19 个已安装组件；仓库搜索确认无 Mantine 依赖、导入或 CSS Modules 残留。ADR 001 与依赖研究中误写的 Base UI 已按实际 CLI 结果更正为 Radix，不改变运行代码。
- 缺陷与回归：发现全局关闭默认焦点描边后普通链接缺少可见焦点反馈；先扩展 `check:design-tokens` 复现失败，再为 `a:focus-visible` 恢复统一 ring 色描边，门禁转绿。
- 浏览器走查：本地生产 Web（3002）+ API（3001）真实数据；桌面浅色/深色、知识库列表与详情、新建/编辑/删除浮层、390×844 首页与移动导航抽屉均正常，控制台无 warning/error。移动抽屉截图在 260ms 入场动效结束后复核，无裁切、重叠或横向溢出。
- 完整验证：`pnpm check` 通过；14 个测试文件 46 个用例通过、4 个文件 13 个用例按配置跳过；Next 生产构建生成 8 条路由。此前完整检查中健康集成测试偶发空响应，聚焦复跑通过，本次完整检查也稳定通过。
- 第二视角：沿用 STW-04 已留档的独立视觉评审结论；本轮未新增页面结构或视觉方向，只修复链接焦点反馈与事实源表述。
- 风险：无新增运行风险；`@everlearn/ui#build` 仍有既有 Turbo“无输出文件”提示，因为该包 build 仅执行 `tsc --noEmit`，不影响本次通过结论。
