# 里程碑 01D：壳与页头走查返工（六项修复）

用户对 01C 成果走查后提出六项修改，本任务逐项修复并复验。

## 修复清单

1. **品牌行重构（Gemini 布局）**：展开态 = 品牌链接（BookOpen + Everlearn 衬线字）+ 右侧内联折叠按钮（PanelLeft 图标）；折叠态 = 居中品牌图标，悬停 Tooltip 展示完整品牌（图标 + 文字），点击展开。折叠后所有文字隐藏（特写截图验证零残留）。
2. **侧栏底部固定「设置」入口**（SidebarFooter，账号系统上线后升级为用户菜单）；NavMain 不再渲染设置项，避免职责重复。
3. **导航项状态与尺寸**：`--sidebar-accent` 加强（浅色 0.97→0.925、深色 0.269→0.32），hover/激活背景可见；导航项高度 h-8→h-9；间距沿用 SidebarGroup p-2 + menu gap-1，与品牌行同基准。
4. **页面标题焦点框根因修复**：根因是主题入口 base 层的全局 `:focus-visible` 描边（迁移前遗留，官方 shadcn 不做全局描边）与 usePageTitleFocus 自动聚焦叠加。已改为 `:focus-visible { outline: none }`（组件自带 focus-visible ring 不受影响）；复验：标题仍获得焦点（a11y 保持）且 computed outline 为 none/0px。
5. **顶栏右侧改为外观切换**：新增 `theme-toggle.tsx`（官方 mode-toggle：图标按钮 + 三态 RadioGroup），顶栏「新建」按钮与 CreationAction 组件删除（创作入口保留在具体页面内）；`appearance-menu.tsx` 删除。
6. **眉题伪面包屑删除**：`PageShell` 的 eyebrow prop 与 `<p class="text-caption tracking-widest">` 渲染删除，四处使用同步清理；全仓扫描 `Everlearn ·` / `tracking-widest` 零残留，无其它绕过组件库的手写视觉块（离线提示已是 Badge 实现，失败态已是 Alert）。

## 改动文件

- 壳：`app-sidebar.tsx`（品牌行 + 底部设置）、`nav-main.tsx`、`theme-toggle.tsx`（新增）、`site-header.tsx`、`app-shell.component.spec.tsx`；删除 `appearance-menu.tsx`、`workspace-navigation.tsx`。
- 共享：`page-shell.tsx`（去 eyebrow）；`section-page.tsx`、`home-page.tsx`、`knowledge-page.tsx`、`knowledge-destination.tsx`（去 eyebrow prop）。
- 主题：`packages/ui/src/styles/globals.css`（全局焦点描边移除 + sidebar-accent 加强）。
- 文档：`layout-and-navigation.md`、`design-system.md`、`layout-patterns.md`（skill）同步。

## 验证

- `pnpm check` 全链 exit 0；组件测试 7 文件 25 用例通过（壳用例更新：底部设置、品牌折叠按钮、移动 Sheet 含设置、移除新建断言）。
- 生产构建 + 真实数据复验：六项结构断言（收起导航/设置/外观设置/无新建/无眉题/标题 outline none）全部通过；折叠态 hover 出现完整品牌 Tooltip、点击展开成功。
- 截图：`docs/tasks/evidence/2026-08-15-shell-polish/`（展开态、折叠态、折叠特写、折叠 hover Tooltip、再展开态）。

## 二次返工（间距/品牌/整栏展开）

- 间距：inset 容器自带 `p-2` 与各 Group `p-2` 叠加导致双重内边距；改为容器 `p-0`，Group/Header/Footer 的 8px 成为单一间距来源（实测 container=0、group=8px、菜单左缘=品牌左缘=8px）。
- 顶栏：移除桌面折叠触发区（SidebarTrigger + Separator），折叠功能由侧栏品牌行/整栏承担；移动端保留 `md:hidden` 触发器作为抽屉入口。
- 品牌区分度：品牌图标改主色底徽章（bg-primary + primary-foreground），文字衬线半粗，与菜单项明确区分。
- 整栏展开：折叠态侧栏容器 `cursor-e-resize`（与 rail 光标一致）且点击任意位置展开（含导航图标，点击同时导航）；品牌徽章 hover 时书本图标切换为 ChevronsRight（group-hover 纯 CSS）。回归测试：collapsesAndExpandsFromRailBehavior。
- 复验截图：expanded / collapsed / collapsed-hover-mid（hover 时品牌徽章显示向右箭头）追加归档。

## 三次返工（品牌折叠对齐与过渡）

- 根因：品牌行此前用 React 条件渲染切换展开/折叠两个组件，切换瞬间元素替换再补宽度动画造成闪烁；折叠品牌按钮 36px 与导航项 32px 不一致（中心差 2px）。
- 修复：品牌改为与菜单项完全相同的机制——单个 `SidebarMenuButton size="lg"`（官方品牌行规格），折叠走官方 `group-data-[collapsible=icon]` CSS 过渡（宽度/内边距动画 + 文本 truncate 渐隐），与导航项同步；收起按钮改 `SidebarMenuAction showOnHover`（悬停品牌行出现，折叠态自动隐藏）；品牌图标 16px 与导航图标同尺寸、`text-primary` 主色区分，hover 折叠态切换 ChevronsRight。
- 实测：展开态品牌图标与导航图标水平中心一致（x≈54px±1）；折叠态中心像素级一致（±0.5px）、图标同为 16px、垂直节奏均匀、零文字残留。截图：expanded-top / collapsed-top 追加归档。

## 四次返工（宽度根因与品牌淡出）

- 宽度根因：三次返工中给 inset 容器加的 `p-0` 是错误方向——官方 inset 的容器 `p-2` + Group `p-2` 双层叠加恰好构成 16px 总边距（Gemini 同基准），且折叠态 66px 容器的图标居中数学依赖该内边距。`p-0` 反而让菜单更贴边、折叠图标偏左。已恢复官方默认几何：实测菜单高亮块 16→240（宽 224、左右各 16px 对称），折叠态图标列居中（±0.5px）。
- 品牌折叠机制：不再依赖官方 truncate（文本硬裁切），改为自定义 Button 复制菜单项同款 `transition-[width,height,padding]` 过渡类 + 品牌文本 `opacity` 淡出（150ms，与宽度动画同步）；实测折叠后文本 computed opacity = 0、无视觉残留。
- 复验：整栏点击展开、悬停收起按钮、折叠居中全部通过；截图 expanded/collapsed（v7）追加归档。

## 门禁修正

- shadcn CLI 在 `.agents/skills/shadcn/` 自动安装了官方 skill（含 openai.yml 等生成文件），被中文注释与行数门禁误扫；该目录属第三方生成物，已加入 check-comments / check-file-size 的 vendored 豁免（官方 skill 本体保留，与 everlearn-shadcn-ui skill 并存）。
- 复跑完整 `pnpm check`（无管道掩码）确认 exit 0。

## 五次返工（用户决策：回退侧栏实验）

- 用户判定侧栏品牌/折叠/间距的连续实验整体劣于上午官方骨架形态，决策回退；三项明确要求且独立验证过的修复保留（焦点框根因、眉题删除、新建按钮删除）。
- 回退内容：app-sidebar / nav-main / appearance-menu / site-header 恢复 1C 官方形态（品牌 = SidebarMenuButton size="lg" + tooltip；外观菜单回侧栏底部；折叠 = Cmd/Ctrl+B / SidebarTrigger / Rail；导航含设置项、无 h-9 覆写）；theme-toggle.tsx 删除；侧栏激活色加强与整栏点击展开等实验全部移除。
- 文档（layout-and-navigation.md、layout-patterns.md skill）同步回官方骨架描述。
- 教训（记录以防复发）：修改官方组件几何前必须先测量官方基线；连续多轮"改-测-再改"说明方向错误，应及时回退而不是继续打补丁。

## 风险

- 全局 `:focus-visible { outline: none }` 依赖组件自带焦点样式；自定义交互元素必须自带 focus ring（已列入 review-checklist 关注项）。
