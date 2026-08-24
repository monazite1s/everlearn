# 研究与依赖

## 触发条件

以下工作在设计或编码前必须研究：Agent/Workflow、编辑器扩展、UI 系统、复杂动效、抓取与内容解析、队列/调度、认证、分享安全，以及新增基础依赖或难以回退的外部协议。

普通 CRUD、文案和既有模式内的小改动不需要重复研究。

## 研究记录

### 2026-08-24 PostgreSQL 搜索索引、事务 Outbox 与 Kysely 类型生成（ADR 004）

- 决策记录：`docs/decisions/004-transactional-outbox-search-projection.md`；用户于 2026-08-24 批准非破坏性迁移、`pg_trgm` 与 `kysely-codegen`。
- 仓库复用：沿用 PostgreSQL 17/pgvector 镜像、Kysely Migrator、BullMQ Job Scheduler、Worker → 受密钥保护内部 API、固定调度器重建和真实隔离 Schema 集成夹具；不增加搜索集群或 Worker 数据库客户端。
- PostgreSQL FTS：采用显式 `pg_catalog.simple` 配置生成 `tsvector`，以 GIN 加速拉丁词项；配置名写入表达式，避免连接级默认配置变化造成索引与查询不一致。PostgreSQL 官方将 GIN 作为首选文本搜索索引类型。
- 中文边界：本地 PostgreSQL 17 实测连续中文“知识管理系统”在 `simple` 配置下形成单一 lexeme，“知识管理”不能命中。采用官方 trusted extension `pg_trgm` 0 额外服务方案，为原文列建立 `gin_trgm_ops`，中文子串走参数化 `ILIKE`；固定验收“分布式系统中的幂等设计”查询“幂等”命中。拒绝把整句匹配冒充中文搜索，也不引入 zhparser/Elasticsearch。
- 数据库类型：采用 `kysely-codegen` 0.20.0（MIT、Node >=20、Kysely >=0.27 <1、pg >=8.8 <9，兼容项目 Node 24/Kysely 0.29/pg 8.22），仅在 API 开发期从已迁移真实 Schema 生成类型并以 `--verify` 检查漂移，不进入生产运行依赖。
- 依赖决策：`pg_trgm` 由 PostgreSQL 镜像提供，迁移只执行 `CREATE EXTENSION IF NOT EXISTS`，down 不删除可能被其他对象共享的扩展；`kysely-codegen` 固定在 API devDependencies。自研余量仅保留确定性 ProseMirror Block 投影与领域事件处理，因为平台能力不理解 Everlearn 的 `blockId`、标题路径和版本语义。
- 拒绝方案：只用 `simple` FTS（连续中文不可用）；自研 CJK 分词 SQL/TypeScript（规则与索引查询易漂移）；Worker 增加 Kysely/pg 直连（复制数据库边界）；手写新增 Kysely 表类型（违反 PostgreSQL Skill 的生成门禁）。
- 替换成本：移除 `pg_trgm` 需替换中文查询与索引并实测等价召回；移除 codegen 只影响开发脚本和生成文件；Outbox 替换条件见 ADR 004。
- 官方证据：[PostgreSQL Tables and Indexes](https://www.postgresql.org/docs/current/textsearch-tables.html)、[Preferred Index Types](https://www.postgresql.org/docs/current/textsearch-indexes.html)、[`pg_trgm`](https://www.postgresql.org/docs/current/pgtrgm.html)、[`SELECT ... SKIP LOCKED`](https://www.postgresql.org/docs/current/sql-select.html)、[kysely-codegen 维护者仓库](https://github.com/RobinBlomberg/kysely-codegen)。查阅日期：2026-08-24。

### 2026-08-15 默认主题与布局整体重写（ADR 002）

- 决策记录：`docs/decisions/002-default-theme-and-layout-rewrite.md`（用户于 2026-08-15 批准）。
- 采用：shadcn/ui 官方默认 neutral oklch 色板（`:root`/`.dark` 全量 + sidebar/chart 系列），`--radius: 0.625rem`；删除 paper/neutral 自定义色板与主题切换 UI；外观收敛为浅色/深色/跟随系统三态（SidebarFooter DropdownMenu，官方推荐模式）。
- 布局重写依据：官方 dashboard-01/sidebar-07 骨架与文件粒度（app-sidebar/nav-main/nav-secondary/site-header/section-cards）、官方 Card 顺序（Description 上/Title 下/CardAction 右上）、容器查询命名容器（`@container/main`、`@xl/main` 响应式换列）、Breadcrumb 由 pathname 分段生成。
- 补充 token：success/warning 两个 oklch 状态色（官方默认主题不含）；排版/断点/间距 token 与主题色无关，保留。
- 拒绝 next-themes：与简化后的自研 provider 功能重叠。
- 官方证据：[Theming 默认值](https://ui.shadcn.com/docs/theming)、[Sidebar](https://ui.shadcn.com/docs/components/sidebar)、[Blocks dashboard-01/sidebar-07](https://ui.shadcn.com/blocks)、[shadcn-ui/ui 仓库 blocks 源码](https://github.com/shadcn-ui/ui)。查阅日期：2026-08-15。

### 2026-08-15 shadcn/ui + Tailwind v4 组件与样式系统迁移

- 决策记录：`docs/decisions/001-shadcn-tailwind-migration.md`（用户于 2026-08-15 批准）。本记录取代 2026-08-12 Mantine 迁移决策，Mantine 记录保留作历史。
- 采用候选：`shadcn`（CLI 源码所有权模式）、`tailwindcss` v4 + `@tailwindcss/postcss`、`class-variance-authority`、`clsx`、`tailwind-merge`、`tw-animate-css`。全部 MIT。底层原语采用本次 CLI 生成的 Radix 预设与 `new-york` 风格，以 `shadcn info` 复核。
- 采用范围：shadcn 负责标准控件、浮层、Sidebar 应用壳骨架与可访问行为；Tailwind v4 CSS-first 配置负责 utility 与主题映射；暗色走 class 策略（`@custom-variant dark`），由自研 theme-provider 驱动，不引入 next-themes。迁移初版保留的 paper/neutral 四套色板已由 ADR 002 取代为官方 neutral 浅色/深色两态。
- 所有权与升级：组件源码进 `packages/ui`，通过 `shadcn add` 安装、`shadcn add --diff/--dry-run` 合并上游更新；禁止手工从 GitHub 拷贝 registry 文件，禁止未经用户批准使用 `--overwrite`。
- monorepo 边界：`packages/ui` 以源码 exports 被消费；主题入口 CSS 放 packages/ui，`apps/web` 的 `components.json` 以 `tailwind.css` 指回；`@source` 显式注册跨包扫描（v4 自动检测不跨 workspace）。
- 迁移策略：一次性迁移并删除 Mantine，禁止双组件库并存；Tailwind 与 CSS Modules 仅迁移期共存，完成后新代码禁止新建 CSS Modules。
- 暂不采用：shadcn MCP server（当前 agent 工作流用 `shadcn search/docs` CLI 已覆盖，形成实际需要后再评估）、prettier-plugin-tailwindcss（迁移稳定后再评估引入）、第三方主题 preset（nova/vega 等，仅作参考不直接 apply）。
- 官方证据：[shadcn 安装 manual](https://ui.shadcn.com/docs/installation/manual)、[shadcn CLI](https://ui.shadcn.com/docs/cli)、[shadcn monorepo](https://ui.shadcn.com/docs/monorepo)、[shadcn theming](https://ui.shadcn.com/docs/theming)、[shadcn Skills](https://ui.shadcn.com/docs/skills)、[官方 skill 源码 shadcn-ui/ui/skills](https://github.com/shadcn-ui/ui/blob/main/skills/shadcn/SKILL.md)、[Tailwind v4 @theme](https://tailwindcss.com/docs/theme)、[Tailwind dark-mode](https://tailwindcss.com/docs/dark-mode)、[Tailwind Next.js 安装](https://tailwindcss.com/docs/installation/framework-guides/nextjs)、[Tailwind 源检测](https://tailwindcss.com/docs/detecting-classes-in-source-files)。查阅日期：2026-08-15。
- 拒绝继续 Mantine：视觉基线与商业化目标存在持续摩擦，且组件级视觉系统无论如何需要自建；此前 2026-08-12 记录未评估 shadcn，属对比面不足的决策。
- 拒绝 shadcn 源码改写 CSS Modules：失去官方 CLI 工作流，形成自维护分叉。
- 替换成本：数据获取 hook、API 层与领域模块不依赖 UI 库，不受影响；应用壳、约 10 个源码文件与组件测试需重写。

### 2026-08-12 Mantine 组件系统迁移（已被 2026-08-15 记录取代）

- 采用候选：`@mantine/core` 9.5.1、`@mantine/hooks` 9.5.1 与 `lucide-react` 1.31.0；用户于 2026-08-12 明确批准迁移，随后批准以 Lucide 替换类型不兼容的 Tabler。Mantine 为 MIT，Lucide 为 ISC；npm 官方源确认三者兼容项目 React 19.2.8。
- 采用范围：Mantine 负责标准控件、布局原语、浮层、反馈和可访问行为；Lucide 提供唯一图标集；CSS Modules 与项目语义 Token 继续负责产品布局和品牌视觉。
- 导入边界：Web 可直接使用 Mantine 标准组件；`packages/ui` 只保留主题、Provider 与有稳定产品语义的组合组件，不建立全量同名包装层。
- Next.js 限制：Mantine 入口包含 `use client`，组件不能作为纯 React Server Component；数据获取和静态内容仍保留在 Server Component，交互叶子进入客户端边界。
- 迁移策略：先接入 Provider，再迁移应用壳、显式页面与首页，最后删除 Radix、旧包装和失效 CSS；迁移序列结束前不得新增第二套自研原语。
- 暂不采用：`@mantine/spotlight`、`@mantine/notifications`、Storybook 和 Mantine 扩展包。真实搜索、通知或组件目录形成独立任务后再审批。
- 官方证据：[Mantine GitHub](https://github.com/mantinedev/mantine)、[CSS Modules](https://mantine.dev/styles/css-modules/)、[AppShell](https://mantine.dev/core/app-shell/)、[Next.js 指南](https://mantine.dev/guides/next/)、[Lucide React](https://lucide.dev/guide/packages/lucide-react)。查阅日期：2026-08-12。
- 拒绝 Tabler Icons React 3.45/3.46：发布声明引用 React 19 不再导出的 `ReactSVG`，在项目严格类型检查中失败；不以 `skipLibCheck` 或本地类型补丁掩盖上游错误。
- 拒绝继续扩展 Radix 包装：现有实现已出现原生 Select、文本伪图标、重复 Skeleton 和缺少应用级组件的问题；继续逐个封装会扩大维护面。
- 替换成本：迁移涉及 `packages/ui`、应用壳、首页和组件测试；产品数据模型、API 与领域模块不依赖 UI 库，不受影响。

### 2026-08-11 PostgreSQL 访问层与迁移

- 采用候选：Kysely 0.29.2、node-postgres 8.22.0 与 `@types/pg` 8.20.0；待用户批准后由锁文件固定。npm 官方源元数据确认前两者分别要求 Node >=22 和 >=16，兼容项目 Node 24，三者均为 MIT。Kysely 提供 PostgreSQL 方言、类型安全查询、事务和显式 up/down migration，同时允许树移动等少量复杂 SQL。
- 运行边界：API 和 Worker 各自只创建一个有上限的 `pg.Pool`；普通查询复用池，事务必须使用同一连接。所有动态值参数化，表名和列名不得来自用户输入。
- 迁移边界：迁移按只含数字与下划线的 UTC 序号命名；生产只执行 up，down 用于本地恢复验证；应用启动不自动迁移。
- 官方证据：[Kysely 官网](https://www.kysely.dev/)、[Kysely GitHub](https://github.com/kysely-org/kysely)、[node-postgres Pool](https://node-postgres.com/features/pooling)、[node-postgres Transactions](https://node-postgres.com/features/transactions)、[Parameterized Queries](https://node-postgres.com/features/queries)、[pg npm](https://www.npmjs.com/package/pg)、[@types/pg npm](https://www.npmjs.com/package/@types/pg)。查阅日期：2026-08-11。
- 拒绝 Prisma：知识库树需要复合约束、批量路径更新和显式事务，主要操作仍会落到原生 SQL；引入生成客户端不能减少当前复杂度。
- 拒绝 TypeORM：当前不需要 Active Record、实体生命周期或装饰器元数据；更宽的 ORM 表面积会增加隐式行为。
- 拒绝自研 `pg` migration runner：重复建设迁移锁、执行记录和顺序校验，节省的依赖不足以抵消维护成本。
- 替换成本：领域服务不暴露 Kysely 类型；数据访问只存在于模块仓储和迁移层，替换时不改变 HTTP 契约。

### 2026-08-09 测试反馈与进程退出

- Playwright 官方 `webServer` 支持复用已有服务并管理启动进程；Windows 不支持其 `SIGTERM`/`SIGINT` 优雅关闭选项。本机测试场景约 4 秒完成，但系统 Chrome teardown 无法正常退出；前期按产品决策停用 E2E，保留直接启动 Next CLI 与全局超时供后续恢复。
- Vitest 官方默认不启用覆盖率，并支持按项目、文件和 Git 改动过滤。开发期使用无覆盖率聚焦测试；覆盖率在核心流程稳定后恢复。
- 未引入测试编排依赖；现有 Vitest、Playwright 与 package scripts 已覆盖需求。

1. 先用 `rg` 检查仓库已有实现、约束和依赖。
2. 至少核对两类证据：一项官方文档或维护者仓库；另一项活跃 GitHub 实现、维护者工程文章或可信生产案例。
3. 记录 URL、查阅日期、适用版本、采用能力、限制、拒绝方案和替换成本。
4. 可逆的模块选择写入对应架构文档；跨模块、数据格式、安全或供应商锁定决策写 ADR。
5. 博客只作为线索，不覆盖官方 API、许可证、项目约束或本地验证。

## 依赖准入

- 必须解决当前已批准需求；没有第三个用例时不引入大型通用框架。
- 检查维护频率、Issue/Release、许可证、包体积、安全记录、文档、服务端/浏览器边界和移除成本。
- 优先无样式、可组合且不接管业务数据模型的库。
- 新依赖任务必须包含最小可行验证、失败回退和版本锁定策略。

## 已采用基线

| 领域          | 选择                                                                                                                                                                       | 用途与边界                                                                                                    |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 编辑器        | [Tiptap](https://github.com/ueberdosis/tiptap)                                                                                                                             | Headless ProseMirror 编辑器、扩展和拖拽；不采用协作云或 Yjs。                                                 |
| UI 组件       | [shadcn/ui](https://ui.shadcn.com/)（源码所有权，ADR 001）                                                                                                                 | 标准控件、浮层、Sidebar 应用壳与可访问行为；组件源码在 packages/ui，经 shadcn CLI 管理。                      |
| 图标          | [Lucide React 1.31.0](https://lucide.dev/guide/packages/lucide-react)                                                                                                      | 唯一界面图标集；禁止字符、Emoji 和重复手写 SVG。                                                              |
| 动效          | [Motion for React](https://motion.dev/docs/react)                                                                                                                          | 编排与布局动效；简单变化使用 CSS。                                                                            |
| 画布          | [React Flow](https://reactflow.dev/learn/concepts/terms-and-definitions)                                                                                                   | Workflow 可视化；列表仍是完整编辑入口。                                                                       |
| Agent Runtime | [LangGraph.js](https://github.com/langchain-ai/langgraphjs)                                                                                                                | 图执行、检查点、子图和人工中断。                                                                              |
| 队列          | [BullMQ Job Schedulers](https://docs.bullmq.io/guide/job-schedulers)                                                                                                       | 后台分发与每日/每周调度；不用废弃 repeatable API。                                                            |
| 搜索          | PostgreSQL FTS + pgvector                                                                                                                                                  | 普通搜索与 AI 混合召回；不引入独立搜索集群。                                                                  |
| Web 搜索      | Tavily Adapter                                                                                                                                                             | 首个实现；业务只依赖 Provider 接口。                                                                          |
| 组件样式      | Tailwind CSS v4（ADR 001）+ 语义 Token 三层变量                                                                                                                            | Tailwind 禁令已废止；utility 只消费语义 token，禁止任意值与裸色。                                             |
| 主题运行时    | [prefers-color-scheme](https://developer.mozilla.org/docs/Web/CSS/@media/prefers-color-scheme) + [Web Storage](https://developer.mozilla.org/docs/Web/API/Web_Storage_API) | 自研外观 provider（浅色/深色/跟随系统，ADR 002）；`.dark` class 切换，`localStorage` 持久化，不引入主题依赖。 |
| 应用壳导航    | [Next.js Accessibility](https://nextjs.org/docs/architecture/accessibility) + [usePathname](https://nextjs.org/docs/app/api-reference/functions/use-pathname)              | 使用真实 Link 路由、唯一标题和路由播报；壳只在客户端读取 pathname，切换后聚焦页面标题。                       |
| 服务端配置    | [Nest Config](https://docs.nestjs.com/techniques/configuration) + [class-validator](https://github.com/typestack/class-validator)                                          | API/Worker 启动前同步校验白名单字段；普通业务不使用 Zod。                                                     |
| 本地依赖镜像  | pgvector 0.8.2/PostgreSQL 17、Redis 8.8.0、SeaweedFS 4.29                                                                                                                  | 固定镜像版本；SeaweedFS 使用维护者推荐的单节点 `weed mini`。                                                  |

## 工程门禁基线（2026-08-09）

| 能力       | 选择                                                                                                                                                                                       | 决策与边界                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| JS/TS Lint | [ESLint flat config](https://eslint.org/docs/latest/use/configure/configuration-files) 9.x、[typescript-eslint typed linting](https://typescript-eslint.io/getting-started/typed-linting/) | 使用类型信息执行正确性规则；ESLint 10 因 React/import 插件 peer 不兼容而不采用。 |
| 注释门禁   | [eslint-plugin-jsdoc](https://github.com/gajus/eslint-plugin-jsdoc) + 仓库扫描脚本                                                                                                         | 强制文件/函数 JSDoc、中文自然语言注释和非代码文件头，不强制无意义参数说明。      |
| CSS Lint   | [Stylelint](https://stylelint.io/user-guide/configure/) standard config + strict values                                                                                                    | CSS Modules 合法性、复杂度及颜色/间距/圆角/阴影/时长 Token 使用。                |
| 格式化     | [Prettier](https://prettier.io/docs/configuration)                                                                                                                                         | 独立于 ESLint 运行；不采用 `eslint-plugin-prettier`。                            |
| 测试       | [Vitest 4](https://vitest.dev/guide/projects.html) + V8 Coverage、[Supertest 7](https://github.com/forwardemail/supertest)、Testing Library                                                | 分离单元、集成和组件 project；覆盖率统一汇总；API 不绑定固定端口。               |
| 浏览器 E2E | [Playwright 1.62](https://playwright.dev/docs/test-configuration)                                                                                                                          | 验证生产构建；使用语义定位，失败保留 trace/截图，CI 执行重试。                   |
| 可访问性   | [axe-core Playwright 4.12.1](https://github.com/dequelabs/axe-core-npm)                                                                                                                    | 在真实 Chromium 检查激活后的浮层；不使用无法检查完整 CSS/浮层的 JSDOM axe。      |
| CI Runtime | [GitHub Actions](https://docs.github.com/en/actions/tutorials/build-and-test-code/nodejs) + [pnpm/setup](https://github.com/pnpm/setup)                                                    | 三个独立 Job；pnpm 11 官方 Action 同时提供 Node 24 与 pnpm；Action 固定 SHA。    |

上述依赖仅用于开发门禁，不进入生产运行包；版本由根锁文件固定，升级时必须重新执行 peer 检查和失败样例验证。

## 已拒绝或延期

| 方案                           | 结论              | 原因                                                                                     |
| ------------------------------ | ----------------- | ---------------------------------------------------------------------------------------- |
| Superpowers                    | 禁止              | Token 成本与收益不符合项目工作方式。                                                     |
| 继续扩展 Radix 包装层          | 已替换            | 应用级组件缺口导致重复实现；Mantine 迁移完成后删除依赖与包装。                           |
| OpenAI Agents SDK 作为 Runtime | 不采用            | 当前需要可编辑图、持久检查点和明确子图；Provider 仍保持可替换。                          |
| 自研 Workflow DSL/状态机       | 不采用            | 重复建设持久化、中断和恢复能力。                                                         |
| 固定 Planner/Executor/Critic   | 不采用            | 不是所有流程都需要三角色，节点和质量门槛应按模板定义。                                   |
| ~~Tailwind/UnoCSS~~ 禁令       | 已废止（ADR 001） | 2026-08-15 迁移 shadcn/ui 后解除；纪律改由 everlearn-shadcn-ui skill 与 token 门禁承担。 |
| Yjs/CRDT                       | 延期且无计划      | 产品不允许同时协作编辑。                                                                 |
| Browser automation             | 首期排除          | 资讯仅支持 RSS/Atom 和 Search API。                                                      |
| 任意 HTTP/代码节点             | 首期排除          | 密钥、SSRF、隔离与资源治理成本过高。                                                     |

## 已校验的重要限制

- LangGraph `interrupt` 恢复会从节点开头重新执行，因此中断前副作用必须幂等或移到中断后。
- BullMQ v5.16 起以 Job Schedulers 取代旧 repeatable jobs API。
- React Flow 具备键盘与屏幕阅读器基础能力，项目必须保留并中文化其 ARIA 文案。
- Motion 必须根据系统 reduced-motion 偏好取消位移、缩放和路径动画。
