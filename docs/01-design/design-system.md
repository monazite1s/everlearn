# 设计系统

## 设计命题

Everlearn 是长期阅读与写作的私人书房，不是聊天窗口或指标仪表盘。默认主题从纸张、书脊、批注和档案标签取材：正文安静，层级清楚，只有当前上下文和运行过程获得强调。

可识别元素是“知识脊线”：当前文档在树、面包屑、标题和关联运行中共享一条细线标记，表现知识所处的位置。它编码导航关系，不作为装饰重复出现。

## 语义化令牌

业务组件只能引用语义令牌，禁止写主题色值。主题文件为同一语义角色提供浅色和深色值。

| 角色               | 默认浅色  | 默认深色  | 用途                 |
| ------------------ | --------- | --------- | -------------------- |
| `--canvas`         | `#F3EFE6` | `#171410` | 应用背景。           |
| `--surface`        | `#FBF8F1` | `#262019` | 正文、面板和浮层。   |
| `--surface-raised` | `#FFFDF8` | `#322A21` | Dialog、拖拽态。     |
| `--ink`            | `#29241E` | `#EEE5D6` | 标题与正文。         |
| `--ink-muted`      | `#746B5D` | `#B7AB9A` | 辅助信息。           |
| `--border`         | `#D9D0C1` | `#57493A` | 分隔和输入边界。     |
| `--accent`         | `#8A5A24` | `#D0A363` | 主操作与知识脊线。   |
| `--accent-contrast`| `#FFFDF8` | `#29241E` | 主色表面上的文字。   |
| `--accent-soft`    | `#E9DCC8` | `#4A3824` | 当前项背景。         |
| `--danger`         | `#A33A32` | `#E18478` | 删除和失败。         |
| `--warning`        | `#9B671D` | `#E2B15F` | 质量警告与等待确认。 |
| `--success`        | `#3F7052` | `#75B58A` | 成功。               |

- Token 分为 color、typography、space、radius、shadow、motion 六组；组件不得反向依赖主题名称。
- 首期提供“纸张棕金”和一套低对比中性预设，均有浅色/深色模式；不提供可视化主题编辑器。
- 颜色状态必须同时有文字或图标；正文、控件和焦点对比度满足 WCAG 2.1 AA。`--accent` 与 `--accent-contrast`、`--ink` 与 `--canvas`、`--ink-muted` 与 `--surface` 的配对组合在浅色与深色下都必须达标，交付前用实色值计算留档。
- 深色模式必须保留 canvas/surface/surface-raised 三层可辨差异；不允许把三栏调成一团近似色。

## Mantine 映射（验收项）

Mantine 组件的语义色只能来自以下映射，映射清单的单一事实源是 `apps/web/src/app/globals.css` 顶部的 `--mantine-color-*` 覆盖块与 `packages/ui/src/mantine.tsx` 的 `semanticColors`：

| Mantine 语义 | Everlearn 令牌 | 说明 |
| ------------ | -------------- | ---- |
| `dimmed` | `--ink-muted` | 禁止组件库默认冷灰混入暖色界面。 |
| `text` / `body` | `--ink` | 正文与标题基色。 |
| `anchor` | `--accent` | 链接色。 |
| `everlearn`（primary） | `--accent` | 十个 shade 共用同一变量。 |
| `everlearn-text` 等 `*-text` | `--accent-contrast` | CSS 变量无法参与 autoContrast 亮度计算，filled 按钮文字必须走该变量。 |
| `danger` / `success` / `warning` | 同名令牌 | 业务组件禁止再写 `color="red"` 等组件库默认色。 |

新增 Mantine 语义色时必须同步三处：theme.css 令牌、globals.css 覆盖块、mantine.tsx 色阶注册，并在交付证据中列出映射对照。

## 字体与密度

- 中文正文使用系统可用的宋体阅读栈：`Source Han Serif SC` 可用时优先，其次 `Songti SC`、`STSong`；界面使用 `Inter`、`PingFang SC`、`Microsoft YaHei`。
- 标题可使用阅读字体，但导航、按钮、表单和状态统一使用界面字体；代码使用 `JetBrains Mono` 回退等宽字体。
- 正文桌面端 16px、行高 1.75、每行 68–76 个中文字符；界面正文 14px、行高 1.5。
- 标题为 34/28/22/18px 四级，字重克制；不使用超大 Hero 字体。眉题（eyebrow）用 12px + 0.12em 字距，必须与主标题拉开至少两级字号差。
- 基础间距 4px，常用值 8/12/16/24/32/48px；圆角 6/10/14px。
- 响应式断点只有两档：`48em`（768px，移动/桌面）与 `80em`（1280px，右栏）。CSS 一律写字面量 `48em`/`80em`（media query 不支持 `var()`），禁止出现 768px、68rem 等第三种写法；由 `pnpm check:design-tokens` 强制。顶栏高度在 theme.css 以 `--header-height` 记录，与 Mantine `header={{ height: 48 }}` 同源，修改必须两处同步。

## 表面与组件

- 内容区域以留白、发丝分割线和层级缩进组织，禁止把每段内容都装进卡片。
- 阴影只用于浮层、拖拽对象和需要与背景脱离的临时表面。
- Button、Input、Menu、Select、Modal、Drawer、Tooltip、Tabs、Breadcrumbs、Card、Skeleton 和 AppShell 优先直接采用 Mantine；业务不得重写其交互与可访问行为。
- Mantine 通过 Theme 与 CSS variables 映射项目语义 Token；业务布局和产品视觉继续使用 CSS Modules，禁止 Style Props 堆叠替代可读样式文件。
- `packages/ui` 只承载主题配置、Provider 和至少两处复用且具有产品语义的组合组件；禁止为每个 Mantine 组件建立同名转发包装。
- 页面专用组合留在对应 feature；通用组件进入共享包前必须明确语义、状态和复用位置。
- 按钮只允许一个页面级主操作；危险操作不使用品牌强调色。
- 表单标签持续可见；Placeholder 不承担标签职责；错误紧邻字段并说明修复方法。
- 图标统一使用 Lucide React；装饰图标隐藏于辅助技术，图标按钮必须提供可访问名称。

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
- `MotionConfig` 使用 `reducedMotion="user"`；Mantine 浮层统一 `fade` 过渡并在 globals.css 的 `prefers-reduced-motion` 块中归零兜底；减少动效时取消位移、缩放和路径运动，仅保留即时状态或短透明度变化。
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
- **视觉证据**：任何页面或视觉变更的交付必须附浅色、深色、移动端（390px）三张真实浏览器截图进任务证据；不附截图不得声明完成。`pnpm check:design-tokens` 必须通过（令牌存在性 + 断点纪律）。

## 禁止项

- Tailwind CSS、UnoCSS 和其他原子化 CSS。
- 紫蓝霓虹、玻璃拟态、大面积渐变和聊天气泡主布局。
- 为“高级感”降低正文对比度、隐藏标签或移除键盘焦点。
- 同时引入职责重叠的组件库。
- 用原生字符、Emoji 或手写 SVG 代替组件库与统一图标库已有能力。
- 在业务组件写 `color="red"` 等 Mantine 默认色名或裸色值；语义色只能走「Mantine 映射」清单。
- CSS Modules 用 camelCase 属性访问 kebab-case 类名（本项目导出约定为 `asIs`，此类访问静默失效）；kebab 类名一律 `styles['class-name']` 访问。
- 顶栏、导航等全局入口挂接没有真实数据源的计数、徽标或链接；未上线的能力不得出现在导航。

## 依据

- [Mantine](https://mantine.dev/)
- [Mantine CSS Modules](https://mantine.dev/styles/css-modules/)
- [Mantine AppShell](https://mantine.dev/core/app-shell/)
- [Mantine Next.js](https://mantine.dev/guides/next/)
- [Lucide React](https://lucide.dev/guide/packages/lucide-react)
- [Motion reduced motion](https://motion.dev/docs/react-use-reduced-motion)
- [React Flow accessibility](https://reactflow.dev/learn/advanced-use/accessibility)
