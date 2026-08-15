# 里程碑 01B：shadcn/ui + Tailwind v4 迁移

依据 ADR 001 与 ADR 002，将 Web 唯一组件与样式系统迁移为 shadcn/ui + Tailwind CSS v4，并以官方默认 neutral 主题重建应用壳和现有页面。

## 范围与结果

- 组件系统：`packages/ui` 采用 shadcn 源码所有权模式，CLI 配置为 `new-york`、Radix 底座与 Lucide 图标；Mantine 依赖和旧包装已删除。
- 样式系统：Tailwind v4 使用 `:root`/`.dark` 裸值层、`@theme inline` 映射层和语义 utility 消费层；自定义 paper/neutral 色板被 ADR 002 取代为官方 neutral 浅色/深色两态。
- 应用壳：采用 SidebarProvider、Sidebar、SidebarInset、Breadcrumb、DropdownMenu 与移动 Sheet 的官方组合；侧栏实验最终回退到官方几何，只保留已确认的标题焦点、眉题和全局新建入口修正。
- 页面：首页、知识库列表、知识库详情及管理浮层迁移到 Card、Empty、Skeleton、Alert、Dialog、AlertDialog、Field 等现有组件，生产路由继续读取真实 API 数据。
- 清理：CSS Modules、Mantine 与失效样式全部移除；新代码不得重新引入职责重叠的组件库或 CSS Modules。

## 复用与决策

- 采用：现有数据 hook 与契约、shadcn CLI 生成组件、Tailwind 官方语义 token、现有外观 provider。
- 拒绝：双组件库并存、手写浮层行为、第三方主题 preset、next-themes、未经批准的 `shadcn add --overwrite`。
- Skill 影响：新增项目专用 `everlearn-shadcn-ui`，把 CLI、组合、Token、响应式与视觉走查要求固化为门禁；不在产品仓库复制通用上游 Skill。

## 最终验证

- `pnpm dlx shadcn@latest info --json`：确认 Tailwind v4、`new-york`、`base=radix` 与已安装组件清单。
- `pnpm check`：文件规模、设计 token、结构、格式、注释、ESLint、Stylelint、类型、46 个测试和生产构建全部通过。
- 真实浏览器：本地生产 Web + API 真实数据走查桌面浅色/深色、390×844 首页、知识库列表与详情、新建/编辑/删除浮层及移动导航；无裁切、重叠、横向溢出或控制台错误。
- 无障碍回归：普通链接在全局关闭默认描边后仍有可见焦点环，`check:design-tokens` 对该约束提供回归门禁。
- 第二视角：独立视觉评审确认官方骨架、信息层级、深色表面与移动单列布局可接受；意见已处置为最终官方基线。

## 证据与风险

- 浏览器走查结论记录于本任务；临时截图不作为源码资产提交。稳定视觉回归基线仅在明确批准后进入专用目录。
- `@everlearn/ui#build` 仍提示无输出文件，因为该包只执行 `tsc --noEmit`；不影响类型检查或 Web 生产构建。
- 其余风险：无。
