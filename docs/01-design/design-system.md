# 设计系统

## 设计命题

Everlearn 是长期阅读与写作的私人书房，不是聊天窗口或指标仪表盘。视觉采用 shadcn/ui 官方默认主题（ADR 002）：正文安静、层级清楚，只有当前上下文和运行过程获得强调；标题可用衬线阅读字体保留书卷气。

可识别元素是“知识脊线”：当前文档在树、面包屑、标题和关联运行中共享一条细线标记，表现知识所处的位置。它编码导航关系，不作为装饰重复出现。

## 语义化令牌（ADR 002：shadcn 官方默认主题）

颜色采用 shadcn/ui 官方默认 neutral 色板（oklch），浅色/深色由 `.dark` 切换；单一事实源是 `packages/ui/src/styles/globals.css`。业务组件只能引用语义 utility，禁止写主题色值。

| 语义 utility                                                        | 用途                                                         |
| ------------------------------------------------------------------- | ------------------------------------------------------------ |
| `bg-background` / `text-foreground`                                 | 应用背景与正文。                                             |
| `bg-card` / `bg-popover`（各配 `*-foreground`）                     | 卡片与浮层表面。                                             |
| `bg-primary` / `text-primary-foreground`                            | 主操作。                                                     |
| `bg-secondary` / `bg-muted` / `text-muted-foreground` / `bg-accent` | 次级表面、辅助信息与高亮。                                   |
| `text-destructive` / `bg-destructive`                               | 删除和失败。                                                 |
| `text-success` / `text-warning`                                     | 状态语言补充色（官方默认主题不含，项目补两个 oklch token）。 |
| `border-border` / `border-input` / `ring-ring`                      | 边界、输入框与焦点环。                                       |
| `bg-sidebar` / `bg-sidebar-accent` 等 sidebar 系列                  | 应用壳侧栏。                                                 |
| `chart-1..5`                                                        | 图表色。                                                     |

- Token 分为 color、typography、space、radius、motion 五组；组件不得反向依赖主题名称。
- 外观只有浅色/深色/跟随系统三态（单一 DropdownMenu 控制，shadcn 官方推荐模式），无主题色板切换。
- 颜色状态必须同时有文字或图标；正文、控件和焦点对比度满足 WCAG 2.1 AA（官方默认色板已满足，自定义修改时需重新计算留档）。
- 深色模式必须保留 background/card/popover 三层可辨差异。

## Tailwind 语义 token 映射（验收项）

样式体系为 Tailwind v4 三层变量结构（ADR 001），单一事实源是 `packages/ui` 的主题入口 CSS：

| 层         | 载体                                             | 职责                                                                                                 |
| ---------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| 裸值切换层 | `:root` 与 `.dark`（shadcn 官方默认 oklch 色板） | 存语义裸值，只被下一层引用。                                                                         |
| 映射层     | `@theme inline`                                  | `--color-background: var(--background)` 等映射，生成 `bg-background`、`text-foreground` 等 utility。 |
| 消费层     | 业务代码                                         | 只使用语义 utility；禁止裸色、原始色阶（`text-neutral-500`）与 `dark:` 换色实现双模式。              |

- 每个 surface 类 token 配对 foreground token，配对组合在浅色与深色下都满足 WCAG AA。
- 同一任意值出现第二次必须提升为 `@theme` token；间距沿用默认 `--spacing: 0.25rem`（4px 基数）。
- 暗色模式为 class 策略：主题入口 CSS 首部 `@custom-variant dark`，由自研 theme-provider 切换 `<html>` 的 class。
- 新增语义 token 时必须同步：`:root` 与 `.dark`、`@theme inline` 映射，并在交付证据中列出对照与实色对比度计算。
- 禁止业务代码引用已删除的自定义 token（canvas/shell/surface/ink/accent-soft/danger 等）。

## 字体与密度

- 中文正文使用系统可用的宋体阅读栈：`Source Han Serif SC` 可用时优先，其次 `Songti SC`、`STSong`；界面使用 `Inter`、`PingFang SC`、`Microsoft YaHei`。
- 标题可使用阅读字体，但导航、按钮、表单和状态统一使用界面字体；代码使用 `JetBrains Mono` 回退等宽字体。
- 正文桌面端 16px、行高 1.75、每行 68–76 个中文字符；界面正文 14px、行高 1.5。
- 标题为 34/28/22/18px 四级，字重克制；不使用超大 Hero 字体，也不渲染眉题等伪面包屑（模块定位由顶栏 Breadcrumb 表达）。
- 基础间距 4px，常用值 8/12/16/24/32/48px（Tailwind 默认 `--spacing: 0.25rem` 基数，`p-1`=4px）；圆角 6/10/14px。
- 响应式断点只有两档：`md`（48rem/768px，移动/桌面）与 `xl`（80rem/1280px，右栏），在主题入口 CSS 以 `--breakpoint-*` 定义；组件内自适应优先容器查询（`@container`）。顶栏高度以 `--header-height: 3rem` token 记录，业务代码禁止写死 48px 或 `3rem` 字面量。

## 表面与组件

- 内容区域以留白、发丝分割线和层级缩进组织，禁止把每段内容都装进卡片。
- 阴影只用于浮层、拖拽对象和需要与背景脱离的临时表面。
- Button、Input、Field、Select、Dialog、Sheet、Drawer、Menu、Tooltip、Tabs、Breadcrumb、Card、Skeleton、Empty、Toast 等标准控件与浮层一律采用 shadcn/ui（ADR 001，源码所有权）；业务不得重写其交互与可访问行为，组合规则见 `.agents/skills/everlearn-shadcn-ui/`。
- 主题走 Tailwind v4 三层变量；utility 只消费语义 token（`bg-canvas`、`text-ink`、`border-border`），禁止裸色与第二次出现的任意值；条件类一律经 `cn()`。
- `packages/ui` 只承载 shadcn 组件源码、主题 Provider 与至少两处复用且具有产品语义的组合组件；禁止为组件建立同名转发包装。
- 页面专用组合留在对应 feature；通用组件进入共享包前必须明确语义、状态和复用位置。
- 按钮只允许一个页面级主操作；危险操作不使用品牌强调色。
- 表单使用 shadcn `FieldGroup` + `Field` 组合；标签持续可见；Placeholder 不承担标签职责；错误紧邻字段并说明修复方法，校验状态经 `data-invalid`/`aria-invalid` 传递。
- 图标统一使用 Lucide React；装饰图标隐藏于辅助技术，图标按钮必须提供可访问名称；图标尺寸经组件 `size-*` 约定，不手写尺寸类。

## 状态语言

| 类型     | 固定文案                                                 |
| -------- | -------------------------------------------------------- |
| 通用运行 | 待运行、运行中、等待确认、已完成、部分完成、失败、已取消 |
| 保存     | 已保存、正在保存、保存失败、存在新版本                   |
| Workflow | 草稿、校验失败、已发布、已归档                           |
| 文档     | 正常、已删除、质量警告                                   |

空状态说明缺少的对象并提供一个主行动。错误说明失败对象、原因类别和下一步，不使用“出错了，请重试”作为唯一信息。

### 空态与层级的最低结构（验收项）

- 空态必须是结构化区块：视觉锚点（图标位）+ 缺失对象说明 + 唯一主行动；禁止只渲染一行灰色文字。
- 同一实体的空态文案在所有页面一致，由共享组件承载（如 `KnowledgeEmptyState`）。
- 列表卡片类可点击实体必须同时以字重、字号、颜色三通道区分名称/描述/元信息，并具备 hover 边框反馈；禁止“一坨文字”卡片。
- 由请求内容决定的失败（404、参数校验）不提供重试按钮；只有网络与服务器类失败提供重试。
- 破坏性操作的确认文案只能承诺当前已上线的恢复能力；未上线的恢复入口必须如实说明“当前无法自行恢复”。

## 动效

- CSS transition 处理颜色、边界、阴影和简单显隐；Motion for React 处理布局、共享元素和编排动画。
- 微交互 120–180ms；面板与页面 220–320ms；循环动画（骨架脉动等呼吸类）使用 `--duration-cycle`（1.4s）；Workflow 路径、教程阶段和引用汇聚最多 600ms。
- 同一视口只允许一个主动画。禁止动态背景、粒子、持续漂浮、无意义视差和大面积渐变。
- `MotionConfig` 使用 `reducedMotion="user"`；shadcn 浮层动效经主题 token 统一时长，并在主题入口 CSS 的 `prefers-reduced-motion` 块中归零兜底；减少动效时取消位移、缩放和路径运动，仅保留即时状态或短透明度变化。
- Workflow 运行用边进度与节点状态表达，不用无限循环光效；教程生成用阶段递进，不伪造确定百分比。

## 商业化精致度

保留安静书房气质，但所有可见界面必须达到商业产品的打磨水准（对标 Linear、Notion、Raycast 的细节密度）。本节是交付门槛，具体数值遵循相应章节，此处只列验收视角。

- **一致性**：间距、圆角、阴影、颜色、字号只引用语义 Token，禁止写死具体值；同一控件跨页面外观与行为一致；图标同一行内垂直居中且尺寸统一。
- **状态完备**：每个可交互元素覆盖 hover、active、focus-visible、disabled、loading、error；每个数据区域覆盖加载、空、失败、部分成功、无权限、离线；空态说明缺失对象并给出主行动。
- **焦点与键盘**：焦点环始终可见，不因“美观”移除；浮层关闭后焦点回触发器、打开时进入浮层；主流程可仅用键盘完成。
- **文案语气**：文案一致、可行动、面向任务；错误说明对象、原因类别与下一步；按钮动词明确，状态名词统一走状态语言表。
- **密度与主操作**：信息密度适中、留白有节奏；每页只有一个主操作，次级操作按优先级降级；避免无意义卡片堆叠。
- **加载体验**：Skeleton 保持最终布局尺寸避免跳动；优先局部加载，不整屏 Spinner 遮盖可用导航；失败区域就地重试。
- **对比度与降级**：正文、控件、焦点满足 WCAG 2.1 AA；正文 16px、行高 1.75 不因“紧凑”降级；浅色/深色与 reduced motion 下关键页面各走查一次。
- **视觉证据**：任何页面或视觉变更必须完成浅色、深色、移动端（390px）真实浏览器走查并把结论写入任务；临时截图不得提交。`pnpm check:design-tokens` 必须通过（令牌存在性 + 断点纪律）。

## 禁止项

- Tailwind 之外的其他原子化 CSS（UnoCSS 等）；Tailwind 内禁止裸色（`bg-[#fff]`）、原始色阶（`text-neutral-500`）、动态拼接类名与第二次出现的任意值（ADR 001）。
- 紫蓝霓虹、玻璃拟态、大面积渐变和聊天气泡主布局。
- 为“高级感”降低正文对比度、隐藏标签或移除键盘焦点。
- 同时引入职责重叠的组件库；手工从 GitHub 拷贝 shadcn registry 文件替代 CLI；未经用户批准使用 `--overwrite`。
- 用原生字符、Emoji 或手写 SVG 代替组件库与统一图标库已有能力。
- CSS Modules 用 camelCase 属性访问 kebab-case 类名（本项目导出约定为 `asIs`，此类访问静默失效）；kebab 类名一律 `styles['class-name']` 访问。（迁移完成后此条随 CSS Modules 消解作废。）
- 顶栏、导航等全局入口挂接没有真实数据源的计数、徽标或链接；未上线的能力不得出现在导航。

## 依据

- [shadcn/ui](https://ui.shadcn.com/)
- [shadcn theming](https://ui.shadcn.com/docs/theming)
- [shadcn Sidebar](https://ui.shadcn.com/docs/components/sidebar)
- [Tailwind CSS v4 @theme](https://tailwindcss.com/docs/theme)
- [Tailwind dark mode](https://tailwindcss.com/docs/dark-mode)
- [Lucide React](https://lucide.dev/guide/packages/lucide-react)
- [Motion reduced motion](https://motion.dev/docs/react-use-reduced-motion)
- [React Flow accessibility](https://reactflow.dev/learn/advanced-use/accessibility)
