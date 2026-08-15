# 评审检查单

交付前逐项自审（提炼自官方 skill 与 mattbx/shadcn-skills 审查规则，叠加 Everlearn 门禁）。任何一项不通过即返工。

## Token 与颜色

- [ ] 无裸色（`bg-[#…]`）、无原始色阶（`text-neutral-500`）、无 `color="red"` 类默认色名。
- [ ] 全部颜色经官方语义 utility（`bg-background`/`text-muted-foreground`/`border-border`/`bg-accent`），无已删除的自定义 token。
- [ ] 无 `dark:` 换色；双模式由 token 切换层承担。
- [ ] 任意值（`[…]`）出现第二次的已提升为 token；间距在 4px 刻度内。

## 类名与结构

- [ ] 条件类全部经 `cn()`；无模板拼接、无动态类名。
- [ ] `gap-*` 而非 `space-x/y-*`；等宽高用 `size-*`；截断用 `truncate`/`line-clamp-*`。
- [ ] flex/grid 子项长内容有 `min-w-0`；无手写浮层 z-index；业务 z-index 在 `z-10~50`。
- [ ] 断点只有 `md:`/`xl:`；组件内自适应用容器查询。

## 组件组合

- [ ] 组件库已有能力未手写重实现（Menu/Select/Dialog/Tabs/Breadcrumb/Command/…）。
- [ ] Dialog/Sheet/Drawer 有标题（必要时 `sr-only`）；`SelectItem` 在 `SelectGroup` 内；`Avatar` 有 fallback；表单走 `Field` 组合且 `data-invalid`/`aria-invalid` 齐全。
- [ ] 提示用 `Alert`、空态用 `Empty`、加载用 `Skeleton` 镜像布局、分隔用 `Separator`、状态用 `Badge`。
- [ ] 每页唯一主行动；危险操作 `destructive`；图标按钮有 `aria-label`，装饰图标 `aria-hidden`。

## 状态完备

- [ ] 数据区域覆盖：加载 / 空 / 失败 / 部分成功 / 离线（/ 无权限，如适用）。
- [ ] 保存中字段与按钮同步 disabled；分页失败保留已加载数据。
- [ ] 错误文案 = 失败对象 + 原因类别 + 下一步；404/校验类不给重试。

## 可访问性与动效

- [ ] focus-visible 可见（未被"美观"移除）；浮层关闭焦点回触发器。
- [ ] 当前导航项有 `isActive`/`aria-current`；页面切换焦点移到标题。
- [ ] 动效时长走 token 且有 reduced-motion 降级；同一视口最多一个主动画。

## 交付证据

- [ ] 浅色 / 深色 / 390px 移动端已完成真实浏览器走查，结论写入任务且未提交临时截图。
- [ ] 新增组件清单（CLI 安装 or 复用）；新增 token 的浅色/深色对照。
- [ ] `pnpm check:design-tokens`（改造后的门禁）通过。
