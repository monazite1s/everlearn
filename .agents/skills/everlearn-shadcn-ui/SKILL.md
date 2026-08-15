# Skill: Everlearn shadcn/ui + Tailwind v4

设计、实现或评审 Everlearn 的 Tailwind 样式、shadcn/ui 组件、主题 Token、应用壳与浮层时使用。技术决策依据为 `docs/decisions/001-shadcn-tailwind-migration.md`（ADR 001）。

## 工作流

1. 读 `references/tailwind-standards.md`，确认主题三层变量、间距、断点与类名纪律。
2. 写任何 UI 前，先 `pnpm dlx shadcn@latest search <关键词>` 与 `shadcn docs <组件>` 确认组件库是否已有该能力；再检查 `packages/ui/src/components` 已安装清单。CLI 细节见 `references/cli.md`。
3. 按 `references/component-usage.md` 的组合规则写组件；禁止重写组件库已有的交互与可访问行为。
4. 页面与应用壳按 `references/layout-patterns.md` 的骨架与状态模式组合。
5. 交付前执行 `references/review-checklist.md` 的检查单自审。

## 硬门禁

- 组件只能经 shadcn CLI 安装与升级；禁止手工从 GitHub 拷贝 registry 文件；`--overwrite` 必须先获用户批准。
- utility 只消费官方语义 token（`bg-background`/`text-foreground`/`bg-card`/`text-muted-foreground`/`bg-primary`/`text-destructive`…，ADR 002）；裸色、原始色阶（`text-neutral-500`）、动态拼接类名一律禁止；同一任意值出现第二次必须提升为 `@theme` token。
- 双模式（浅色/深色）只能靠语义 token 切换层实现；禁止用 `dark:` 换色实现双模式。
- 禁止 Mantine 与任何第二套职责重叠组件库进入依赖。
- 新代码禁止新建 CSS Modules（ADR 001 迁移完成后）。

## 交付证据

- 新增/修改组件的清单与来源（CLI 安装 or 已有组件复用）。
- 新增语义 token 的浅色/深色对照与 AA 对比度说明。
- 布局变更的浅色/深色/390px 真实浏览器走查结论；临时截图不进仓库。
- review-checklist 自审结果。
