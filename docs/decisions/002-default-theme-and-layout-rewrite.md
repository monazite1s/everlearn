# ADR 002：删除自定义主题色板并整体重写布局为 shadcn 默认体系

- 状态：已接受（用户于 2026-08-15 批准）
- 决策日期：2026-08-15
- 影响：`docs/decisions/001-shadcn-tailwind-migration.md` 的主题移植部分

## 背景与约束

- ADR 001 迁移 shadcn/ui + Tailwind v4 时保留了纸张棕金/雾灰中性两套自定义色板与主题切换；上线走查后用户判定自定义主题与 shadcn 控件仍未形成统一语言，决定放弃自定义主题，全面采用 shadcn/ui 官方默认主题色。
- 同时要求整体重写所有布局：应用壳与页面区块应接尽接 shadcn 布局组件（Sidebar 全家桶、Breadcrumb、Menu、Card、Empty、Skeleton 等），能组件化就组件化。

## 决策

1. **删除自定义色板**：paper/neutral × light/dark 四套裸值层与 `data-theme` 切换全部移除；主题入口 CSS 采用 shadcn 官方默认 oklch 变量（`:root` 浅色 + `.dark` 深色，含 sidebar/chart 全套语义色）。
2. **保留外观切换**：浅色/深色/跟随系统三态由单一 DropdownMenu 控制（shadcn 官方推荐模式），仍走自研 provider + `.dark` class + localStorage，不引入 next-themes。
3. **保留非颜色 token**：字号/行高、间距、圆角、断点（md=48rem/xl=80rem）与动效 token 与主题色无关，继续保留；标题衬线字体（font-serif）属排版而非主题色，保留。
4. **少量状态色补充**：shadcn 默认主题不含 success/warning 语义色，为状态语言表补两个固定 token（浅/深两态），其余颜色一律用官方语义（background/foreground/card/muted/accent/primary/destructive/sidebar/chart）。
5. **布局组件化**：应用壳采用官方 dashboard 骨架（SidebarProvider + AppSidebar + SidebarInset + SiteHeader），SidebarFooter 放用户/主题菜单；页面按官方示例粒度拆分组件（site-header、nav-_、section-_、状态块组件），Breadcrumb 由路由层级生成。
6. 业务代码禁止再引用已删除的 Everlearn 颜色 token（canvas/shell/surface/ink/accent-soft/danger 等），颜色一律走 shadcn 语义 utility。

## 备选方案与拒绝原因

- **继续维护自定义色板**：与 shadcn 控件默认视觉持续摩擦，且用户已明确放弃；拒绝。
- **引入 next-themes 替换自研 provider**：功能与现有 provider 重叠，扩大依赖面；拒绝（provider 本身简化为 appearance-only）。

## 代价

- design-system.md 的旧自定义色板与"书房棕金"命题作废；everlearn-shadcn-ui skill 中的 token 清单需同步改写。
- 主题选择 UI 与相关测试删除；`check-design-tokens.mjs` 的 token 事实源仍为主题入口 CSS，无需结构变化。
- 产品视觉个性弱化为默认 shadcn 外观；后续如需品牌化，在默认语义层上重新引入（升级路径：只加 `@theme` 覆盖，不动业务代码）。

## 移除条件

- shadcn 默认主题不再内置暗色 class 策略或语义变量结构发生破坏性变更时重开决策。
