# 里程碑 01C：默认主题与布局整体重写（ADR 002）

依据 `docs/decisions/002-default-theme-and-layout-rewrite.md`（用户 2026-08-15 批准）。删除自定义主题色板改用 shadcn 官方默认主题，并按官方 dashboard-01 骨架整体重写全部布局，布局能力应接尽接、能组件化就组件化。

## DTR-00 调研与决策

- 状态：已完成。
- 调研：shadcn 官方布局资源与教程（官方 blocks 源码、dashboard-01/sidebar-07 骨架、官方默认 oklch 主题全量数值、NavUser/SectionCards 官方写法、Breadcrumb pathname 惯用法、SidebarProvider 放置与 Next.js 16 cookie 已知问题），全部来自官方仓库与文档一手来源。
- 决策：ADR 002（默认主题 + 布局重写）；同步更新 design-system.md（语义 token 表改官方一套）、layout-and-navigation.md（官方骨架、右栏撤下）、research-and-dependencies.md、AGENTS.md、everlearn-shadcn-ui skill 参考。

## DTR-01 主题删除

- 状态：已完成。
- 改动：`packages/ui/src/styles/globals.css` 换官方默认 neutral oklch 色板（`:root`/`.dark` 全量含 sidebar/chart），`--radius: 0.625rem` 官方派生；仅补 success/warning 两个状态 token；排版/断点/间距 token 与颜色无关，保留。
- theme-provider 简化为 appearance-only（浅色/深色/跟随系统，`.dark` class + localStorage，旧存储值自动回退 system）；主题色板选择 UI 与 `data-theme` 切换删除。
- 验证：PostCSS 编译与生产构建通过；四色板 → 两态变量全部进入产物（构建 CSS 中 `--background` 浅深两值确认）。

## DTR-02 应用壳重写（官方 dashboard-01 粒度）

- 状态：已完成。
- 文件：`app-shell.tsx`（薄组装：TooltipProvider + skip-link + SidebarProvider 受控折叠 + AppSidebar + SidebarInset#main-content + `@container/main`）；`app-sidebar.tsx`（Sidebar variant="inset" collapsible="icon" + 品牌 + NavMain + SidebarRail）；`nav-main.tsx`（六入口 SidebarMenuButton）；`appearance-menu.tsx`（SidebarFooter 官方 mode-toggle：DropdownMenuRadioGroup 三态）；`site-header.tsx`（SidebarTrigger + Separator + PageBreadcrumb + CreationAction）；`page-breadcrumb.tsx`（usePathname 分段 + 静态标签映射，未知 uuid 段跳过）。
- 决策：SidebarInset 已渲染 `<main>`，内容区用 div 避免 main 嵌套；右栏上下文 aside 撤下（编辑器上线后带真实对象上下文回归）；侧栏宽度回归官方默认 16rem；`dark:` 门禁禁令放宽为官方模式类允许（ADR 002）。

## DTR-03 页面重写（组件化）

- 状态：已完成。
- 新共享组件：`section-cards.tsx`（官方统计卡模式：渐变 + CardDescription 上/Title 下/CardAction、tabular-nums、`@xl/main`/`@5xl/main` 容器查询换列）、`load-failure.tsx`（Alert destructive + 可选重试）、`list-skeleton.tsx`、`empty-state.tsx`（官方 Empty 薄封装）、`format-datetime.ts`（中文时间格式化，三处复用）。
- 页面：首页与知识库列表（PageShell 页头 + SectionCards 真实数据统计 + 卡片网格 + 分页 + 全套状态组件）；详情页（三段式页头 + 返回/管理操作 + 统计卡 + Badge）；管理流（DropdownMenu/Dialog/AlertDialog，行为与校验不变）。
- SectionCards 口径：知识库数=items.length、文档总数=ΣdocumentCount、最近活动=max(updatedAt)；空数据不渲染统计卡。详情 `createdAt` 卡因契约无字段暂缺（补字段后一行即加）。
- 旧 token 清理：`rg 'text-ink|bg-surface|bg-canvas|accent-soft|text-danger|surface-raised|hover-overlay|focus-ring|bg-shell|text-ink-muted' apps/web/src` 零命中。

## DTR-04 验证

- 命令（真实运行，全部通过）：`pnpm check`（file-size/design-tokens/structure/format/lint/typecheck/test/build 全链 exit 0）；`pnpm test` 46 用例通过（组件 25）。
- 生产构建 + 真实数据走查（`next start` + 本地 API）：首页浅色/深色/390px、知识库列表、详情页；外观菜单切换实测 `html.dark` 生效。
- 截图：`docs/tasks/evidence/2026-08-15-default-theme-layout-rewrite/`（home-light / home-dark / home-mobile / knowledge-list / knowledge-detail）。
- 视觉评审结论：官方骨架质感达标（inset 侧栏、统计卡渐变、容器查询换列正确）；深色全面正确、三层表面可辨；移动端单列堆叠无溢出；遗留为打磨级（暗色卡片边框可见度可再加强）。

## 风险

- 详情页缺 createdAt 统计卡（API 契约无字段，非 UI 债）；移除条件：KnowledgeBaseSummary 补字段。
- 键盘焦点回触发器路径仍建议编辑器任务前做一次全流程走查（沿 01B 遗留）。
- `check-design-tokens` 放开 `dark:` 后依赖评审约束"仅官方模式类"使用；技术债移除条件：出现滥用即恢复正则禁令。
