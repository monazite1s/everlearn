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

- 状态：未开始。
- 依赖：KB-06。
- 必读：`docs/02-architecture/data-model.md`、`docs/02-architecture/api-and-events.md`、`docs/03-engineering/quality-gates.md`。
- 目标：实现 `POST /documents/:id/move`，原子更新父级、位置、版本和全部后代路径。
- 契约：提交 `targetParentId?`、相邻位置、`version` 和 `Idempotency-Key`。
- 实施：事务锁定移动节点与受影响兄弟；拒绝跨库、跨所有者、自身和后代目标。
- 非目标：跨知识库移动、UI 和协作冲突合并。
- 失败恢复：任一更新失败完整回滚；相同幂等键返回同一结果。
- 验收：后代 path 正确；版本冲突不部分提交；直接子节点顺序稳定。
- 验证：树规则单元测试、事务/并发集成测试、API typecheck。

### KB-07W 接入文档树移动交互

- 状态：未开始。
- 依赖：KB-07、KB-06W。
- 必读：`docs/01-design/pages/knowledge-base.md`、`docs/01-design/layout-and-navigation.md`、`docs/01-design/design-system.md`。
- 目标：桌面文档树支持拖拽和键盘菜单移动同一 API 行为。
- 实施：优先复用维护中的树拖拽能力；乐观快照只覆盖受影响节点；键盘入口支持选择父级和相邻位置。
- 非目标：跨知识库移动、移动端修改和通用拖拽框架。
- 失败恢复：冲突或请求失败恢复原快照并显示可行动错误；重复响应不得再次移动。
- 验收：拖拽与键盘结果一致；非法后代目标不可选择；刷新保持顺序。
- 验证：树移动组件测试、Web typecheck、生产构建和键盘/移动端走查。

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

- 状态：未开始。
- 依赖：KB-08、KB-04W。
- 必读：`docs/01-design/pages/knowledge-base.md`、`docs/01-design/design-system.md`、`docs/02-architecture/api-and-events.md`。
- 目标：让 `/knowledge/inbox` 使用真实 API 创建、分页查看和删除待处理记录。
- 状态：覆盖首次使用、加载、分页、字段错误、提交失败和删除失败；失败保留输入或记录。
- 非目标：转换、抓取、AI、首页和移动端处理。
- 失败恢复：重新读取服务端事实；不以乐观删除隐藏失败记录。
- 验收：文本和 URL 可记录，非法载荷有字段提示；刷新后数据存在；移动端只读。
- 验证：Inbox 组件测试、Web/API typecheck、生产构建和真实页面走查。

### KB-08H 接入首页快速记录

- 状态：未开始。
- 依赖：KB-08W、KB-04H。
- 必读：`docs/01-design/pages/home.md`、`docs/01-design/design-system.md`、`docs/02-architecture/api-and-events.md`。
- 目标：首页快速记录写入真实 Inbox，成功后清空并提供可感知确认。
- 非目标：展开富文本、自动分类、移动端写入和最近文档。
- 失败恢复：失败保留原输入；离线或请求中禁用重复提交；恢复后允许重试。
- 验收：首页提交后可在 `/knowledge/inbox` 看到同一记录；移动端不渲染输入。
- 验证：首页组件测试、Web typecheck、生产构建和桌面/移动走查。

### KB-09 实现 Inbox 幂等转换 API

- 状态：未开始。
- 依赖：KB-06、KB-08。
- 必读：`docs/01-design/pages/knowledge-base.md`、`docs/02-architecture/api-and-events.md`、`docs/02-architecture/data-model.md`。
- 目标：实现 `POST /inbox-items/:id/convert`，把记录转换为指定知识库中的普通文档。
- 契约：提交目标父级、标题和 `Idempotency-Key`；重复请求返回同一文档。
- 实施：单事务创建文档/初始修订/幂等结果并标记 Inbox；URL 只写链接。
- 非目标：自动分类、摘要、附件和批量转换。
- 失败恢复：失败保持待处理；响应丢失可凭幂等键恢复结果。
- 验收：同一键只创建一个文档；不同键不能重复转换同一记录；失败不丢内容。
- 验证：事务集成测试、唯一约束测试、Controller 契约测试。

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

- 状态：未开始。
- 依赖：KB-07。
- 必读：`docs/01-design/pages/knowledge-base.md`、`docs/02-architecture/data-model.md`、`docs/02-architecture/api-and-events.md`。
- 目标：实现 `DELETE /documents/:id`、`POST /documents/:id/restore` 和统一回收站列表。
- 实施：删除保存原父级和位置；恢复完整子树；原父级缺失时恢复到知识库根部。
- 非目标：永久清理、附件物理删除和页面。
- 失败恢复：知识库仍删除时拒绝单独恢复文档；部分恢复失败完整回滚。
- 验收：列表同时投影已删除知识库/文档；子树完整恢复；重复请求稳定。
- 验证：时间可控 PostgreSQL 集成测试、状态机测试、Controller 契约测试。

### KB-10W 接入统一回收站

- 状态：未开始。
- 依赖：KB-10、KB-05W、KB-07W。
- 必读：`docs/01-design/pages/knowledge-base.md`、`docs/01-design/design-system.md`、`docs/02-architecture/api-and-events.md`。
- 目标：`/knowledge/trash` 真实展示并恢复知识库或文档子树。
- 状态：覆盖空、加载、分页、恢复中、知识库前置恢复、冲突和失败；显示永久删除时间。
- 非目标：立即永久删除、批量恢复和移动端处理。
- 失败恢复：失败对象留在列表；父知识库已删除时引导先恢复，不静默改目标。
- 验收：恢复后对象从回收站消失并回到规定位置；移动端只读。
- 验证：Trash 组件测试、Web/API typecheck、生产构建和真实页面走查。

### KB-11 实现 30 天到期清理服务

- 状态：未开始。
- 依赖：KB-05、KB-10。
- 必读：`docs/02-architecture/data-model.md`、`docs/02-architecture/system.md`、`docs/03-engineering/quality-gates.md`。
- 目标：实现可由 Worker 调用的批量永久清理服务，并返回结构化统计。
- 实施：先清理到期文档子树，再清理无剩余文档的知识库；批次有上限，时间由调用方注入。
- 非目标：调度、附件对象清理和手动立即永久删除。
- 失败恢复：每批独立事务；失败从未删除对象重试，不影响未到期对象。
- 验收：30 天边界准确；重复运行稳定；已恢复对象不受影响。
- 验证：时间控制集成测试、幂等测试、Worker/API typecheck。

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
