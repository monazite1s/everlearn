# 设计系统

## 设计命题

Everlearn 是长期阅读与写作的私人书房，不是聊天窗口或指标仪表盘。默认主题从纸张、书脊、批注和档案标签取材：正文安静，层级清楚，只有当前上下文和运行过程获得强调。

可识别元素是“知识脊线”：当前文档在树、面包屑、标题和关联运行中共享一条细线标记，表现知识所处的位置。它编码导航关系，不作为装饰重复出现。

## 语义化令牌

业务组件只能引用语义令牌，禁止写主题色值。主题文件为同一语义角色提供浅色和深色值。

| 角色 | 默认浅色 | 默认深色 | 用途 |
|---|---|---|---|
| `--canvas` | `#F3EFE6` | `#1E1B17` | 应用背景。 |
| `--surface` | `#FBF8F1` | `#28231D` | 正文、面板和浮层。 |
| `--surface-raised` | `#FFFDF8` | `#312A22` | Dialog、拖拽态。 |
| `--ink` | `#29241E` | `#EEE5D6` | 标题与正文。 |
| `--ink-muted` | `#746B5D` | `#B7AB9A` | 辅助信息。 |
| `--border` | `#D9D0C1` | `#4B4237` | 分隔和输入边界。 |
| `--accent` | `#8A5A24` | `#D0A363` | 主操作与知识脊线。 |
| `--accent-soft` | `#E9DCC8` | `#4A3824` | 当前项背景。 |
| `--danger` | `#A33A32` | `#E18478` | 删除和失败。 |
| `--warning` | `#9B671D` | `#E2B15F` | 质量警告与等待确认。 |
| `--success` | `#3F7052` | `#75B58A` | 成功。 |

- Token 分为 color、typography、space、radius、shadow、motion 六组；组件不得反向依赖主题名称。
- 首期提供“纸张棕金”和一套低对比中性预设，均有浅色/深色模式；不提供可视化主题编辑器。
- 颜色状态必须同时有文字或图标；正文、控件和焦点对比度满足 WCAG 2.1 AA。

## 字体与密度

- 中文正文使用系统可用的宋体阅读栈：`Source Han Serif SC` 可用时优先，其次 `Songti SC`、`STSong`；界面使用 `Inter`、`PingFang SC`、`Microsoft YaHei`。
- 标题可使用阅读字体，但导航、按钮、表单和状态统一使用界面字体；代码使用 `JetBrains Mono` 回退等宽字体。
- 正文桌面端 16px、行高 1.75、每行 68–76 个中文字符；界面正文 14px、行高 1.5。
- 标题为 34/28/22/18px 四级，字重克制；不使用超大 Hero 字体。
- 基础间距 4px，常用值 8/12/16/24/32/48px；圆角 6/10/14px。

## 表面与组件

- 内容区域以留白、发丝分割线和层级缩进组织，禁止把每段内容都装进卡片。
- 阴影只用于浮层、拖拽对象和需要与背景脱离的临时表面。
- Dialog、Popover、Select、Tooltip、Tabs、Menu 等以 Radix Primitives 提供行为，由 CSS Modules 完成视觉。
- 语义与交互均稳定且至少复用两处的组件才进入 `packages/ui`；业务组件留在对应 feature。
- 按钮只允许一个页面级主操作；危险操作不使用品牌强调色。
- 表单标签持续可见；Placeholder 不承担标签职责；错误紧邻字段并说明修复方法。

## 状态语言

| 类型 | 固定文案 |
|---|---|
| 通用运行 | 待运行、运行中、等待确认、已完成、部分完成、失败、已取消 |
| 保存 | 已保存、正在保存、保存失败、存在新版本 |
| Workflow | 草稿、校验失败、已发布、已归档 |
| 文档 | 正常、已删除、质量警告 |

空状态说明缺少的对象并提供一个主行动。错误说明失败对象、原因类别和下一步，不使用“出错了，请重试”作为唯一信息。

## 动效

- CSS transition 处理颜色、边界、阴影和简单显隐；Motion for React 处理布局、共享元素和编排动画。
- 微交互 120–180ms；面板与页面 220–320ms；Workflow 路径、教程阶段和引用汇聚最多 600ms。
- 同一视口只允许一个主动画。禁止动态背景、粒子、持续漂浮、无意义视差和大面积渐变。
- `MotionConfig` 使用 `reducedMotion="user"`；减少动效时取消位移、缩放和路径运动，仅保留即时状态或短透明度变化。
- Workflow 运行用边进度与节点状态表达，不用无限循环光效；教程生成用阶段递进，不伪造确定百分比。

## 禁止项

- Tailwind CSS、UnoCSS 和其他原子化 CSS。
- 紫蓝霓虹、玻璃拟态、大面积渐变和聊天气泡主布局。
- 为“高级感”降低正文对比度、隐藏标签或移除键盘焦点。
- 同时引入职责重叠的组件库。

## 依据

- [Radix Primitives](https://www.radix-ui.com/primitives/docs/overview/introduction)
- [Motion reduced motion](https://motion.dev/docs/react-use-reduced-motion)
- [React Flow accessibility](https://reactflow.dev/learn/advanced-use/accessibility)
