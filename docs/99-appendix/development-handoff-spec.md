# Everlearn 开发交接规格

## 1. 用途与当前检查点

本文用于把项目迁移到另一台电脑并让新的开发者或 Agent 从同一事实基线继续工作。它记录本轮长期对话形成的有效决策、当前实现、恢复步骤和后续顺序；详细产品、页面、架构和任务行为仍以对应事实源为准，不在本文复制全文。

- 检查点日期：2026-08-14。
- 当前分支：`chore/foundation`。
- 当前施工阶段：`docs/tasks/02-knowledge-model.md`，即知识库模型与 API；它对应发布路线中的 M1 知识库核心，不是发布路线的 M2 检索与 AI 编辑。
- 已完成检查点：KB-00 至 KB-05；KB-05W 正在本次收尾。
- 下一项任务：KB-06 文档读取、创建与重命名 API。
- GitHub 状态：本地仓库尚未配置 remote；迁移前必须补充远端并推送。

## 2. 事实源与继续开发规则

新环境中的 Agent 必须按以下顺序读取：

1. 根目录 `AGENTS.md`。
2. `docs/README.md`。
3. 当前任务文件及其列出的最多三份上下文文档。
4. `AGENTS.md` Skill 路由命中的项目 Skill。

冲突优先级固定为：产品规格 → 页面规格与架构规格 → 工程门禁 → 当前任务。本文只做交接索引；若与上述事实源冲突，以它们为准并修正本文。

## 3. 已确认的产品基线

### 3.1 产品定位

Everlearn 是面向个人长期学习的一体化知识工作台，一级能力为知识库、资讯、教程和 Workflow；知识库是首页重点及所有成品的统一沉淀载体，AI/Agent 是跨模块基础能力。

核心闭环：

1. 建立多个知识库，以无限层级文档组织、编辑、检索和修订知识。
2. 通过服务端 LLM Provider 生成新文档；修改既有内容必须先预览差异并确认接受。
3. 按每日、每周或手动计划汇集 RSS/Search 来源，生成带来源和质量警告的正式资讯文档。
4. 针对知识点执行研究、范围确认、大纲确认、建库和逐章生成，失败章节独立重试。
5. 在列表与 React Flow 画布中编辑同一份受限 Workflow，并观察持久化运行状态。

### 3.2 用户、权限与分享边界

- 首期使用固定本地用户跑通流程，但首个数据模型起所有业务对象均保存 `ownerId`。
- 保留多账号能力，认证、公开分享与克隆在核心能力完成后实施。
- 公开内容只读；不实现协作者编辑、评论、实时协作、文档锁或冲突合并。
- 克隆是带来源与时间的独立深拷贝，之后不与原内容同步。
- 桌面端承担完整创作；移动端只读、搜索、引用跳转和状态查看。

### 3.3 明确排除

- Yjs、CRDT、实时协作、离线优先和移动端创作。
- 任意 HTTP、脚本或代码 Workflow 节点。
- 登录态抓取、浏览器自动化抓取和外部网页全文归档。
- Notion Database、知识图谱、全局通知中心、事件触发自动化。
- 附件内容 AI 解析及 Notion/语雀专用迁移。

## 4. 设计与交互基线

- 一级导航固定为：首页、知识库、资讯、教程、工作流、设置；模块同级，首页知识库优先。
- 视觉方向为温润纸张、低饱和棕金与安静正文区，支持预设主题、明暗模式和 reduced motion。
- UI 追求商业产品的克制与精致，禁止模板化“AI 风格”、大面积渐变和无意义发光。
- 组件采用 shadcn/ui（ADR 001），图标采用 Lucide；Menu、Dialog、Card、Select、Breadcrumb、Tooltip 等成熟能力不得自研重复实现。
- `packages/ui` 只保存 Design Tokens、Provider 或统一产品语义的共享组件；禁止仅转发 props 的包装层。
- Web 使用 Tailwind CSS v4 + shadcn/ui + 语义 Design Tokens（ADR 001）；迁移完成后新代码禁止新建 CSS Modules；禁止 UnoCSS 等其他原子化 CSS。
- 页面必须明确空、加载、部分成功、失败、离线、不可访问、取消、冲突与恢复状态；桌面和移动行为分别验收。
- 标志动效只用于教程生成、Workflow 节点流转和引用汇聚，正文阅读区保持安静。

## 5. 架构与数据基线

### 5.1 技术栈

- Monorepo：pnpm workspace + Turborepo。
- Web：Next.js App Router、React、shadcn/ui、Tailwind CSS v4、Lucide。
- API：NestJS 模块化单体、DTO + `class-validator`、Kysely。
- Worker：独立 NestJS 进程；后续承载 BullMQ Job Schedulers 与异步流程。
- 业务事实源：PostgreSQL 17 + pgvector。
- 队列与短期协调：Redis；不得保存业务事实。
- 本地 S3 兼容对象存储：SeaweedFS。
- Agent/Workflow：LangGraph.js 持久化状态图；尚未开始实现。

### 5.2 关键不变量

- 文档正文最终以带稳定 `blockId` 的 ProseMirror JSON 为唯一事实源；纯文本投影用于搜索，Markdown 只用于交换。
- 普通搜索使用 PostgreSQL FTS；AI 检索合并 FTS 与 pgvector，并返回文档级和块级引用。
- 浏览器只请求同源 `/api/v1`；Next rewrite 通过服务端 `API_INTERNAL_URL` 转发，浏览器不接触 Provider 密钥。
- 普通业务输入使用 Nest DTO、`class-validator` 与领域校验；Zod 只允许在 `packages/agent-runtime` 校验 LLM 输出、Agent 状态和工具参数。
- ID 使用 UUID；时间以 UTC ISO 8601 传输；计划保存 IANA 时区。
- 列表使用游标分页；编辑使用版本号乐观并发；自动写入必须有幂等键和可追溯记录。
- 错误信封固定为 `code/message/requestId/details?`，内部错误、SQL 和堆栈不得返回客户端。
- 所有 owner-scoped 查询必须在 SQL 中同时限定 owner 和生命周期，不得先读取再在应用层比较。

### 5.3 当前数据库语义

- 已建立用户、知识库、文档、修订、附件、Inbox、幂等记录及相关约束和索引。
- 普通知识库创建强制 `kind=normal`，owner 只来自服务端 `LocalIdentityContext`。
- 知识库列表按 `updated_at DESC, id ASC` 游标分页，游标保留 PostgreSQL 微秒精度。
- 知识库删除只软删除知识库行，不改写文档生命周期；正常文档读取必须同时要求所属知识库有效。
- 更新、删除与恢复使用版本冲突；恢复要求 `Idempotency-Key` 并稳定重放首次结果。
- 回收站保留 30 天；永久清理尚未实现。

## 6. Agent、Skill 与工程纪律

### 6.1 项目能力

仓库内六个 Everlearn Skill 是强制门禁：

- `everlearn-requirements`
- `everlearn-ui-design`
- `everlearn-reuse-first`
- `everlearn-api-contract`
- `everlearn-postgres-design`
- `everlearn-pragmatic-architecture`

`Superpowers` 已明确禁用：不得读取、调用、安装或推荐。个人机器上的其他 Skill 不是项目依赖，迁移后不能假设存在。

### 6.2 代码规则

- 每次只执行一个任务，通过验收后才进入下一项。
- 每项通常修改不超过 8 个手写文件；超过必须在任务证据中解释不可拆原因。
- 手写代码、测试、CSS 和配置文件不超过 400 行；函数、方法、React 组件和测试回调不超过 50 行；嵌套不超过 4 层。
- 每个手写 JS/TS/TSX 文件及函数必须有一句中文 JSDoc；支持注释的其他手写文件必须有中文文件说明。
- 注释只保留职责、约束、副作用、不变量或非显然原因，不记录历史、排障过程或方案争论。
- 设计模式只有确有必要时使用，并在主要符号以 `@designPattern` 标记问题、代价和移除条件。
- 生产代码禁止 `console.log`；输入、错误和密钥遵循 `AGENTS.md` 安全边界。

### 6.3 开发节奏

每个 KB/W/H 小阶段固定执行：

1. 在任务文档确认范围、非目标、依赖、状态和验收。
2. 搜索现有组件、契约和查询，优先复用。
3. 实现一个可运行的纵向结果，不使用生产 Mock 冒充。
4. 运行格式、Lint、类型、聚焦测试和任务要求的构建。
5. 数据库任务用真实 PostgreSQL；UI 任务用真实浏览器和桌面/移动视口走查。
6. 启动独立 Sub-agent 做只读第二视角审查，修复意见并复核。
7. 将实际命令、结果、截图结论、评审和风险写回任务文件。
8. 单独提交当前阶段，不积累多个 KB 后再做大提交。

前期默认不跑全量覆盖率和复杂 E2E；任务明确要求的聚焦测试、真实数据库和真实浏览器验证仍必须执行。核心流程稳定后按 `vibe-coding-standards.md` 分批启用 E2E、axe 和视觉回归。

## 7. 当前仓库成果

| 范围         | 当前事实                                                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| 工程基线     | Web/API/Worker 与 contracts/ui/agent-runtime 包已建立；格式、Lint、类型、Vitest、build、文件规模和 GitHub Actions 门禁已配置。 |
| 本地基础设施 | Compose 提供 PostgreSQL、Redis、SeaweedFS；`.env.example` 记录全部变量，真实 `.env` 被忽略。                                   |
| 应用壳       | 六个显式路由、桌面导航、移动只读壳、主题选择与明暗模式已实现。                                                                 |
| UI 组件系统  | 旧自研 primitive 已迁移为 Mantine；Provider、Token 和 Lucide 边界已建立。                                                      |
| 知识库读写   | 创建、列表、详情、游标分页、真实首页列表已实现；生产路由不依赖 fixture。                                                       |
| 生命周期     | 名称/说明更新、乐观版本、软删除、精确删除重放、幂等恢复 API 已实现并提交。                                                     |
| KB-05W       | 真实概览、Mantine 管理菜单、编辑/冲突恢复、删除确认和移动只读已实现，等待本次终验与提交。                                      |
| 未实现       | 文档 API/树/编辑器、Inbox、回收站 UI、搜索、AI、Workflow、资讯、教程、账号分享和生产加固。                                     |

Git 历史是实施过程的权威记录。重要最近提交依次为：知识 Schema、六个 Skill、Mantine 迁移、知识库读模型、商业质量门禁、知识库工作区、首页真实数据、知识库生命周期。

## 8. 迁移到新电脑

### 8.1 必需工具

- Git。
- Node.js `>=24 <25`。
- pnpm `>=11 <12`，仓库锁定 `pnpm@11.20.0`。
- Docker Desktop，且 Windows 虚拟化与 Docker Linux engine 可用。
- 可访问官方 npm registry；仓库 `.npmrc` 已使用官方源。

### 8.2 代码与依赖恢复

```powershell
git clone <github-repository-url> everlearn
Set-Location everlearn
pnpm install --frozen-lockfile
Copy-Item .env.example .env
```

随后仅在本机编辑 `.env`。`POSTGRES_PASSWORD`、`REDIS_PASSWORD`、S3 Key 可自行设置，但同一服务的连接 URL 必须使用一致值；不得提交 `.env` 或真实密钥。

### 8.3 新建空环境

```powershell
docker compose up -d --wait
pnpm --filter @everlearn/api build
node --env-file=.env apps/api/dist/database/migrate.js up
docker compose ps
```

### 8.4 保留旧电脑中的业务数据

Git 不包含 Docker volume。若需要保留现有知识库，不能先执行上一节的 Schema migration；应先在旧电脑导出，再恢复到新电脑的空 PostgreSQL volume，最后运行增量 migration。

旧电脑导出：

```powershell
$postgresContainer = docker compose ps -q postgres
docker exec $postgresContainer pg_dump --format=custom --no-owner --no-privileges --username=everlearn --dbname=everlearn --file=/tmp/everlearn.dump
docker cp "${postgresContainer}:/tmp/everlearn.dump" .\everlearn.dump
```

新电脑恢复前必须确认目标 volume 是刚创建且可丢弃的空环境；不得对已有数据执行删除 volume。复制 dump 后执行：

```powershell
docker compose up -d postgres --wait
$postgresContainer = docker compose ps -q postgres
docker cp .\everlearn.dump "${postgresContainer}:/tmp/everlearn.dump"
docker exec $postgresContainer pg_restore --clean --if-exists --no-owner --no-privileges --username=everlearn --dbname=everlearn /tmp/everlearn.dump
pnpm --filter @everlearn/api build
node --env-file=.env apps/api/dist/database/migrate.js up
docker compose up -d --wait
```

恢复前后的 `.env` 必须使用相同数据库名和用户；密码可以不同，因为 dump 不保存密码。当前尚未启用附件写入，无需迁移 SeaweedFS 对象；启用附件后必须另行设计并验证对象数据备份。Redis 不迁移业务事实。

### 8.5 当前可靠启动方式

API 的 `dev` 命令以 `apps/api` 为工作目录，不会自动加载仓库根 `.env`。在该便利性缺口单独修复前，使用：

```powershell
pnpm --filter @everlearn/api build
node --env-file=.env apps/api/dist/main.js
```

另一个终端启动 Web：

```powershell
pnpm --filter @everlearn/web dev
```

默认地址为 Web `http://127.0.0.1:3000`、API `http://127.0.0.1:3001/api/v1`。浏览器仍只访问 Web 同源 API rewrite。

### 8.6 新环境验收

```powershell
pnpm check:file-size
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

数据库相关集成测试必须显式加载根环境，例如：

```powershell
node --env-file=.env node_modules/vitest/vitest.mjs --project integration run
```

若 Docker 未启动，没有 `DATABASE_URL` 时相关集成测试会被跳过；这不等于测试通过，交接验收必须检查输出中的 skipped 数量。

## 9. 继续施工的唯一入口

完成本次 KB-05W 检查点后，下一 Agent 只领取 `docs/tasks/02-knowledge-model.md` 的 KB-06：

- 目标：直接子节点分页、根/子文档创建、文档详情读取和按版本重命名。
- 必读：数据模型、API 与事件、知识库页面规格。
- 非目标：正文编辑、树移动、最近打开、标签和链接。
- 完成 KB-06 的独立审查与提交后，才进入 KB-06W。

不得跳到编辑器、AI 或 Workflow，也不得因为交接重新设计已确定的技术栈、组件系统或协作边界。

## 10. 已知风险与移除条件

| 风险                                     | 影响                                                       | 移除条件                                                  |
| ---------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------- |
| 固定本地身份不是认证                     | API 暴露到公网或不可信局域网时，所有调用者会成为同一用户。 | 公开部署前完成会话认证、CSRF/Origin、防护、限流与安全头。 |
| API dev 不自动加载根 `.env`              | 新开发者直接运行过滤后的 dev 命令会缺少数据库配置。        | 独立工程任务统一根环境加载与开发启动命令。                |
| 顶栏“运行中 2”仍是阶段性静态展示         | 它不是实际运行聚合结果。                                   | Workflow 运行聚合 API/UI 任务替换该值。                   |
| 最近文档、快速记录和运行摘要尚无真实 API | 首页只展示诚实的未接入状态，不得恢复 fixture。             | 对应文档/Inbox/Workflow 纵向切片完成。                    |
| 当前无 Git remote                        | 仅存在本地历史，换机前无法从 GitHub 克隆。                 | 配置用户确认的 GitHub remote 并推送当前分支。             |
| Docker volume 不随 Git 迁移              | 本地知识库数据和未来附件不会自动出现在新电脑。             | 需要保留数据时完成 PostgreSQL 与对象存储备份恢复。        |

## 11. 交接验收

交接完成必须同时满足：

1. KB-05W 的组件测试、Lint、类型、production build、真实 API 和真实浏览器桌面/移动走查通过。
2. 独立 Sub-agent 对 KB-05W 和本文做第二视角复审，意见与处置写入任务证据。
3. `docs/tasks/README.md` 指向 KB-06，KB-05W 标记完成并包含真实命令、结果和风险。
4. 工作区不存在未说明的临时日志、截图、密钥或构建产物变更。
5. KB-05W 与交接文档分别形成符合 Conventional Commits 的小提交。
6. GitHub remote 已配置且当前分支推送成功；新电脑可从该 remote 克隆并按本文恢复。
