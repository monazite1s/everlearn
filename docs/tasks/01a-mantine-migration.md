# 里程碑 01A：Mantine 迁移与 UI 修正

本里程碑先修正组件系统和页面边界，再恢复 KB-03。每次只执行一个任务；迁移期间允许 Mantine 与 Radix 短暂共存，但 UIR-05 必须删除 Radix 和旧包装。

## UIR-00 锁定迁移决策与施工边界

- 状态：已完成。
- 依赖：KB-02。
- 必读：`docs/01-design/design-system.md`、`docs/03-engineering/research-and-dependencies.md`、`docs/02-architecture/system.md`。
- 目标：批准 Mantine、图标库、导入边界、迁移顺序和退出条件。
- 采用：`@mantine/core` 9.5.1、`@mantine/hooks` 9.5.1、`lucide-react` 1.31.0。
- 非目标：安装依赖、修改运行代码、迁移页面或删除 Radix。
- 验收：设计、架构、依赖和任务事实源一致；每个后续任务只有一个可验收结果。
- 改动：将 Mantine 定为标准组件系统，Lucide 定为唯一图标集；建立 Provider、应用壳、显式路由、首页组件化、旧层删除和阶段三重排的顺序。
- 验证：npm 官方源返回三个批准版本及兼容 peer；Prettier、文档链接与 `git diff --check` 通过。
- 风险：Mantine 不能作为纯 React Server Component；迁移必须保留服务端数据边界，并把交互限制在客户端叶子。

## UIR-01 引入 Mantine 主题基础

- 状态：已完成。
- 依赖：UIR-00。
- 必读：`docs/01-design/design-system.md`、`docs/03-engineering/research-and-dependencies.md`。
- 目标：安装三个批准依赖，接入 Mantine CSS、Theme 与 Web Provider，页面外观和行为保持不变。
- 实施：锁文件固定版本；Mantine Theme 映射现有语义色、字体、圆角与焦点；Provider 只包围 Web 交互树。
- 非目标：迁移应用壳、首页、Radix 控件或路由结构。
- 失败恢复：Provider 或构建失败时不继续页面迁移；不得通过关闭 SSR 或类型检查绕过。
- 验收：浅深主题仍由现有偏好控制；Next 构建无 hydration 和 CSS 顺序错误。
- 验证：UI/Web typecheck、Provider 聚焦测试、Web 生产构建、格式和文件限制。
- 改动：从 npm 官方源锁定 Mantine 9.5.1；`packages/ui` 提供语义 Token 驱动的 Mantine Theme，Web 现有主题状态统一控制预绘制属性与 Provider，不增加第二套持久化状态。图标依赖在 UIR-02 经真实类型检查后确定为 Lucide 1.31.0。
- 验证结果：UI/Web typecheck 通过；主题与应用壳 5 个聚焦组件测试通过；相关 ESLint、Prettier、文件限制、`git diff --check` 与 Web 生产构建通过。
- 文件数说明：依赖需要同时登记 Workspace Catalog、Web 消费方和 UI 包，Mantine 类型还要求两个浏览器包显式加载 `ESNext.Collection`；测试环境补齐标准 `matchMedia`。这些配置无法在不隐藏依赖约束的情况下合并，功能代码仍保持单一主题边界。
- 风险：旧 Radix 封装在 UIR-05 前仍存在，但本任务未迁移任何控件；`pnpm list` 因本机 pnpm Store SQLite 权限失败，锁文件与成功安装日志已确认实际版本。

## UIR-02 迁移应用壳与一级导航

- 状态：已完成。
- 依赖：UIR-01。
- 必读：`docs/01-design/layout-and-navigation.md`、`docs/01-design/design-system.md`。
- 目标：使用 Mantine AppShell、NavLink、Drawer、ActionIcon、Tooltip、Select 和 Lucide 图标重建现有壳，保持路由行为。
- 实施：移除原生 Select、文字伪图标和字符按钮；桌面与移动共用路由定义；搜索仍只提供真实入口。
- 非目标：实现搜索、拆分页面、改首页或接业务 API。
- 失败恢复：焦点、持久化或响应式行为回归时不删除旧壳；修复后再切换入口。
- 验收：一级导航支持图标、文本、`aria-current`、折叠和移动抽屉；主题控件与左右栏行为保持。
- 验证：壳聚焦组件测试、Web typecheck、ESLint、生产构建和人工桌面/移动走查。
- 改动：应用壳直接采用 Mantine AppShell、NavLink、Drawer、Modal、Select、Button、ActionIcon 与 Tooltip；桌面和移动导航复用同一路由定义，统一使用 Lucide 图标。保留的自研部分只有路由元数据、面板持久化、标题聚焦、知识脊线样式和移动创作策略，这些是产品行为而非标准组件能力。
- 复用决策：仓库旧 Radix 包装、原生 Select、字符图标与文字缩写均不再用于应用壳；Mantine 组件采用 adopt，路由与状态逻辑采用 compose，没有新增透传包装。Tabler 3.45/3.46 因 React 19 类型声明失败被拒绝，用户批准改用 Lucide 1.31.0。
- 验证结果：Web 严格 typecheck 通过；应用壳 3 个聚焦组件测试通过；相关 ESLint、Stylelint、Prettier、文件限制、生产构建与 `git diff --check` 通过。浏览器在 1440×900 验证左右栏为 264/320px、折叠左栏为 56px；390×844 验证 Drawer 与移动创作说明可用，桌面和移动均无横向溢出，控制台无 warning/error。
- 验证效率：本机 Vitest forks Worker 偶发启动超时，聚焦组件测试使用 `--pool=threads --maxWorkers=1 --fileParallelism=false` 后稳定在约 10 秒完成；这只改变测试执行方式，不改变覆盖范围。
- 风险：搜索和运行状态仍是现有真实路由入口，运行数量仍为阶段性静态展示；业务数据将在对应纵向任务接入。旧 Radix 包装继续留到 UIR-05 统一删除。

## UIR-03 建立显式一级页面边界

- 状态：已完成。
- 依赖：UIR-02。
- 必读：`docs/01-design/layout-and-navigation.md`、`docs/01-design/pages/knowledge-base.md`。
- 目标：用显式 `knowledge/news/tutorials/workflows/settings` 页面替换通用 `[section]` 占位路由，使模块可独立拥有 loading、error 和后续布局。
- 原因：单一动态路由是 UI-03 为减少占位代码建立的脚手架，不是 Next.js 限制；它已不适合真实模块所有权。
- 实施：路由文件只连接 feature 页面；共享标题、空状态和错误组合，不复制页面布局。
- 非目标：实现五个模块的业务内容、数据请求或二级路由。
- 失败恢复：全部显式路由构建通过前保留动态兜底；切换完成后一次删除兜底。
- 验收：五个入口拥有独立模块文件，真实 URL、标题焦点和移动策略不变。
- 验证：路由组件测试、Web typecheck、生产构建和本地链接检查。
- 原因结论：`apps/web/src/app` 原本缺少多个页面目录，是 UI-03 为减少占位代码而主动使用 `[section]` 动态 SSG 路由，不是 Next.js 分页或 App Router 能力缺失。该脚手架会让五个模块共享同一 loading、error 和布局所有权，因此在进入真实模块开发前移除。
- 改动：新增 `knowledge/news/tutorials/workflows/settings/page.tsx` 五个显式 Server Component 边界，各自拥有静态 Metadata，只连接现有 `SectionPage` 与 `workspace-routes`；删除 `[section]/page.tsx`。没有复制布局、增加包装组件、实现业务数据或新增依赖。
- 验证结果：五个显式页面聚焦组件测试通过；Next 官方 typegen、Web 严格 typecheck、相关 ESLint、Prettier、文件限制、生产构建与 `git diff --check` 通过。构建路由表只包含五个显式一级入口，不再包含 `[section]`；本地链接检查确认五个入口均为 200 且标题正确，未知 `/not-a-module` 为 404。
- 风险：显式页面仍复用阶段性 `SectionPage` 占位组合；各模块的真实页面将在对应纵向施工任务替换，不应把占位组合继续扩展为跨模块业务抽象。

## UIR-04 走查首页并沉淀产品组合

- 状态：已完成（2026-08-13）。
- 依赖：UIR-03。
- 必读：`docs/01-design/pages/home.md`、`docs/01-design/design-system.md`。
- 目标：用 Mantine 组件重构首页，消除重复 Skeleton、错误、标题和状态展示，同时保持知识库主层级。
- 实施：只沉淀至少两处确认复用且具有产品语义的组合；标准 Card、Alert、Skeleton、Input 和 Button 直接使用 Mantine。
- 非目标：继续扩张通用 UI 层、接入业务 API、实现 Inbox 或添加 Storybook。
- 失败恢复：每个区域独立迁移；状态覆盖不足时保留旧区域，不提交半套组件契约。
- 验收：正常、首次使用、加载、局部失败和离线均覆盖；无运行任务时不显示空卡片。
- 验证：首页聚焦组件测试、UI/Web typecheck、ESLint、生产构建和人工视觉走查。
- 复用决策：标准交互和反馈直接使用 Mantine `Button`、`TextInput`、`Alert`、`Skeleton`、`Badge`、`Card`、`Title` 与布局原语；图标统一使用 Lucide。首页只保留 `HomeSectionHeading`、`HomeRegionState` 和 `HomeSummaryCard` 三个有至少两处真实消费者的产品组合，没有向 `packages/ui` 增加透传包装。
- 状态覆盖：聚焦组件测试覆盖正常、首次使用、加载、局部失败、离线五种状态；运行列表为空时不渲染空侧栏，离线时保留阅读入口并禁用写入操作。
- 验证结果：首页 5 项聚焦组件测试、Web 严格 typecheck、相关 ESLint、Stylelint、Prettier、文件限制及 Next.js 生产构建通过。真实生产页面桌面走查确认标题、导航、卡片与输入控件语义完整；390×844 移动视口无横向溢出，移动导航可见，快速记录按规格隐藏，控制台无错误，临时视口与浏览器页签已恢复。
- 风险：`readyHomeModel` 仍是阶段性静态 fixture；本任务按非目标未接 API，必须在 UIR-06 重排后的知识库纵向切片中用真实查询替换，不得继续扩展为生产数据层。

## UIR-05 删除 Radix 与旧包装层

- 状态：已完成（2026-08-13）。
- 依赖：UIR-04。
- 必读：`docs/01-design/design-system.md`、`docs/03-engineering/quality-gates.md`。
- 目标：删除 Radix 依赖、旧同名包装、失效 CSS 和只验证旧实现的测试，完成单一组件系统收口。
- 实施：全仓搜索 raw control、字符图标、重复状态组件和 Radix 导入；保留仍有产品语义的共享组合。
- 非目标：新增组件、重做视觉或接业务 API。
- 失败恢复：仍有消费者时先拆成后续小任务，不用兼容层长期保留两套系统。
- 验收：生产依赖只保留 Mantine 组件系统；标准控件无自研行为；无未解释 raw Select/Menu/Dialog。
- 验证：相关组件测试、UI/Web typecheck、ESLint、Stylelint、生产构建、依赖与死代码搜索。
- 消费者审计：旧 `primitives`、`overlays`、`selection`、`toast`、两份 CSS Module 及其测试只被 `packages/ui` 自身导出引用；Web 生产代码只使用 `EverlearnUiProvider`，标准控件均直接来自 Mantine，因此无需兼容层或消费者迁移。
- 改动：删除全部旧 Radix/原生控件包装、只验证旧实现的四份测试、失效样式和类型声明；`packages/ui` 只导出 Mantine Theme Provider 与颜色模式类型。移除 `radix-ui` 清单、锁文件和本地安装记录，未新增组件或依赖。
- 验证结果：UI/Web 严格 typecheck、相关全量 ESLint/Stylelint、文件限制和 Prettier 通过；应用壳、主题、显式页面和首页共 11 项组件测试通过；Next.js 生产构建保留七条静态路由。全仓搜索确认无 Radix、旧导出、旧样式、原生标准控件和字符图标；`pnpm why radix-ui --recursive` 无依赖结果，普通离线安装实际移除 62 个旧包。
- 复用结论：Mantine 为唯一标准组件系统，Lucide 为唯一图标集；`packages/ui` 当前只有主题供应商边界，没有通用控件透传包装。未来共享组合仍必须同时满足产品语义和至少两处真实复用。
- 风险：通知、Tabs、Menu 等尚无真实业务消费者；后续出现需求时直接采用 Mantine 对应组件，不恢复已删除的兼容 API。

## UIR-06 重排阶段三纵向任务

- 状态：已完成（2026-08-13）。
- 依赖：UIR-05。
- 必读：`docs/tasks/02-knowledge-model.md`、`docs/02-architecture/api-and-events.md`、`docs/01-design/pages/knowledge-base.md`。
- 目标：保留 KB-03 公共边界，把知识库创建/列表拆为相邻的契约、API 和真实 UI 任务，避免长期 Mock。
- 实施：先完成创建/列表最小闭环，再继续详情、文档树、Inbox 和回收站；首页真实数据随对应纵向切片替换 fixture。
- 非目标：在本任务实现 API、页面、数据库迁移或 E2E。
- 验收：每项任务最多三份上下文、一个结果和八个手写文件；依赖图不再把首个真实 UI 推迟到完整文档树之后。
- 验证：任务链接、状态、实体、路由、契约和追踪矩阵一致性检查。
- 问题结论：旧顺序在 KB-04 完成创建/列表 API 后，仍要求先完成知识库详情、文档 CRUD 和树移动，直到 KB-13 才首次接入真实页面；KB-13 同时承担两个路由、列表、创建、概览、树和移动，无法满足单一目标与上下文上限。KB-14 又混合 Inbox、回收站和首页，导致 fixture 生命周期过长。
- 重排结果：保留 KB-03 和既有 API ID，新增 `C/W/H` 后缀分别表示共享契约、对应 Web 切片和首页切片。顺序改为 KB-04C → KB-04 → KB-04W → KB-04H，再进入详情、文档树、移动、Inbox、转换、回收站和清理；每项 API 后紧邻真实 UI，不再保留 KB-13/14 汇总任务。
- 传输边界：浏览器固定请求同源 `/api/v1`，Next 只以 `API_INTERNAL_URL` 做透明 rewrite，不映射 DTO/错误、不形成 BFF；普通业务 DTO 由 Nest 校验，Web/API 共享安全传输投影来自 `packages/contracts`。
- Fixture 退出：KB-04H 明确删除首页生产知识库 fixture，并在无真实来源时隐藏最近文档/运行摘要；KB-08H 单独接入真实快速记录，避免继续扩大首页 Mock。
- 同步结果：`docs/tasks/README.md` 已更新首个可执行任务、追踪矩阵和 01A 完成状态；编辑器删除重复的 ED-06，并把页面依赖指向 KB-06W；API 与开发规范补齐同源转发和服务端环境变量边界。
- 验证结果：任务 ID/依赖、三文档上限、状态名、实体/API/路由术语、跨里程碑引用和 Markdown 链接完成静态一致性检查；Prettier 与 `git diff --check` 通过。
- 风险：`packages/contracts` 当前为空，KB-04C 必须先建立最小安全投影；Next rewrite 尚未实现，归属 KB-04W，不能提前写入通用客户端框架。

## 后续顺序

```text
UIR-00 → UIR-01 → UIR-02 → UIR-03 → UIR-04 → UIR-05 → UIR-06
                                                          ↓
                                                        KB-03
```
