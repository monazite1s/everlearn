# shadcn/ui 组件使用规则

提炼自 shadcn 官方 skill（shadcn-ui/ui 仓库 skills/shadcn）与社区审查 skill（mattbx/shadcn-skills），结合 Everlearn 语义定制。底座原语与风格以项目 `components.json` 记录为准。

## 0. 总原则

- **先用后建**：任何 UI 需求先 `shadcn search` / `shadcn docs` / 检查 `packages/ui/src/components`；组件库已有能力禁止手写重实现（含行为与可访问性）。
- **组合优于改源**：优先用组件的子组件、`variant`、`size` 组合出目标形态；改组件源码是最后手段，且必须记录改动点（升级时靠 `add --diff` 合并）。
- **className 只做布局微调**（间距、宽度、对齐）；颜色、圆角、边框等视觉决策不得经 className 覆盖，走 variant 或 token。
- 所有组件接受 `className` 时经 `cn()` 合并；业务封装同样如此。

## 1. 表单

- 结构固定：`Form`（或 `FieldGroup`）> `Field` > `Label` + 控件 + `FieldError`/说明文字；禁止裸 `Input` 无标签。
- 校验状态：`Field` 上设 `data-invalid`，控件上设 `aria-invalid`；错误文案紧邻字段并说明修复方法。
- `InputGroup` 用其配套子组件组装前后缀，不自行定位图标。
- 2–7 个互斥选项用 `ToggleGroup`；更少用 RadioGroup/Checkbox，更多用 Select/Command。
- Select 的选项必须归组：`SelectItem` 放进 `SelectGroup`（带 `SelectLabel`）。
- 提交态：按钮用 `disabled`，进度指示与按钮组合（如按钮内 spinner 子组件）；不依赖 `isPending` 之类的魔法 prop。
- Everlearn 补充：保存中表单字段同步 `disabled`（编辑对话框必须与创建对话框行为一致）。

## 2. 浮层

- **Dialog**（居中）：短表单、确认、简单操作。**Sheet**（侧滑）：长内容、需要参照主列表的编辑面板、右侧上下文（< xl 断点）。**Drawer**（底部）：移动端表单。**Popover**（锚定）：轻量配置。**Tooltip**：纯说明，不承载操作。
- Dialog/Sheet/Drawer 必须有标题；视觉隐藏时用 `sr-only` 标题，不得省略（可访问性要求）。
- 关闭后焦点回触发器（组件内建，勿破坏）；危险操作确认用 `AlertDialog`。
- 移动端表单惯例：桌面 Dialog + 移动 Drawer 的响应式组合。

## 3. 导航与布局组件

- 应用壳：`SidebarProvider` > `Sidebar` + `SidebarInset`；导航项用 `SidebarMenu` > `SidebarMenuItem` > `SidebarMenuButton`（`isActive` 标当前项，`asChild`/`render` 接 Next `Link`）。
- 面包屑用 `Breadcrumb` 全套；深层级折叠中间项，不截断当前标题。
- 命令面板：`CommandDialog` + ⌘K；分组 = 导航 / 最近文档 / 新建；不承载危险操作。
- 当前项标识：`SidebarMenuButton isActive`（组件内建 active 样式）；Everlearn 的"知识脊线"语义经 accent token 实现，不另画装饰线。

## 4. 数据展示

- 列表实体卡片用 `Card` 全套组合（`CardHeader`/`CardTitle`/`CardDescription`/`CardContent`/`CardFooter`），不用裸 div 模仿；名称/描述/元信息以字重、字号、颜色三通道区分。
- 状态标签用 `Badge` + 语义色 variant，不用带样式的 span；文案走状态语言表（见 design-system.md）。
- 提示块用 `Alert`（+ `AlertTitle`/`AlertDescription`），破坏性提示用 `destructive` variant。
- 分隔线用 `Separator`，不写 `<hr>`。

## 5. 状态组件（Everlearn 强制）

- 空态：`Empty` 全家桶（`EmptyMedia` 图标位 + `EmptyTitle` + `EmptyDescription` + 主行动按钮）；说明缺失对象并给出唯一主行动；同一实体空态文案全站一致，由共享组件承载。
- 加载：`Skeleton` 镜像最终布局形状（列表 5 行、卡片块、标题行），不整屏 Spinner。
- 失败：`Alert destructive` 或 `Empty` + 重试；只有网络/服务器类失败提供重试，404 与参数校验不提供。
- 离线：全局 `OfflineNotice` 共享组件，写操作禁用并说明尚未保存。

## 6. 图标

- 统一 Lucide React；图标按钮必须 `aria-label`，装饰图标 `aria-hidden`。
- 尺寸经组件约定（shadcn 组件内建 `size-4/size-5` 搭配），不在业务处手写图标尺寸类；行内图标与文字对齐交给组件的图标槽位。
- 禁止字符、Emoji、手写 SVG 替代已有图标。

## 7. 按钮纪律

- 每页唯一主行动用 `variant="default"`（accent）；次级 `secondary`/`outline`/`ghost` 按优先级降级；危险操作 `destructive`，不用品牌色。
- 图标按钮（无文字）必须 Tooltip + aria-label。
- 按钮组并列时保持同尺寸（`size` 一致）。
