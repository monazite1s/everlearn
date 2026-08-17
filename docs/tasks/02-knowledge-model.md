# 里程碑 02：知识库模型与 API

完成后可通过 API 和页面创建多个知识库、管理文档树、Inbox 与回收站；不实现正文编辑器、搜索、标签和内部链接。

KB-04C 建立共享传输边界后，每个后续 API 任务必须先在 `packages/contracts` 扩展对应安全投影，再实现 Nest DTO 与 Controller；相邻 Web 任务只消费该投影，禁止手写副本。契约与 API 属于同一资源变更，不另建无行为的横向脚手架。

## 阶段前置修复

### KB-P01 统一嵌套路由与移动端策略

- 状态：已完成。
- 依赖：UI-05。
- 必读：`docs/01-design/layout-and-navigation.md`。
- 目标：深层页面继续归属正确一级导航，并由路由能力表提供移动端限制文案。
- 非目标：拆分应用壳、实现知识库页面或移动端创作。
- 改动：`workspace-routes.ts`、`app-shell.tsx`、`app-shell.component.spec.tsx`。
- 验证：组件项目 8 个文件、20 项测试通过；Web typecheck、ESLint、文件限制和生产构建通过。
- 证据：`/knowledge/library-1/documents/document-1` 的“知识库”链接包含 `aria-current="page"`；移动端限制文案来自当前路由策略。
- 风险：无。

### KB-P02 拆分应用壳职责

- 状态：已完成。
- 依赖：KB-P01。
- 必读：`docs/01-design/layout-and-navigation.md`、`docs/03-engineering/quality-gates.md`。
- 目标：将导航和面板持久化从 `app-shell.tsx` 提取为按职责命名的模块，外部行为保持不变。
- 非目标：修改视觉、引入状态库或创建通用 Shell 框架。
- 改动：新增 `workspace-navigation.tsx` 与 `workspace-shell-state.ts`，`app-shell.tsx` 从 327 行降至 159 行。
- 验证：组件项目 8 个文件、20 项测试通过；Web typecheck、ESLint、Prettier、文件限制和生产构建通过。
- 风险：无。

## 数据库与公共边界

### KB-00 确认数据库访问层

- 状态：已完成。
- 依赖：KB-P02。
- 必读：`docs/03-engineering/research-and-dependencies.md`、`docs/02-architecture/data-model.md`、`docs/02-architecture/system.md`。
- 目标：批准 Kysely、node-postgres 和迁移边界，使后续任务不再临时选择数据层方案。
- 实施：候选生产依赖 `kysely`、`pg`，开发依赖 `@types/pg`；锁文件固定版本，API 与 Worker 各自只有一个连接池。
- 非目标：安装依赖、创建表或实现通用 Repository 基类。
- 失败恢复：未获批准时不得安装；重新选型只修改本任务与研究记录。
- 验收：用户于 2026-08-12 明确批准依赖；研究记录包含证据、限制、拒绝方案与替换成本。
- 改动：`@everlearn/api` 固定 `kysely@0.29.2`、`pg@8.22.0` 与 `@types/pg@8.20.0`，锁文件记录完整依赖图和完整性哈希。
- 验证：`pnpm.cmd --filter @everlearn/api list kysely pg @types/pg --depth 0` 解析版本正确；`pnpm.cmd --filter @everlearn/api typecheck` 通过；`pnpm format:check` 与 `git diff --check` 通过。
- 风险：pnpm 输出已有 `glob@10.5.0` 与 `ini@1.3.5` 间接依赖弃用警告，本次新增包未执行脚本且供应链策略校验通过；警告留待依赖维护任务统一处理。

### KB-01 建立数据库模块与迁移执行器

- 状态：已完成。
- 依赖：KB-00。
- 必读：`docs/03-engineering/research-and-dependencies.md`、`docs/03-engineering/development.md`、`docs/02-architecture/system.md`。
- 目标：API 可注入类型安全数据库连接，并可显式执行 up/down migration。
- 接口与状态：读取 `DATABASE_URL`；暴露单一数据库 Provider；应用关闭时等待连接池释放。
- 实施：迁移不随应用启动自动执行；迁移锁和执行记录交给 Kysely；名称使用 UTC 数字序号与下划线。
- 非目标：业务表、Repository、读写分离或连接代理。
- 失败恢复：连接和迁移失败必须返回非零退出码；down 只供本地恢复验证。
- 验收：空数据库 up、重复 up、down 后再次 up 均成功；缺失连接串启动失败。
- 改动：新增受 NestJS 管理的 PostgreSQL 连接池、显式迁移 CLI 与隔离测试 Schema；Kysely ESM 通过动态导入边界接入 CommonJS API。
- 验证：真实 PostgreSQL 集成测试 `3 passed / 0 skipped`，覆盖 up、重复 up、down 后再次 up；生产 CLI 连续两次 up 成功；缺失 `DATABASE_URL` 返回非零退出码；API typecheck、lint、格式、文件限制与构建通过。
- 风险：生产迁移注册表尚为空，业务 Schema 由 KB-02 在单独批准后建立。

### KB-02 建立 Identity 与 Knowledge Schema

- 状态：已完成。
- 依赖：KB-01。
- 必读：`docs/02-architecture/data-model.md`、`docs/00-product/product-spec.md`、`docs/02-architecture/system.md`。
- 目标：创建 User、KnowledgeBase、Document、DocumentRevision、InboxItem 和 IdempotencyRecord，并写入固定本地用户。
- 数据约束：UUID、UTC 时间、`ownerId`、`version >= 1`、受控 kind/status；知识库没有父级字段；文档父级必须与文档同所有者、同知识库。
- 实施：文档正文保存最小合法 ProseMirror JSON、`schemaVersion` 和文本投影；树路径使用服务端维护的 UUID 文本段。
- 非目标：Tag、DocumentLink、Attachment、认证、分享、全文或向量索引。
- 失败恢复：迁移提供 down；种子使用固定 UUID 和冲突忽略，允许重复执行。
- 验收：数据库拒绝跨所有者/跨知识库父子关系和非法状态；本地用户种子唯一。
- 改动：新增六张 Identity/Knowledge 表及 Kysely 类型契约；Schema 与固定本地用户种子使用两个独立迁移；复合外键约束文档、修订和 Inbox 所有权。
- 验证：真实 PostgreSQL 集成测试 `4 passed / 0 skipped`，覆盖生产迁移 up、重复 up、双 down、再次 up、种子唯一、受控状态、正文形状及跨范围父子关系；本地数据库首次执行两个迁移、重复执行零迁移；API typecheck 与聚焦 ESLint 通过。
- 风险：`updatedAt`、树路径和排序值由后续应用服务维护；本任务不添加触发器或 Repository 抽象。

### KB-03 建立 HTTP 公共边界与本地身份

- 状态：已完成。
- 依赖：KB-02。
- 必读：`docs/02-architecture/api-and-events.md`、`docs/03-engineering/development.md`、`docs/00-product/product-spec.md`。
- 目标：所有 Knowledge API 共享输入校验、错误信封、requestId 和服务端本地用户上下文。
- 契约：错误固定为 `code/message/requestId/details?`；DTO 使用 `class-validator`；客户端请求不得包含 `ownerId`。
- 实施：全局 ValidationPipe 开启白名单、拒绝未知字段和转换；全局异常过滤器隐藏内部错误。
- 非目标：登录、授权角色、速率限制和 Web 代理。
- 失败恢复：未知错误只向客户端返回稳定 500 code，服务端保留结构化日志和 requestId。
- 验收：非法 UUID、未知字段、其他所有者对象与内部异常均产生规定响应。
- 改动：注册严格全局 `ValidationPipe` 与安全异常过滤器；新增固定本地身份上下文和通用 UUID 路由 DTO；迁移与请求上下文复用同一无框架常量，客户端不能提交 `ownerId`。
- 验证：边界相关单元测试 `10 passed`，真实 Nest HTTP 集成测试 `5 passed`；API typecheck、聚焦 ESLint、文件限制、生产构建与 `git diff --check` 通过。
- 证据：未知字段返回字段名与规则标识；非法 UUID 返回 `VALIDATION_FAILED`；500 响应不包含异常消息或堆栈，服务端日志只保留异常类型、方法、路径与 requestId。
- 风险：当前身份固定为本地用户；认证阶段必须替换 `LocalIdentityContext` 的来源，业务 Controller 仍不得接受客户端 `ownerId`。

## 第一纵向切片：知识库创建与列表

### KB-04C 定义知识库创建与读取传输契约

- 状态：已完成。
- 依赖：KB-03。
- 必读：`docs/02-architecture/api-and-events.md`、`docs/02-architecture/data-model.md`、`docs/01-design/pages/knowledge-base.md`。
- 目标：在 `packages/contracts` 建立知识库创建、摘要、游标列表和安全错误码的唯一传输类型。
- 契约：创建只接受 `name` 与可选 `description`；摘要固定返回 `id/name/description/kind/documentCount/updatedAt/version`；列表为 `{ items, nextCursor }`。
- 非目标：Nest DTO、HTTP 调用、数据库查询、生成器或通用 API SDK。
- 失败恢复：契约不完整时不得在 Web 或 API 手写副本；修改尚无兼容负担的类型即可回退。
- 验收：Web/API 可从同一包导入投影；类型中没有 `ownerId`、数据库行或自由文本状态。
- 改动：`@everlearn/contracts` 导出创建输入、知识库用途、公开摘要、游标列表和本切片稳定错误码；API 与 Web 通过正式 workspace 依赖消费同一入口。
- 验证：Contracts 编译期键集合断言、Contracts/API/Web typecheck、聚焦 ESLint、文件限制和三包生产构建通过；TypeScript 分别从 API 与 Web 解析到同一 `packages/contracts/src/index.ts`。
- 证据：公开摘要固定为 `id/name/description/kind/documentCount/updatedAt/version`，列表固定为 `{ items, nextCursor }`；仓库搜索确认契约不包含 `ownerId`、数据库行、删除字段、路由 `href`、Zod 或自由文本状态。
- 风险：共享包只定义静态传输类型，运行时输入校验仍由下一任务的 Nest DTO 与领域规则负责；不得把这些接口误当作不可信 JSON 的运行时验证器。

### KB-04 实现知识库创建、列表与读取 API

- 状态：已完成。
- 依赖：KB-04C。
- 必读：`docs/02-architecture/api-and-events.md`、`docs/02-architecture/data-model.md`、`docs/01-design/pages/knowledge-base.md`。
- 目标：实现 `POST/GET /api/v1/knowledge-bases` 与 `GET /api/v1/knowledge-bases/:id`，固定用户可创建、游标列表并读取自己的知识库摘要。
- 契约：游标由无损的 `updatedAt + id` 编码且对客户端不透明；静态结果集按 `updatedAt DESC, id ASC` 分页；limit 默认 20、范围 1..100；普通入口只能创建 `normal`；响应符合 KB-04C。
- 输入：`name` 去除首尾空白后为 1..200 字符；可选 `description` 去除首尾空白后不超过 2,000 字符；游标最多 512 字符且必须是规范编码；创建仅接受 `application/json`。
- 非目标：详情编辑、删除、恢复、页面、系统知识库和 Repository 基类。
- 失败恢复：重复名称允许；无效游标返回标准校验错误；写入失败不返回临时对象。创建在本切片中不幂等，响应结果未知时客户端重新读取列表确认，不得自动重放 POST。
- 验收：稳定分页无重复遗漏；读取其他所有者或已删除对象统一不可访问；所有权只由服务端上下文写入；文档数准确。
- 改动：新增独立 KnowledgeBases Nest 模块、严格创建/列表 DTO、规范 base64url 游标与 owner-scoped Kysely 服务；扩展共享成功/错误契约与 JSON-only 写入；未引入 Repository、依赖或迁移。
- 验证：真实 PostgreSQL HTTP 集成测试 `5 passed`，Schema 回归测试 `1 passed`，公共 API 边界测试 `4 passed`；API/Contracts typecheck、聚焦 ESLint、Prettier、文件限制、生产构建与 `git diff --check` 通过。
- 证据：真实数据跨 4 页覆盖相同时间与同毫秒不同微秒，ID 无重复遗漏；其他所有者、软删除与不存在详情返回同形 404；有效文档计数排除软删除；字段注入、非法 limit/cursor、非 JSON 与畸形 JSON 均被稳定拒绝且不写库。
- 风险：固定本地身份不是认证，只适用于 API 绑定本机的当前阶段；游标保证静态结果集，不承诺跨页期间发生更新时的快照一致性；创建为非幂等同步写入。

### KB-04W 接入真实知识库列表与创建页面

- 状态：已完成。
- 依赖：KB-04。
- 必读：`docs/01-design/pages/knowledge-base.md`、`docs/01-design/design-system.md`、`docs/02-architecture/api-and-events.md`。
- 目标：让 `/knowledge` 使用真实 API 完成列表、首次使用创建和创建后进入知识库的最小闭环。
- 实施：复用 Mantine `Card/Button/Modal/TextInput/Alert/Skeleton`；Web 只依赖共享契约；生产请求使用同源 `/api/v1` 传输边界，不保存 `ownerId`。
- 状态：覆盖加载、首次使用、追加分页、校验失败、请求失败和创建中；提交失败保留输入，重复提交被禁用。
- 非目标：概览、文档树、Inbox、回收站、首页、搜索和客户端缓存框架。
- 失败恢复：列表失败可局部重试；创建响应丢失时重新读取列表，不在前端合成成功对象。
- 验收：空数据库可创建并自动进入 `/knowledge/:id`；刷新后对象仍存在；移动端不渲染创建控件。
- 验证：Knowledge 聚焦组件测试、Web/API typecheck、ESLint、生产构建和真实 API 页面走查。
- 改动：`/knowledge` 接入同源真实 API、严格响应校验、游标追加、创建与不确定写入恢复；新增最小只读 `/knowledge/:knowledgeBaseId` 目的地，保证创建后跳转与刷新闭环但不提前实现 KB-05W 管理能力；Next rewrite 只读取服务端 `API_INTERNAL_URL`。
- 复用与评审：直接使用 Mantine `Card/Button/Modal/TextInput/Textarea/Alert/Skeleton`、Lucide 与既有 AppShell，没有新增依赖、通用 API SDK、表单框架或重复基础控件；独立 UI/API 只读预审提出的真实目的地、同源 rewrite、移动端入口与失败恢复问题均已落实。
- 验证结果：聚焦 ESLint、Stylelint、Prettier、Web/API typecheck、文件限制与 Web production build 通过；3 个组件测试文件共 `8 passed`；真实 PostgreSQL 迁移、API readiness 与 Web rewrite 200 通过；真实浏览器完成桌面创建、自动进入、刷新持久化、返回列表，并确认 390px 视口创建按钮与顶栏新建入口均为 `0`。
- 完成证据：本地创建“Everlearn 开发记录”，进入 `/knowledge/a085f7ca-fabc-4467-ac50-24babd6deaaa`；刷新后名称、说明与 `0` 篇文档仍来自服务端，返回列表后真实卡片可见。桌面与移动端截图已在当次验收会话人工检查，未提交临时产物。
- 范围说明：本切片触及 12 个手写/配置文件，超过通常 8 个文件；不可安全拆分的原因是同源 rewrite、列表/创建页、真实目的地路由、移动端全局入口、现有路由测试和任务证据共同组成单一可运行验收闭环，任何再拆分都会产生 404、Mock-only 或移动端错误入口的半成品。
- 风险：`pnpm --filter @everlearn/api dev` 以 `apps/api` 为工作目录，当前不会自动读取根 `.env`；本次使用 Node 24 官方 `--env-file=.env` 完成真实验收。影响仅为本地启动便利性，后续独立工程任务在不混入业务切片的前提下统一开发启动命令。固定本地身份仍不是生产认证；公开部署前必须补认证与 CSRF/Origin 防护。

### KB-04H 替换首页知识库静态数据

- 状态：已完成。
- 依赖：KB-04W。
- 必读：`docs/01-design/pages/home.md`、`docs/01-design/design-system.md`、`docs/02-architecture/api-and-events.md`。
- 目标：首页知识库区域读取真实列表，并把生产 `home-data` fixture 限定为测试数据。
- 实施：知识库区域独立加载和重试；首页创建入口复用 KB-04W 的产品行为；未有真实来源的最近文档和运行摘要不得继续展示伪数据。
- 非目标：最近打开记录、快速记录、运行聚合或统一首页 API。
- 失败恢复：API 失败只替换知识库区域；请求恢复后重新读取，不缓存伪成功状态。
- 验收：首页创建/列表与 `/knowledge` 数据一致；生产路由不导入任何 fixture；无真实运行时不显示运行卡片。
- 验证：首页组件测试、生产依赖搜索、Web typecheck、生产构建和桌面/移动走查。
- 改动：首页知识库区域直接复用 KB-04W 的真实 API、游标状态与共享知识库卡片；删除生产 `home-data` fixture，最近文档显示尚未接入的诚实说明，运行摘要与快速记录在对应真实 API 前不渲染。
- 复用：直接使用 Mantine、Lucide、`useKnowledgeList`、`useOnline`、`KnowledgeBaseCard` 和共享 `KnowledgeBaseSummary`，没有新增依赖、重复 DTO、第二套 API 客户端或通用状态框架。
- 第二视角评审：独立代码审查确认生产 fixture 退出、共享 API/Hook/Card 复用、状态覆盖、移动端只读和任务边界均符合要求，CRITICAL/HIGH/MEDIUM/LOW 均为 0，结论 `APPROVE`。
- 验证结果：聚焦 ESLint、Stylelint、Prettier、Web typecheck、文件限制与 production build 通过；Home/Knowledge/Route 3 个组件测试文件共 `8 passed`；生产依赖搜索确认不再存在 `home-data`、`readyHomeModel` 或运行/最近文档 fixture 引用。
- 真实证据：同一本地 PostgreSQL 中，首页和 `/knowledge` 均显示“Everlearn 开发记录”；390px 视口不显示首页知识库创建链接，也不存在快速记录输入；桌面创建入口统一进入 `/knowledge?create=knowledge-base`。
- 风险：最近打开文档、运行摘要和快速记录仍待各自真实 API 任务，当前以明确说明或完全隐藏避免伪数据；AppShell 顶栏的阶段性“运行中 2”与首页本任务无关，必须由运行聚合任务替换，不能视为真实状态。

## 第二纵向切片：知识库详情与文档树

### KB-05 实现知识库更新、删除与恢复 API

- 状态：已完成（2026-08-14）。
- 依赖：KB-04。
- 必读：`docs/02-architecture/api-and-events.md`、`docs/02-architecture/data-model.md`、`docs/01-design/pages/knowledge-base.md`。
- 目标：实现 `PATCH/DELETE /knowledge-bases/:id` 及 `POST /knowledge-bases/:id/restore`。
- 契约：更新、删除和恢复提交 `version`；恢复额外要求 `Idempotency-Key`；成功后版本加一；其他所有者对象统一不可探测。
- 非目标：永久删除、文档 API 和页面。
- 失败恢复：版本冲突不写入；删除以请求版本与当前版本的精确关系识别重放；恢复以所有者、操作和幂等键保存请求指纹与首次响应，相同请求返回原响应，不同请求复用键返回冲突。
- 验收：软删除只标记知识库，正常文档查询必须同时校验所属知识库未删除；恢复不改写文档行，树结构保留且此前单独删除的文档不会被误恢复。
- 验证：领域状态测试、Controller 契约测试、PostgreSQL 集成测试。
- 完成证据：共享契约已增加更新/生命周期请求与 `VERSION_CONFLICT`、`IDEMPOTENCY_CONFLICT`；Nest DTO 严格拒绝空 PATCH、系统字段、非法版本和非 JSON 写入；owner-scoped 行锁串行化更新、删除和恢复，恢复用 PostgreSQL transaction advisory lock 与 `idempotency_records` 原子保存首次响应。删除只修改知识库行，不引入迁移或设计模式；后续文档正常查询必须 join active 知识库。
- 验证结果：`pnpm.cmd --filter @everlearn/contracts typecheck`、`pnpm.cmd --filter @everlearn/api typecheck`、聚焦 ESLint、Prettier 与 `git diff --check` 通过；`node --env-file=.env node_modules/vitest/vitest.mjs run --project integration apps/api/src/knowledge-bases/knowledge-base-lifecycle.integration.spec.ts apps/api/src/knowledge-bases/knowledge-bases.integration.spec.ts` 在本地 PostgreSQL 通过 2 个文件、10 个场景；复审补强后的生命周期 6 个场景额外锁定非精确删除重放与恢复前后文档全部生命周期/树字段不变。
- 范围说明：公共契约、两个职责单一的 DTO、可信冲突映射、读取投影、生命周期事务和真实 PostgreSQL 测试必须同一纵向切片落地；因此超过通常 8 个手写文件。拆分后所有手写文件均不超过 400 行，未引入 Repository、ADR、新依赖或假想扩展点。
- Skill 影响：API Contract 明确恢复必须使用 `Idempotency-Key` 并稳定重放首次响应；PostgreSQL Design 将知识库行锁、幂等键 advisory lock 和业务变更放入同一事务；Pragmatic Architecture 将读取与生命周期按真实职责拆分，未登记设计模式。
- 独立复审：Sub-agent 终审最初指出关键负向回归与失真注释；补齐非精确删除重放、文档生命周期/树字段快照并修正文档后复核为 `APPROVE`，CRITICAL/HIGH/MEDIUM/LOW 均为 0。

### KB-05W 接入知识库概览与管理

- 状态：已完成（2026-08-17）。
- 依赖：KB-05、KB-04W。
- 必读：`docs/01-design/pages/knowledge-base.md`、`docs/01-design/design-system.md`、`docs/02-architecture/api-and-events.md`。
- 目标：让 `/knowledge/:knowledgeBaseId` 显示真实概览，并可重命名、修改说明和移入回收站。
- 状态：覆盖加载、不可访问、版本冲突、保存中、保存失败和删除确认；冲突后保留用户输入并提供刷新。
- 非目标：文档树、正文、恢复 UI、协作锁和通用表单框架。
- 失败恢复：更新或删除失败保持当前页面与输入；不可访问统一返回稳定页面状态。
- 验收：更新刷新后保持；删除后返回 `/knowledge` 且列表不再显示；移动端只读。
- 改动：`/knowledge/:id` 概览消费 KB-05 生命周期 API（更新/删除/冲突重读），管理菜单桌面渲染、移动端省略；新增创建与编辑对话框共享的 `KnowledgeDialogActions` 统一提交/取消语义。
- 复用与评审：直接复用 shadcn Dialog/AlertDialog/DropdownMenu/Field/Input/Textarea 与共享 PageShell/SectionCards/LoadFailure，无新增依赖；独立 code-reviewer 评审结论 `REQUEST_CHANGES`（英文注释残留、保存/删除进行中 Escape 静默关闭对话框、冲突后版本传播无回归锁定），四项阻塞全部修复后复验通过，其中表单语义对齐暴露并修复了 form 内非提交按钮隐式提交陷阱。
- 走查发现：shadcn 迁移丢失创建入口的移动端隐藏（列表页与首页两处），本任务恢复为 `hidden md:inline-flex` 并纳入走查断言。
- 验证结果：`pnpm test:component apps/web/src/features` 3 个文件 `19 passed`；`pnpm lint:js:files 'apps/web/src/features/**'`、`node scripts/check-comments.mjs`（123 文件 703 条注释）、`node scripts/check-file-size.mjs`、`pnpm format:files apps/web/src/features/knowledge apps/web/src/features/home`、`pnpm --filter @everlearn/web typecheck` 与生产构建通过。
- 真实证据：Playwright（Chrome headless，真实 API）7 步走查通过——概览真实数据、编辑保存后摘要可见更新、刷新后保持、并发 PATCH 构造的版本冲突保留输入并展示指引、读取最新版本后携带新版本重存成功、移入回收站确认文案如实说明无恢复入口且删除后返回列表不再显示、390px 视口详情无管理入口且列表/首页无创建入口；桌面与移动截图当次会话人工检查，未提交临时产物。
- Skill 影响：everlearn-reuse-first 促成创建/编辑对话框底部操作合并为 `KnowledgeDialogActions`（两处确认复用并统一提交语义）；everlearn-shadcn-ui 约束全部样式走语义 token 且组件来自 `@everlearn/ui`。
- 风险：说明字段 2000 字符上限在创建与编辑两处硬编码，出现第三处使用时提升为 contracts 常量；软删除对象在 KB-10W 回收站上线前无自助恢复入口，删除确认文案已如实告知。

### KB-06 实现文档读取、创建与重命名 API

- 状态：已完成（2026-08-17，子 agent 实现 + 主 agent 复验）。
- 依赖：KB-05。
- 必读：`docs/02-architecture/data-model.md`、`docs/02-architecture/api-and-events.md`、`docs/01-design/pages/knowledge-base.md`。
- 目标：实现直接子节点分页、根/子文档创建、详情读取和按版本重命名。
- 契约：`GET/POST /knowledge-bases/:id/documents`、`GET/PATCH /documents/:id`；创建只接受 `parentId?` 与标题。
- 实施：服务端分配 path、position、最小正文和初始修订；查询不全量返回树。
- 非目标：正文编辑、移动、最近打开、标签和链接。
- 失败恢复：父节点无效或已删除时事务回滚；版本冲突不改标题。
- 验收：根与子文档顺序稳定；跨知识库父级被拒绝；大树按展开读取。
- 改动：contracts 新增文档契约（`DocumentTreeItem`/`DocumentDetail`/游标列表/错误码与标题上限常量）及编译期键锁定测试；API 新增 documents 模块（3 个 DTO、owner-scoped 投影查询、创建/列表/详情/重命名服务与两个控制器）；`tsconfig.spec.json` rootDir 覆盖使 `apps/api/tests/` 共享集成夹具参与 spec 类型检查且不进 nest 构建。
- 设计要点：position 同父末尾追加（`max+1024`，间隔耗尽属 KB-07 再平衡）；创建事务先 `FOR UPDATE` 锁知识库行再锁父行，串行化同库与同父追加；path 由锁定父行派生；最小正文与初始修订同事务写入；正常查询 join 活跃知识库且排除软删除（延续 KB-05 规则）。
- 复用与评审：复用 KB-03 全局边界、KB-04/05 错误信封与不可探测 404 模式，无新依赖、无迁移、无 Repository；独立 code-reviewer 评审 `APPROVE`（0 CRITICAL/HIGH，锁序与 childCount 排除软删除均经读 SQL 复核属实），M1 并发创建回归、L2 `updatedAt` 断言、L3 冗余游标校验已按评审补齐。
- 验证结果：contracts/api/web typecheck、聚焦 ESLint、Prettier、注释门禁（137 文件 815 条）、文件限制通过；unit `14 passed`（含游标编解码 4）；真实 PostgreSQL 集成测试 documents `14 passed` + knowledge-bases 回归 `11 passed`。
- 证据：并发双创建得到互异 position `0/1024`；21 个乱序子节点按 `position ASC, id ASC` 4 页遍历无重复遗漏；跨库父、他人库、已删库/父统一 404 且行数断言无部分写入；重命名冲突后数据库标题/版本/修订数不变；childCount 排除软删除子节点。
- 风险：`documents` 无 `(knowledge_base_id, parent_id, position)` 唯一约束，position 不变量依赖 KB 行锁串行化，KB-07 引入移动并发写入时评估 partial unique index；DTO 标题上限硬编码 200（contracts 为 ESM-only，API CommonJS 无法值导入常量，与 KB-04 同先例，contracts 双格式构建时接线）；列表范围校验与主查询跨连接存在固有竞态（其间知识库被软删返回空页而非 404，单用户本地产品可接受）。

### KB-06W 接入按需文档树与创建

- 状态：已完成（2026-08-17，子 agent 实现 + 主 agent 复验与走查）。
- 依赖：KB-06、KB-05W。
- 必读：`docs/01-design/pages/knowledge-base.md`、`docs/01-design/layout-and-navigation.md`、`docs/01-design/design-system.md`。
- 目标：知识库概览按展开加载真实文档树，并支持创建根/子文档与重命名。
- 实施：树节点使用 shadcn/ui 组件与 Lucide 图标（原 Mantine 表述随 ADR 001 迁移作废）；每个父节点独立加载/重试；创建成功只更新受影响兄弟列表。
- 非目标：拖拽、移动、正文编辑、最近打开和全局树状态库。
- 失败恢复：创建/重命名失败保留编辑值；展开失败不折叠已成功区域。
- 验收：可创建两级文档，刷新后层级不变；键盘可展开和进入；移动端隐藏修改控件。
- 改动：新增文档 API 客户端（严格响应校验，类型全部来自 contracts）、树状态 hook（按需读取/游标分页/本地同步）、创建与重命名对话框（复用 `KnowledgeDialogActions`）、树渲染组件；概览页以真实文档树替换占位说明，创建确认后同步统计卡。
- 复用与评审：复用 Dialog/DropdownMenu/Field/Input/Skeleton、shared `LoadFailure`/`EmptyState`/`PageShell`/`SectionCards`，无新增依赖；独立 code-reviewer 评审 `REQUEST_CHANGES`（0 CRITICAL/HIGH），两个 MEDIUM 已修复——动态路由切库串库竞态以 `key={knowledgeBaseId}` 重挂载消除、统计卡同步补取证测试且创建结果未知路径接入权威摘要重读；LOW 项处置：RootArea 复用 ChildrenPending、两处 `ponytail:` 天花板注释、键盘测试名如实化。
- 验证结果：组件测试 4 文件 `29 passed`（含两级创建重挂载保持、重命名冲突保留输入并重存、展开失败隔离、统计卡同步与不确定结果对账、移动端无修改控件）；Web typecheck、聚焦 ESLint、Prettier、注释（159 文件 1078 条）、文件限制与生产构建通过。
- 真实证据：真实同源 API 完成两级创建（151 字长标题）与观察版本重命名、错误版本 409；Playwright（Chrome headless）确认展开箭头 `aria-expanded` 语义、键盘 Enter 展开子节点、行菜单重命名对话框、390px 无任何修改入口且树可读、系统深色模式渲染正常；浅色/深色/移动截图当次会话人工检查。
- 风险：`document-tree.tsx` 392/400 行接近上限，KB-07W 增加移动交互前需先拆分；统计卡数量为创建确认后本地 +1，他人并发删除的偏差由后续移动/回收站任务的同步策略收敛；「打开文档」为不可用态，待 ED-05 文档路由。

### KB-07 实现原子文档树移动 API

- 状态：已完成（2026-08-17，子 agent 实现 + 主 agent 复验）。
- 依赖：KB-06。
- 必读：`docs/02-architecture/data-model.md`、`docs/02-architecture/api-and-events.md`、`docs/03-engineering/quality-gates.md`。
- 目标：实现 `POST /documents/:id/move`，原子更新父级、位置、版本和全部后代路径。
- 契约：提交 `targetParentId?`、相邻锚点（`beforeId?`/`afterId?` 互斥，缺省末尾）、`version` 和 `Idempotency-Key`；响应复用 `DocumentDetail`。
- 改动：contracts 扩展移动请求与 `IDEMPOTENCY_CONFLICT`；API 新增移动规则纯函数、幂等存取、事务编排服务与 DTO/路由；共享集成夹具支持显式物化 path。
- 设计要点：锁序 advisory → 知识库行（`FOR UPDATE OF kb`）→ 移动行 → 目标父行（同库全部树写以 KB 行锁为第一串行化点，无锁序环）；落位取整数间隙中点，末尾 `max+1024` 含软删兄弟，间隔耗尽触发单父重排（`index*1024`，不动兄弟版本）；后代路径单条参数化前缀替换 UPDATE；移动节点 `version+1`，后代/兄弟不传播内容版本；幂等完整复刻 KB-05 restore 范式（同键重放首次响应原文，异键 409）。
- 复用与评审：独立 code-reviewer 评审 `APPROVE`（0 CRITICAL/HIGH；锁序、环检测边界、前缀替换 SQL、落位算术逐行核对属实），评审 LOW 项已修——目标父锁查询收窄同库消除跨库锁环、自锚点回归测试、重排参数天花板 `ponytail:` 注记。
- 验证结果：contracts/api typecheck、聚焦 ESLint、Prettier、注释（173 文件 1206 条）、文件限制通过；树规则单元 `13 passed`；真实 PostgreSQL 集成 documents+knowledge-bases `38 passed`（移动 4 + 幂等并发 5 + 校验 4 + 既有回归）。
- 证据：三层子树换父后子/孙 path 精确前缀替换；重排后兄弟顺序稳定且 version 不变；409/404/400 场景全表树字段快照零写入；同键并发经 advisory lock 串行化为同一首次响应、幂等记录恰 1 条、version 恰 +1；重放先 rename 后仍返回原文。
- 风险：`kind:'validation'` 跨模块私有标记属无类型字符串约定（当前生产者为白名单常量，无泄露），KB-09 或下次触碰 http-boundary 时以 `ApiValidationException` 类型化工厂替代；`requireIdempotencyKey` 第 2 份拷贝与 KB-08 登记的 `requireJsonContentType` 第 3 份拷贝在下一次工程清扫任务统一提升；KB-06 登记的 `(kb,parent,position)` 唯一索引维持不建（全部写入方在 KB 行锁内串行化，KB-10 恢复落位时再评估）。

### KB-07W 接入文档树移动交互

- 状态：已完成（2026-08-17，子 agent 实现 + 主 agent 复验与走查）。
- 依赖：KB-07、KB-06W。
- 必读：`docs/01-design/pages/knowledge-base.md`、`docs/01-design/layout-and-navigation.md`、`docs/01-design/design-system.md`。
- 目标：桌面文档树支持拖拽和键盘菜单移动同一 API 行为。
- 改动：新增树移动模型纯函数（乐观套用/快照恢复/选项禁用）、拖拽控制器（原生 HTML5 三区放置 + 根区放置 + 视觉反馈）、键盘「移动到…」对话框（Select 目标父级 + 相对位置）、共享类型消除循环依赖；document-tree.tsx 392→353 行（行渲染拆出）；API 客户端补 `moveDocument` 与 `IDEMPOTENCY_CONFLICT` 错误码。
- 复用决策（reuse-first 记录）：`react-arborist` 拒绝（接管整树渲染会推翻按需游标分页架构）；`@dnd-kit` 本任务拒绝（树形 sortable 是官方模式仍需 200+ 行自写投影，键盘可达性由对话框路径更优覆盖）；采用零依赖原生 HTML5 DnD 基线（约 230 行）。升级触发条件：需要自动滚动/触摸拖拽/跨列表拖拽时按依赖门禁报批引入 dnd-kit 并删除原生实现。
- 状态覆盖：拖拽来源半透明 + before/after 指示线 + into 高亮；自身/已加载后代拒放（dragover 即拒、零请求）；乐观快照只覆盖源/目标父列表；失败恢复快照 + 可行动提示；网络不确定「重试移动」复用同一幂等键（服务端仅应用一次）；409 幂等冲突换新键；移动端无 draggable、无行菜单。
- 复用与评审：独立 code-reviewer 评审 `REQUEST_CHANGES`（0 CRITICAL/HIGH），三项 MEDIUM 已修——嵌套空白 drop 冒泡误触发顶层移动（嵌套容器 stopPropagation + 回归测试）、失败后乐观展开不回滚导致空白菜单区（失败回滚展开态）、afterId 路径零覆盖（补载荷与落位断言）；LOW 已处置：父级下拉提交中禁用、对话框移动清除过期拖拽重试意图（`forget()`）、model 死导出清理、离线禁拖与幂等冲突换键测试补齐。
- 验证结果：组件测试 6 文件 `46 passed`（新增 16：拖拽/键盘载荷字节级一致、afterId、嵌套空白防护、后代拒放、冲突快照恢复、同键重试单次生效、离线禁拖、幂等冲突换键、移动端断言）；Web typecheck、聚焦 ESLint、Prettier、文件限制、注释（204 文件）、design-token 门禁与生产构建通过。
- 真实证据：Playwright（Chrome headless，真实 API）——键盘对话框移动子文档到知识库顶层、刷新后保持为根；原生拖拽移回子级、刷新后层级恢复（API 复核 `ROOT/CHILD` 投影一致）；390px 无 draggable 行与行菜单；截图当次会话人工检查。
- 风险：拖拽无视口自动滚动（长树先滚动再拖，原生基线天花板，升级条件见复用决策）；移动对话框目标父级仅列已加载节点（按需加载架构一致，未加载子树先展开再选）；未加载后代目标由服务端 400 兜底显示错误。

## 第三纵向切片：Inbox 与首页快速记录

### KB-08 实现 Inbox 记录与列表 API

- 状态：已完成（2026-08-17，子 agent 实现 + 主 agent 复验）。
- 依赖：KB-03。
- 必读：`docs/01-design/pages/knowledge-base.md`、`docs/02-architecture/api-and-events.md`、`docs/02-architecture/data-model.md`。
- 目标：实现 `POST/GET /inbox-items` 与 `DELETE /inbox-items/:id`。
- 契约：输入只能是非空纯文本或一个 `http/https` URL；列表使用游标分页。
- 非目标：网页抓取、AI、页面和文档转换。
- 失败恢复：非法 URL 和混合载荷快速失败；删除失败保留记录。
- 验收：无需知识库即可记录；其他所有者记录不可探测；已转换记录不在待处理列表。
- 改动：contracts 新增 inbox-item 契约（摘要严格四键 `content/createdAt/id/kind`、五错误码、上限常量）与编译期键锁定；API 新增 inbox-items 模块（二选一载荷 DTO、不透明游标 DTO、owner-scoped 软删除服务、控制器）；无迁移、无新索引、无新依赖。
- 设计要点：`text`/`url` 对称 ValidateBy 实现「二选一」——本键有效当且仅当另一键缺失；排序 `created_at DESC, id ASC` 精确命中既有 `inbox_items_owner_status_idx`；游标为微秒拆分整数的 base64url JSON；DELETE 软删除后重复删除与他人/不存在/已转换统一同形 404（单条原子 UPDATE 零行判定）。
- 复用与评审：复刻 documents/knowledge-bases 模式与全局边界；独立 code-reviewer 评审 `APPROVE`（0 CRITICAL/HIGH；XOR 边界矩阵、游标谓词与微秒编码经直连 PostgreSQL 探针实测），M1 同刻并列分页回归与 LOW 两处一致性已按评审补齐。
- 验证结果：contracts/api typecheck、聚焦 ESLint、Prettier、注释（153 文件 971+ 条）、文件限制通过；unit `11 passed`；真实 PostgreSQL 集成 `7 passed`（含并列页边界、converted 真实外键夹具、统一 404 行未触碰断言、非法载荷零写入）。
- 证据：EXPLAIN 确认列表走 `Index Scan using inbox_items_owner_status_idx` 无 Sort 节点；同 `created_at` 并列对被 limit 切开后遍历恰好一次含全部记录；`ftp:`/`javascript:`/裸域名/空主机 URL 与混合载荷均 400 且不写库。
- 风险：DTO 侧 `CONTENT_MAX_LENGTH` 与契约常量为手工镜像（contracts ESM-only，与 KB-04/06 同先例，contracts 双格式构建时接线）；`requireJsonContentType` 中间件已出现第三份拷贝，下次触碰时提升至 http-boundary 共享。

### KB-08W 接入 Inbox 列表与记录

- 状态：已完成（2026-08-17，子 agent 实现 + 主 agent 复验与走查）。
- 依赖：KB-08、KB-04W。
- 必读：`docs/01-design/pages/knowledge-base.md`、`docs/01-design/design-system.md`、`docs/02-architecture/api-and-events.md`。
- 目标：让 `/knowledge/inbox` 使用真实 API 创建、分页查看和删除待处理记录。
- 状态：覆盖首次使用、加载、分页、字段错误、提交失败和删除失败；失败保留输入或记录。
- 非目标：转换、抓取、AI、首页和移动端处理。
- 失败恢复：重新读取服务端事实；不以乐观删除隐藏失败记录。
- 改动：新增 inbox feature（严格校验 API 客户端、列表状态、记录表单、列表行与删除确认、页面组合）与 `/knowledge/inbox` 路由（移动端说明经路由策略机制注入）；知识库列表页头新增固定 Inbox 次级入口；面包屑补 Inbox 标签；OfflineNotice 参数化说明。
- 设计决策：单一 textarea 自动判别——trim 后单行且以 http/https 开头按 URL（客户端用与服务端同款 `new URL` 预校验），其余按文本；创建用页面内联表单（快速记录最短路径），不用对话框。
- 复用与评审：复用 PageShell/EmptyState/LoadFailure/format-datetime/use-online 与 shadcn 表单/确认组件，无新增依赖；`useMediaQuery` 为第二处本地副本（`ponytail:` 注记，第三处出现时提升 shared）。独立 code-reviewer 评审 `REQUEST_CHANGES`，三项已处置——尾随换行 URL 误判（改用 trim 后判换行 + 回归测试）、分页失败保留用例补齐、确认按钮删除中禁用视觉态。
- 验证结果：组件测试 5 文件 `43 passed`（文本/URL/尾随换行 URL 记录、非法载荷字段错误、多行按文本、提交失败保留输入、不确定创建重读、分页与失败保留、确认后删除/失败保留/不确定重读、移动端无控件）；聚焦 ESLint、Prettier、注释（182 文件 1269 条）、文件限制通过；Web typecheck 与生产构建归因干净（错误全部位于并行编辑器任务在途文件，本切片文件零错误），与本波次统一复验。
- 真实证据：Playwright（Chrome headless，真实 API）6 步通过——文本记录、尾随换行 URL 按链接记录、刷新持久化、删除确认文案如实（无法恢复）且确认后移除、390px 无表单与提交按钮；桌面截图当次会话人工检查。
- 风险：删除不确定重读回第一页（多页视图重置，服务端真相优先）；URL 记录纯文本展示未做外链打开（任务范围外，后续任务判断）；删除成功后焦点回落 body（与 knowledge-management 同模式缺陷，键盘焦点管理登记为后续统一任务）；创建不确定且实际已持久化时输入未清空，重复提交可能重复记录（与 KB-08H 成功清空行为对齐的候选项）。

### KB-08H 接入首页快速记录

- 状态：已完成（2026-08-17，子 agent 实现 + 主 agent 复验与走查）。
- 依赖：KB-08W、KB-04H。
- 必读：`docs/01-design/pages/home.md`、`docs/01-design/design-system.md`、`docs/02-architecture/api-and-events.md`。
- 目标：首页快速记录写入真实 Inbox，成功后清空并提供可感知确认。
- 非目标：展开富文本、自动分类、移动端写入和最近文档。
- 失败恢复：失败保留原输入；离线或请求中禁用重复提交；恢复后允许重试。
- 改动：首页新增桌面条件渲染的快速记录区块（单行输入 + 判别说明 + 提交）；`useMediaQuery` 提升为 shared hook 并迁移 knowledge-destination 与 inbox-page 两处本地副本（第三处使用触发既登记的提升路径）；复用 KB-08W 的 `resolveRecordInput` 判别与 `createInboxItem` 客户端（features 互导经分层门禁确认允许，单向无环）。
- 状态覆盖：空/非法输入禁提交且字段提示；提交中/离线禁用；成功清空 +「已记录到 Inbox」与核对链接，再次输入时确认消失；已知失败保留输入与原因；结果未知提示「打开 Inbox 核对」（同步创建无幂等键，不盲重试）。
- 复用与评审：独立 code-reviewer 评审 `APPROVE`（0 MEDIUM/HIGH），LOW 项「成功后再次输入清除确认」补测试锁定；断点刻度 48rem（home，对齐 md:）与 48.0625em（inbox 既有）边缘差异登记。
- 验证结果：组件测试 5 文件 `54 passed`（含快速记录 9：判别载荷、清空+确认+再次输入清除、失败保留、unknown 核对链接、禁用态、移动端不渲染）；Web typecheck、聚焦 ESLint、Prettier、注释/文件/design-token 门禁与生产构建通过。
- 真实证据：Playwright（Chrome headless，真实 API）4 步通过——首页提交→确认与清空→`/knowledge/inbox` 显示同一记录→删除清理；390px 首页无快速记录输入；截图当次会话人工检查。
- 风险：unknown 结果重试可能重复记录（创建端点无幂等键，根治属后续 API 任务）；提交按钮 secondary 变体（页面唯一主操作保持为新建知识库），产品若需更醒目走查后定夺。

### KB-09 实现 Inbox 幂等转换 API

- 状态：已完成（2026-08-17，子 agent 实现 + 主 agent 复验）。
- 依赖：KB-06、KB-08。
- 必读：`docs/01-design/pages/knowledge-base.md`、`docs/02-architecture/api-and-events.md`、`docs/02-architecture/data-model.md`。
- 目标：实现 `POST /inbox-items/:id/convert`，把记录转换为指定知识库中的普通文档。
- 契约：提交目标知识库、可选父级、标题和 `Idempotency-Key`；重复请求返回同一文档（响应复用 `DocumentDetail`，201）。
- 改动：contracts 扩展 `ConvertInboxItemRequest` 与 `IDEMPOTENCY_CONFLICT`；API 新增转换 DTO、幂等存取（operation `inbox-item.convert`）与单事务编排服务；`DocumentsService.createInTransaction` 公开为模块协作面（`DocumentCreationDraft` 可携带初始正文/纯文本）；`requireIdempotencyKey` 达到第三处使用，抽取至 `http-boundary/idempotency-key.ts` 并让 documents/knowledge-bases 控制器改为引用（净删重复）。
- 设计要点：Inbox 模块经 documents 应用服务协作（不直写 documents 表）；单事务 advisory lock → 幂等重放检查（先于状态检查，已转换记录同键重放原文）→ `FOR UPDATE` 锁本人 pending 记录 → 创建（KB-06 锁序）→ 标记 converted + `converted_document_id` → 存幂等响应；text/url 统一映射为最小合法正文单段落纯文本（URL 只写链接本身，不加 link mark），`plain_text` 与正文同源派生；不同键并发转换同一记录恰一个 201、败者统一 404（不可探测语义优先于引入 409）。
- 复用与评审：独立 code-reviewer 评审 `APPROVE`（0 CRITICAL/HIGH/MEDIUM；事务边界、锁序无环、幂等矩阵、契约闭包经真实运行逐项确认），LOW 项处置——标题 200 字符边界正向断言已补，唯一约束兜底测试范围与已转换记录软删后重放两个边缘场景登记于风险。
- 验证结果：contracts/api typecheck（含 turbo 全量 6 任务）、聚焦 ESLint、Prettier、注释（183 文件 1303 条）、文件限制通过；unit `17+22 passed`；真实 PostgreSQL 全量集成 `14 文件 64 passed`（新 12 例 + documents/inbox/move/boundary 回归）。
- 证据：同键并发恰一份 documents/revisions/idempotency 行；失败场景三表计数为零且 Inbox 保持 pending 内容原样；`replay.text === first.text` 字节级重放（含记录已转换后的重放）；不同键并发 `[201, 404]`。
- 风险：`readStoredDetail` 存储响应读取器现为 move/convert 两份（每 operation 自持惯例，第三处出现时提升共享件）；`inbox-item-conversion.integration.spec.ts` 387/400 行，新增场景需先拆文件；10,000 字符记录生成单个超长 text 节点的渲染性能未测（ED-05 接入真实编辑器时评估）。

### KB-09W 接入 Inbox 转换

- 状态：未开始。
- 依赖：KB-09、KB-08W、KB-06W。
- 必读：`docs/01-design/pages/knowledge-base.md`、`docs/01-design/design-system.md`、`docs/02-architecture/api-and-events.md`。
- 目标：Inbox 可选择知识库与父节点并幂等转换，成功后进入新文档。
- 状态：覆盖目标加载、转换中、失败、重复响应和目标已删除；移动端不渲染处理控件。
- 非目标：批量转换、AI 标题和跨项拖拽。
- 失败恢复：失败保留记录和选择；重试复用原幂等键直到获得确定结果。
- 验收：转换只生成一个文档，Inbox 项消失，刷新目标树可见。
- 验证：Inbox 转换组件测试、Web/API typecheck、生产构建。

## 第四纵向切片：回收站与清理

### KB-10 实现文档子树删除与恢复 API

- 状态：已完成（2026-08-17，子 agent 实现 + 主 agent 复验）。
- 依赖：KB-07。
- 必读：`docs/01-design/pages/knowledge-base.md`、`docs/02-architecture/data-model.md`、`docs/02-architecture/api-and-events.md`。
- 目标：实现 `DELETE /documents/:id`、`POST /documents/:id/restore` 和统一回收站列表。
- 改动：contracts 新增删除/恢复请求、`TrashItem`/`TrashListResponse`、`TRASH_RETENTION_DAYS=30`（API 运行时经动态 import 消费单一事实源）与 `CONFLICT`/`KNOWLEDGE_BASE_DELETED` 错误码；API 新增回收站服务（删除/恢复事务）、幂等件（`document.restore`）、聚合列表服务与 `GET /api/v1/trash`；迁移新增两个回收站部分索引（`owner_id, deleted_at DESC, id DESC`，EXPLAIN 证实回收站列表查询走索引）；http-boundary 扩展冲突码与指引文案。
- 语义决策：删除维持既有 `deleted_parent_id`/`deleted_position` 拷贝列（CHECK 不变量），子树统一标记不区分根/后代，已单独删除的后代不被二次盖戳；恢复整体恢复含先删后代，原父级活跃则原位恢复（KB-06 max+1024 含软删兄弟保证不撞新兄弟），父级缺失落库根末尾并前缀重写后代路径；删除重放按 `version+1` 精确关系（KB 删除后重放统一 404，与 move/rename 一致并补测试锁定）；恢复必须幂等键，重放先于 KB 删除检查；KB 仍删除时恢复文档返回 409 `KNOWLEDGE_BASE_DELETED` 附「先恢复知识库」指引。
- 复用与评审：锁序与 create/move 同构（KB 行优先，无死锁环）；独立 code-reviewer 评审 `APPROVE`（0 CRITICAL/HIGH；子树语义、版本重放窗口、索引论证经独立 EXPLAIN 复核成立），M1（库先删后仍独立的文档投影夹具）与 M2（KB 删除后删除重放 404）用例、L2（索引 `id DESC` 消除增量排序）已按评审补齐并在 dev 库 down/up 重放迁移。
- 验证结果：contracts/api typecheck、聚焦 ESLint、Prettier、注释、文件门禁通过；unit `50 passed`；真实 PostgreSQL 集成 documents `43 passed` + schema/knowledge-bases 回归 `13 passed`（含迁移 down→up 往返与三迁移顺序断言）。
- 证据：三层子树原子删除且原位恢复逐字段相等；孤儿子树落库根 position=2048 且后代路径重写；先删后代随祖先整体恢复；同键并发恢复 verbatim 重放、幂等记录恰 1 条；30 天边界投影 `deleted_at + 30d` 精确到微秒；EXPLAIN 两分支均命中新部分索引。
- 风险：全量集成套件在默认并行模式偶发 schema 串扰（基线同样复现，共享夹具 env 恢复问题登记为工程修复项）；恢复原位与 move 重排的活跃兄弟可能同 position（无唯一约束、id tie-break 兜底，`ponytail:` 接受）；contracts dist 需随源码重建（`pnpm check` 构建环节覆盖）；`document.deleted/restored` Outbox 事件未做（属后续索引刷新任务）。

### KB-10W 接入统一回收站

- 状态：已完成（2026-08-17，子 agent 实现 + 主 agent 复验与走查）。
- 依赖：KB-10、KB-05W、KB-07W。
- 必读：`docs/01-design/pages/knowledge-base.md`、`docs/01-design/design-system.md`、`docs/02-architecture/api-and-events.md`。
- 目标：`/knowledge/trash` 真实展示并恢复知识库或文档子树。
- 改动：新增 trash feature（严格校验客户端、游标列表状态、条目列表与恢复确认对话框、页面）与 `/knowledge/trash` 路由（移动端说明经路由策略注入）；`restoreDocument`/`restoreKnowledgeBase` 落各自资源域客户端并补错误码闭集；知识库页头固定回收站次级入口与面包屑标签。
- 设计要点：恢复确认以普通 Dialog 呈现（对象与影响说明如实——知识库恢复不动已删文档条目、文档恢复连带完整子树）；幂等键随对话框开启生成、失败重试复用、确定结果或取消丢弃；恢复成功以不带游标的服务端重读收尾；前置引导双路径（已加载页内匹配未恢复知识库时以「先恢复其知识库“X”」替代按钮 + 409 服务端消息兜底并重读）；purgeScheduledAt 用绝对时间（30 天跨度下相对天数会漂移）。
- 复用与评审：镜像 inbox 页面范式（PageShell/EmptyState/LoadFailure/OfflineNotice/format-datetime/useMediaQuery/useOnline）；独立 code-reviewer 评审 `REQUEST_CHANGES`（0 CRITICAL/HIGH），两项 MEDIUM 已修——裸 `CONFLICT` 纳入重读对账（消除跨标签页恢复后的对话框死锁，含回归测试）、分页失败保留/取消重开换新键/回收站入口三个测试缺口补齐；LOW 项处置：恢复成功重读回第一页与版本冲突后旧版本重试自愈路径登记风险，`parseDocumentDetail` 导出归属同批 KB-09W 提交。
- 验证结果：组件测试 3 文件 `19 passed`（混合条目渲染、游标分页与失败保留、库恢复联动清文档条目、前置引导、409 兜底、幂等键复用/取消重开换键、裸冲突重读关框、空态、离线禁用、移动端只读、知识库页回收站入口）；Web typecheck、聚焦 ESLint、Prettier、注释（213 文件 1685 条）、文件限制与生产构建通过。
- 真实证据：Playwright（Chrome headless，真实 API）——回收站渲染真实条目（类型徽标/删除时间/永久删除时间/30 天文案）；恢复已删知识库「走查并发编辑」后条目消失且回到知识库列表规定位置；390px 无恢复控件；截图当次会话人工检查。
- 风险：unknown 结果对账只读第一页（第 2 页条目误判为已恢复后需重翻页发现，登记为对账定向校验升级项）；版本冲突重试持旧版本至取消重开（自愈，重读刷新版本基线为升级项）；恢复成功但重读失败时底部重试走分页语义（`items.length` 分流根因，与 unknown 对账同族，登记为重读状态标记升级项）。

### KB-11 实现 30 天到期清理服务

- 状态：已完成（2026-08-17，子 agent 实现 + 主 agent 复验）。
- 依赖：KB-05、KB-10。
- 必读：`docs/02-architecture/data-model.md`、`docs/02-architecture/system.md`、`docs/03-engineering/quality-gates.md`。
- 目标：实现可由 Worker 调用的批量永久清理服务，并返回结构化统计。
- 改动：`TrashPurgeService.purgeExpired(now)`（时间注入、每批独立事务、`PURGE_BATCH_SIZE=100` 按 `deleted_at ASC, id ASC` 最旧优先）与闭合统计 `{ purgedDocuments, purgedKnowledgeBases, purgedInboxItems }`；模块导出供 KB-12 Worker 接线；测试支撑新增 `resolveService` 与夹具清理顺序（inbox FK NO ACTION 先于 documents）。
- 清理口径：到期谓词与 KB-10 `purgeScheduledAt` 投影逐字一致（恰好 30 天即清、+1ms 保留）；清理单元=回收站条目根 + path 前缀完整子树（子树一行不留，级联清 revisions）；隐藏到期后代不提前清，随覆盖父条目到期整树清；知识库到期且无任何文档行（任意状态）才清；引用被清文档的 converted Inbox 行同事务先删（FK NO ACTION）并计数。
- 并发声明：两阶段 SELECT `FOR UPDATE` 锁根/库行——与恢复事务在根行上串行化（恢复先提交则 EPQ 排除、清理先删则恢复 404），两相独立事务与既有锁序无环。
- 复用与评审：`TRASH_RETENTION_DAYS` 运行时动态 import 复用 contracts 单一事实源，零 contracts 改动；独立 code-reviewer 评审 `APPROVE`（0 CRITICAL/HIGH；到期谓词、子树谓词尾斜杠防碰撞、锁序无环、批次失败注入方法论均经读 SQL 与实跑复核），M1/M2 文档项已处置（KB-10 证据措辞修正为「列表查询走索引」，KB-11 全局清理扫描为 Seq Scan 设计决策）。
- 验证结果：聚焦集成 `8 passed`（边界、子树+级联+Inbox、隐藏后代两阶段、KB 条件三态、幂等重跑、101 根跨批、触发器注入批失败后重跑、已恢复对象不受影响）；回归 trash/documents/knowledge-bases/inbox 合计 `81 passed`；API/Worker typecheck、聚焦 ESLint、Prettier、注释（206 文件 1603 条）、文件限制通过。
- 证据：恰 `now-30d` 即清、`+1ms` 保留；两阶段隐藏后代（首跑 0、+25 天 2）；批 1 提交批 2 回滚后重试从剩余对象补齐；同时间二次运行全零统计。
- 风险：全局清理扫描为 Seq Scan + Sort（EXPLAIN 实测；owner 前导部分索引不适用于跨 owner 扫描，当前规模夜间一次可忽略）——升级触发条件：documents 行数或批次耗时实测不可接受时评审 `(deleted_at, id)` 部分索引并将谓词改写为 sargable；converted Inbox 行随目标文档硬删（幂等记录仍留转换响应可查），产品要求保留历史时需改 FK 并经批准迁移；并发清理与恢复由行锁串行化但无确定性并发编排测试（生产加固阶段补压测）；KB-12 接线时须写明单调度器假设（双实例并发安全但浪费）。

### KB-12 接入 Worker 清理调度

- 状态：未开始。
- 依赖：KB-11。
- 必读：`docs/02-architecture/system.md`、`docs/03-engineering/research-and-dependencies.md`、`docs/03-engineering/development.md`。
- 目标：Worker 每日触发到期清理并记录结构化结果。
- 实施：开始前单独批准 BullMQ；使用 Job Scheduler 与固定 key，不使用 repeatable jobs。
- 非目标：Workflow Runtime、管理 UI 和手动触发 API。
- 失败恢复：队列重试调用幂等服务；Redis 丢失后可重新注册。
- 验收：重复注册只有一个调度；失败可重试；业务事实只存 PostgreSQL。
- 验证：Scheduler 单元测试、Worker 聚焦测试、Worker typecheck。

## 局部依赖图与领取顺序

```text
KB-03 → KB-04C → KB-04 → KB-04W → KB-04H
                      └→ KB-05 → KB-05W → KB-06 → KB-06W → KB-07 → KB-07W
KB-03 → KB-08 → KB-08W → KB-08H
KB-06 + KB-08 ─────────→ KB-09
KB-09 + KB-08W + KB-06W → KB-09W
KB-07 ─────────────────→ KB-10
KB-10 + KB-05W + KB-07W → KB-10W
KB-05 + KB-10 ─────────→ KB-11 → KB-12
```

按本文出现顺序领取首个依赖已完成的任务；即使后方分支技术上可执行，也不得跳过当前纵向闭环。`KB-09` 同时依赖 `KB-06` 与 `KB-08`，`KB-09W` 同时依赖 `KB-09`、`KB-08W` 与 `KB-06W`；`KB-10W` 同时依赖 `KB-10`、`KB-05W` 与 `KB-07W`。图中的合并边以任务正文为准，不得按视觉近邻省略依赖。

## 里程碑检查点

- 数据库：up/down、复合约束、树移动、Inbox 幂等和 30 天清理聚焦集成测试通过。
- API/UI：相关 typecheck、单元/组件测试、ESLint、Prettier、文件限制和生产构建通过。
- 前期不执行 Playwright、全量覆盖率和复杂性能测试；这些在生产加固阶段恢复。
- 检查数据库与 API 不存在知识库嵌套入口、客户端 `ownerId`、自由文本状态或未批准依赖。
- 检查生产 Web 不导入测试 fixture，不手写服务端 DTO 副本，不在请求失败时合成成功对象。
- 每个任务完成后追加真实命令、结果、证据与剩余风险，并单独提交；不得顺手推进下一任务。
