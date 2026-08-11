# 研究与依赖

## 触发条件

以下工作在设计或编码前必须研究：Agent/Workflow、编辑器扩展、UI 系统、复杂动效、抓取与内容解析、队列/调度、认证、分享安全，以及新增基础依赖或难以回退的外部协议。

普通 CRUD、文案和既有模式内的小改动不需要重复研究。

## 研究记录

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

| 领域          | 选择                                                                                                                                                                                                                                   | 用途与边界                                                                                              |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 编辑器        | [Tiptap](https://github.com/ueberdosis/tiptap)                                                                                                                                                                                         | Headless ProseMirror 编辑器、扩展和拖拽；不采用协作云或 Yjs。                                           |
| UI 原语       | [Radix Primitives 1.6.7](https://www.radix-ui.com/primitives/docs/overview/introduction)                                                                                                                                               | 统一包提供当前已批准的交互原语；仅通过 `packages/ui` 子路径导入、CSS Modules 提供视觉，业务不直接依赖。 |
| 动效          | [Motion for React](https://motion.dev/docs/react)                                                                                                                                                                                      | 编排与布局动效；简单变化使用 CSS。                                                                      |
| 画布          | [React Flow](https://reactflow.dev/learn/concepts/terms-and-definitions)                                                                                                                                                               | Workflow 可视化；列表仍是完整编辑入口。                                                                 |
| Agent Runtime | [LangGraph.js](https://github.com/langchain-ai/langgraphjs)                                                                                                                                                                            | 图执行、检查点、子图和人工中断。                                                                        |
| 队列          | [BullMQ Job Schedulers](https://docs.bullmq.io/guide/job-schedulers)                                                                                                                                                                   | 后台分发与每日/每周调度；不用废弃 repeatable API。                                                      |
| 搜索          | PostgreSQL FTS + pgvector                                                                                                                                                                                                              | 普通搜索与 AI 混合召回；不引入独立搜索集群。                                                            |
| Web 搜索      | Tavily Adapter                                                                                                                                                                                                                         | 首个实现；业务只依赖 Provider 接口。                                                                    |
| 组件样式      | CSS Modules + CSS variables                                                                                                                                                                                                            | 禁止原子化 CSS。                                                                                        |
| 主题运行时    | [prefers-color-scheme](https://developer.mozilla.org/docs/Web/CSS/@media/prefers-color-scheme) + [Web Storage](https://developer.mozilla.org/docs/Web/API/Web_Storage_API) + [next-themes](https://github.com/pacocoursey/next-themes) | 采用 CSS 变量、`data-*`、`matchMedia` 和 `localStorage`；功能窄且原生能力完整，不引入主题依赖。         |
| 应用壳导航    | [Next.js Accessibility](https://nextjs.org/docs/architecture/accessibility) + [usePathname](https://nextjs.org/docs/app/api-reference/functions/use-pathname)                                                                          | 使用真实 Link 路由、唯一标题和路由播报；壳只在客户端读取 pathname，切换后聚焦页面标题。                 |
| 服务端配置    | [Nest Config](https://docs.nestjs.com/techniques/configuration) + [class-validator](https://github.com/typestack/class-validator)                                                                                                      | API/Worker 启动前同步校验白名单字段；普通业务不使用 Zod。                                               |
| 本地依赖镜像  | pgvector 0.8.2/PostgreSQL 17、Redis 8.8.0、SeaweedFS 4.29                                                                                                                                                                              | 固定镜像版本；SeaweedFS 使用维护者推荐的单节点 `weed mini`。                                            |

## 工程门禁基线（2026-08-09）

| 能力       | 选择                                                                                                                                                                                       | 决策与边界                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| JS/TS Lint | [ESLint flat config](https://eslint.org/docs/latest/use/configure/configuration-files) 9.x、[typescript-eslint typed linting](https://typescript-eslint.io/getting-started/typed-linting/) | 使用类型信息执行正确性规则；ESLint 10 因 React/import 插件 peer 不兼容而不采用。 |
| 注释门禁   | [eslint-plugin-jsdoc](https://github.com/gajus/eslint-plugin-jsdoc)                                                                                                                        | 强制 `@fileoverview` 与全部函数/方法/组件 JSDoc，不强制无意义参数说明。          |
| CSS Lint   | [Stylelint](https://stylelint.io/user-guide/configure/) standard config + strict values                                                                                                    | CSS Modules 合法性、复杂度及颜色/间距/圆角/阴影/时长 Token 使用。                |
| 格式化     | [Prettier](https://prettier.io/docs/configuration)                                                                                                                                         | 独立于 ESLint 运行；不采用 `eslint-plugin-prettier`。                            |
| 测试       | [Vitest 4](https://vitest.dev/guide/projects.html) + V8 Coverage、[Supertest 7](https://github.com/forwardemail/supertest)、Testing Library                                                | 分离单元、集成和组件 project；覆盖率统一汇总；API 不绑定固定端口。               |
| 浏览器 E2E | [Playwright 1.62](https://playwright.dev/docs/test-configuration)                                                                                                                          | 验证生产构建；使用语义定位，失败保留 trace/截图，CI 执行重试。                   |
| 可访问性   | [axe-core Playwright 4.12.1](https://github.com/dequelabs/axe-core-npm)                                                                                                                    | 在真实 Chromium 检查激活后的浮层；不使用无法检查完整 CSS/浮层的 JSDOM axe。      |
| CI Runtime | [GitHub Actions](https://docs.github.com/en/actions/tutorials/build-and-test-code/nodejs) + [pnpm/setup](https://github.com/pnpm/setup)                                                    | 三个独立 Job；pnpm 11 官方 Action 同时提供 Node 24 与 pnpm；Action 固定 SHA。    |

上述依赖仅用于开发门禁，不进入生产运行包；版本由根锁文件固定，升级时必须重新执行 peer 检查和失败样例验证。

## 已拒绝或延期

| 方案                           | 结论         | 原因                                                            |
| ------------------------------ | ------------ | --------------------------------------------------------------- |
| Superpowers                    | 禁止         | Token 成本与收益不符合项目工作方式。                            |
| OpenAI Agents SDK 作为 Runtime | 不采用       | 当前需要可编辑图、持久检查点和明确子图；Provider 仍保持可替换。 |
| 自研 Workflow DSL/状态机       | 不采用       | 重复建设持久化、中断和恢复能力。                                |
| 固定 Planner/Executor/Critic   | 不采用       | 不是所有流程都需要三角色，节点和质量门槛应按模板定义。          |
| Tailwind/UnoCSS                | 禁止         | 原子化样式不符合可读性和主题约束。                              |
| Yjs/CRDT                       | 延期且无计划 | 产品不允许同时协作编辑。                                        |
| Browser automation             | 首期排除     | 资讯仅支持 RSS/Atom 和 Search API。                             |
| 任意 HTTP/代码节点             | 首期排除     | 密钥、SSRF、隔离与资源治理成本过高。                            |

## 已校验的重要限制

- LangGraph `interrupt` 恢复会从节点开头重新执行，因此中断前副作用必须幂等或移到中断后。
- BullMQ v5.16 起以 Job Schedulers 取代旧 repeatable jobs API。
- React Flow 具备键盘与屏幕阅读器基础能力，项目必须保留并中文化其 ARIA 文案。
- Motion 必须根据系统 reduced-motion 偏好取消位移、缩放和路径动画。
