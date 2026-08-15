# 布局模式与页面骨架

依据 shadcn 官方 Sidebar 文档与 Blocks（sidebar-07/11/15、dashboard-01）、Linear/Notion/Raycast 公开布局惯例整理，对应 `docs/01-design/layout-and-navigation.md` 规格。

## 1. 应用壳（唯一骨架）

```tsx
<SidebarProvider>
  <AppSidebar collapsible="icon" variant="inset"> {/* 左栏 16rem（官方默认），折叠 48px 图标列 */}
    <SidebarHeader>品牌行：展开 = 品牌链接 + 右侧内联折叠按钮；折叠 = 居中图标（hover Tooltip 展示完整品牌，点击展开）</SidebarHeader>
    <SidebarContent>SidebarGroup 按模块分组的一级导航</SidebarContent>
    <SidebarFooter>设置入口（账号上线后升级为用户菜单）</SidebarFooter>
    <SidebarRail />                          {/* 内边缘悬停切换 */}
  </AppSidebar>
  <SidebarInset>
    <header className="…"> {/* 顶栏：SidebarTrigger + Separator + Breadcrumb + 右侧外观切换（mode-toggle） */}
    <div className="@container/main flex flex-1 flex-col">{children}</div>
  </SidebarInset>
</SidebarProvider>
```

- 三态：桌面展开（≥768px，16rem）；桌面折叠（`collapsible="icon"` → 48px 图标列，Tooltip 显全名，`Cmd/Ctrl+B` / 顶栏 SidebarTrigger / SidebarRail 切换）；移动（<768px，Sidebar 自动进 Sheet，无需自写抽屉）。
- 折叠状态持久化沿用 workspace-shell-state（localStorage）；右侧上下文栏在编辑器上线前不渲染（ADR 002）。
- 密度基线（官方默认 + Linear 惯例）：顶栏 48px（`--header-height`）、左栏 16rem（256px，官方默认）、折叠 48px 图标列；行高紧凑 36px / 舒适 44px；4px 间距基格。
- 顶栏不承载创作入口（「新建」类操作在具体页面内）；外观控制在侧栏底部。
- 视口高度用 `dvh`；主滚动容器在 `SidebarInset` 内，顶栏 sticky。

## 2. 页面骨架（每页结构固定）

```tsx
<PageShell>
  {' '}
  {/* 共享容器：max-w + padding + 居中，唯一来源 apps/web/src/app/page-shell.tsx */}
  <PageHeader title description actions />{' '}
  {/* 操作区放唯一主行动；模块定位由顶栏 Breadcrumb 表达 */}
  <Separator />
  <PageBody>{/* 页面主体 */}</PageBody>
</PageShell>
```

- 最大内容宽度按页面类型：列表/Workflow 满宽（受 PageShell 上限约束）；阅读/编辑正文 680–760px 居中。
- 页头层级用字号 token 拉开（标题与说明至少差两级），不靠横线、眉题和卡片堆叠制造层级；模块定位由顶栏 Breadcrumb 表达。

## 3. 列表页骨架

```
工具行（搜索输入 + 筛选 + 视图切换 + 新建主行动）
DataTable / 卡片网格
分页（"加载更多"保留已加载数据；失败就地重试）
```

- 筛选/分页状态同步到 URL（searchParams），刷新与分享可恢复。
- 行 hover 只做明度变化 + 边框反馈；当前项用 accent-soft 背景。

## 4. 详情页骨架

- 阅读态：内容列 720px 居中 + 右栏 320px（属性/TOC/关联运行）；< xl 时右栏转 Sheet。
- 元信息区（更新时间、状态 Badge）在标题下，不另设卡片。

## 5. 状态模式（每页必备，验收项）

| 状态     | 实现                                                                     |
| -------- | ------------------------------------------------------------------------ |
| 加载     | Skeleton 镜像最终布局（列表 5 行 / 卡片块 / 标题行）；路由级 loading.tsx |
| 空       | `Empty`：图标位 + 缺失对象说明 + 唯一主行动；文案走共享组件              |
| 失败     | `Alert destructive`：失败对象 + 原因类别 + 下一步；网络/服务器失败给重试 |
| 部分成功 | 保留已得数据 + 就地提示失败部分                                          |
| 离线     | `OfflineNotice`；写操作禁用并说明尚未保存                                |
| 无权限   | Empty 变体，说明缺什么、去哪申请，不给重试                               |

## 6. 浮层入口惯例

- 新建/编辑（短表单）→ Dialog；详情/长编辑面板 → Sheet（右）；移动端表单 → Drawer（底部）。
- 全局命令面板 → `CommandDialog`（⌘K），分组：导航 / 最近文档 / 新建；侧栏顶部搜索按钮是它的显式入口（带 ⌘K kbd 提示）。
- 设置中心未来用 Dialog 内嵌侧栏导航模式（参考 sidebar-13）。

## 7. 移动端（≤768px 只读模式）

- 左栏 → Sidebar 内置 Sheet；顶栏保留 Trigger + 面包屑。
- 隐藏编辑、导入、配置和画布操作；正文、搜索与状态页保持可访问。
- 创作入口触发时显示"请在桌面端创作 + 返回阅读"，不渲染残缺编辑器。
