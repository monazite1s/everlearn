# Tailwind v4 工程规范

依据 Tailwind v4 官方文档（@theme、dark-mode、detecting-classes-in-source-files）整理，适用于 Everlearn 全部 Web 样式代码。

## 1. 主题三层变量结构（唯一正确写法）

单一事实源：`packages/ui` 的主题入口 CSS（被 `apps/web` 引用）。三层职责固定，不得混写：

```css
@import 'tailwindcss';
@custom-variant dark (&:where(.dark, .dark *));

/* 第一层：裸值切换层 —— 使用 shadcn 默认 neutral 浅色/深色语义值 */
:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0); /* … */
}
.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0); /* … */
}

/* 第二层：映射层 —— 引用了其他变量，必须 inline */
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --breakpoint-md: 48rem;
  --breakpoint-xl: 80rem;
}
```

- `@theme` 中引用其他变量的 token 必须 用 `@theme inline`，否则变量继承在定义处解析会取空值（官方文档明确要求）。
- `@theme` 必须在 CSS 顶层，不得嵌套 `:root` 或媒体查询。
- 第三层消费：业务代码只写 `bg-background`、`text-foreground`、`border-border`、`ring-ring` 等官方语义 utility。
- 每个 surface token 配对 foreground（如 `--color-accent` + `--color-accent-foreground`），成对出现在浅色与深色裸值层中。

## 2. 间距与字号

- 沿用默认 `--spacing: 0.25rem`（4px 基数）：`p-1`=4px、`p-2`=8px、`p-3`=12px、`p-4`=16px、`p-6`=24px、`p-8`=32px、`p-12`=48px，与既有 CSS Modules 刻度一一对应，迁移按倍数直译。
- 字号走语义 token（`--text-*` 命名空间生成 `text-body`、`text-title-medium` 等），不自造 `text-[15px]`。
- 行高用伴生 token（`--text-body--line-height`），不在业务处写 `leading-[1.75]`。

## 3. 断点与容器查询

- 视口断点只有两档：`md`（48rem/768px）、`xl`（80rem/1280px），在映射层定义；出现 `sm:`/`lg:`/`2xl:` 或任意值断点（`min-[320px]:`）视为违规。
- mobile-first 写法：`flex flex-col md:flex-row`（小屏无前缀，大屏加变体）。
- 组件内部自适应优先容器查询：父元素 `@container`，子元素 `@md:grid-cols-2`；卡片、列表项等可复用块不得依赖视口断点。

## 4. 暗色模式

- class 策略：`@custom-variant dark (&:where(.dark, .dark *))`；`.dark` class 由自研 theme-provider 挂在 `<html>`。
- `dark:` 变体只用于与语义 token 无关的一次性差异或官方 dashboard 模式类（如 SectionCards 的 `dark:*:data-[slot=card]:bg-card` 渐变回退）；用 `dark:` 做常规配色切换 = 错误，应改成 token 切换层解决。

## 5. 类名纪律

- 条件类一律 `cn()`（clsx + tailwind-merge，实现在 packages/ui `lib/utils`）；禁止模板字符串拼类、禁止三元嵌套。
- 禁止动态拼接类名（`bg-${color}-600`）——扫描器按纯文本识别，拼出来的类不会生成 CSS；用完整字符串映射表。
- 布局用 `gap-*`，禁止 `space-x-*`/`space-y-*`（官方 skill 规则；gap 在 flex 换行与 RTL 下正确）。
- 等宽高用 `size-8`，不写 `w-8 h-8`。
- 截断用 `truncate`/`line-clamp-*`，不手写 overflow 组合。
- 浮层不手写 z-index；shadcn 组件已管理层级。业务 z-index 只允许 `z-0/10/20/30/40/50`，出现 `z-[999]` 视为层叠结构问题。
- 溢出防护：flex/grid 子项长内容加 `min-w-0`；页面主容器 `overflow-x-hidden` 由壳统一处理。

## 6. 任意值与反模式

- 任意值（`mt-[13px]`）出现第二次 → 必须提升为 `@theme` token。一次性的结构性值（如 `w-320px` 的 aside 可写成 `w-80`）优先找刻度内等价值。
- 禁止 `@apply` 泛滥：仅允许在主题入口与少量第三方覆盖处使用；组件样式扩展用 `variant` prop + `cn()`，不用外部 className 覆盖默认样式。
- 长 className 不是问题（官方立场）：第一选择是提取组件（markup + 样式一起），不是抽样式工具类。

## 7. monorepo 扫描

- v4 自动检测不跨 workspace：`apps/web` 的入口 CSS 必须显式 `@source "../../packages/ui/src";` 注册共享包扫描。
- 排除大目录用 `@source not "..."`；`node_modules` 内的库同理需显式 `@source`。

## 8. CSS Modules 边界

- 迁移已清零 CSS Modules；新代码禁止重新引入。
- 第三方样式需要覆盖时优先使用组件公开 API，确无公开入口才在主题入口集中记录原因。
