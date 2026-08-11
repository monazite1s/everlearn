# 里程碑 02：知识库模型与 API

完成后可通过 API 和页面创建多个知识库、管理文档树、Inbox 与回收站；不实现正文编辑器、搜索、标签和内部链接。

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

- 状态：未开始。
- 依赖：KB-00。
- 必读：`docs/03-engineering/research-and-dependencies.md`、`docs/03-engineering/development.md`、`docs/02-architecture/system.md`。
- 目标：API 可注入类型安全数据库连接，并可显式执行 up/down migration。
- 接口与状态：读取 `DATABASE_URL`；暴露单一数据库 Provider；应用关闭时等待连接池释放。
- 实施：迁移不随应用启动自动执行；迁移锁和执行记录交给 Kysely；名称使用 UTC 数字序号与下划线。
- 非目标：业务表、Repository、读写分离或连接代理。
- 失败恢复：连接和迁移失败必须返回非零退出码；down 只供本地恢复验证。
- 验收：空数据库 up、重复 up、down 后再次 up 均成功；缺失连接串启动失败。
- 验证：数据库模块单元测试、迁移集成测试、API typecheck。

### KB-02 建立 Identity 与 Knowledge Schema

- 状态：未开始。
- 依赖：KB-01。
- 必读：`docs/02-architecture/data-model.md`、`docs/00-product/product-spec.md`、`docs/02-architecture/system.md`。
- 目标：创建 User、KnowledgeBase、Document、DocumentRevision、InboxItem 和 IdempotencyRecord，并写入固定本地用户。
- 数据约束：UUID、UTC 时间、`ownerId`、`version >= 1`、受控 kind/status；知识库没有父级字段；文档父级必须与文档同所有者、同知识库。
- 实施：文档正文保存最小合法 ProseMirror JSON、`schemaVersion` 和文本投影；树路径使用服务端维护的 UUID 文本段。
- 非目标：Tag、DocumentLink、Attachment、认证、分享、全文或向量索引。
- 失败恢复：迁移提供 down；种子使用固定 UUID 和冲突忽略，允许重复执行。
- 验收：数据库拒绝跨所有者/跨知识库父子关系和非法状态；本地用户种子唯一。
- 验证：迁移恢复测试、PostgreSQL 约束集成测试、文件限制。

### KB-03 建立 HTTP 公共边界与本地身份

- 状态：未开始。
- 依赖：KB-02。
- 必读：`docs/02-architecture/api-and-events.md`、`docs/03-engineering/development.md`、`docs/00-product/product-spec.md`。
- 目标：所有 Knowledge API 共享输入校验、错误信封、requestId 和服务端本地用户上下文。
- 契约：错误固定为 `code/message/requestId/details?`；DTO 使用 `class-validator`；客户端请求不得包含 `ownerId`。
- 实施：全局 ValidationPipe 开启白名单、拒绝未知字段和转换；全局异常过滤器隐藏内部错误。
- 非目标：登录、授权角色、速率限制和 Web 代理。
- 失败恢复：未知错误只向客户端返回稳定 500 code，服务端保留结构化日志和 requestId。
- 验收：非法 UUID、未知字段、其他所有者对象与内部异常均产生规定响应。
- 验证：API 单元/集成测试、API typecheck、ESLint。

## KnowledgeBase 与 Document

### KB-04 实现知识库创建与列表

- 状态：未开始。
- 依赖：KB-03。
- 必读：`docs/02-architecture/api-and-events.md`、`docs/02-architecture/data-model.md`、`docs/01-design/pages/knowledge-base.md`。
- 目标：实现 `POST/GET /api/v1/knowledge-bases`，固定用户可创建并游标读取自己的知识库。
- 契约：游标由 `updatedAt + id` 组成并保持不透明；limit 默认 20、最大 100；普通接口只能创建 `normal`。
- 非目标：详情更新、删除、页面和系统知识库创建入口。
- 失败恢复：重复名称允许；无效游标返回标准校验错误；写入失败不返回临时对象。
- 验收：稳定分页无重复遗漏；列表不包含软删除数据；所有权由服务端写入。
- 验证：Controller 契约测试、PostgreSQL 集成测试、API typecheck。

### KB-05 实现知识库详情、更新、删除与恢复

- 状态：未开始。
- 依赖：KB-04。
- 必读：`docs/02-architecture/api-and-events.md`、`docs/02-architecture/data-model.md`、`docs/01-design/pages/knowledge-base.md`。
- 目标：实现 `GET/PATCH/DELETE /knowledge-bases/:id` 及 `POST /knowledge-bases/:id/restore`。
- 契约：更新、删除和恢复提交 `expectedVersion`；成功后版本加一；不可探测其他所有者对象。
- 非目标：永久删除和文档级恢复。
- 失败恢复：版本冲突不写入；重复删除/恢复返回当前稳定状态或规定冲突，不产生第二次副作用。
- 验收：软删除库及其文档不出现在正常查询；恢复后树结构仍保留。
- 验证：领域状态测试、Controller 契约测试、PostgreSQL 集成测试。

### KB-06 实现文档读取、创建与重命名

- 状态：未开始。
- 依赖：KB-05。
- 必读：`docs/02-architecture/data-model.md`、`docs/02-architecture/api-and-events.md`、`docs/01-design/pages/knowledge-base.md`。
- 目标：实现按父节点分页查询、创建根/子文档、读取详情和按版本重命名。
- 契约：`GET/POST /knowledge-bases/:id/documents`、`GET/PATCH /documents/:id`；创建时只接受目标父级和标题。
- 实施：服务端分配 path、position、最小正文和初始修订；查询只返回直接子节点。
- 非目标：正文编辑、拖拽移动、标签、链接和全树一次返回。
- 失败恢复：父节点无效或已删除时事务回滚；版本冲突不改标题。
- 验收：根与子文档顺序稳定；跨知识库父级被拒绝；大树查询不全量加载。
- 验证：领域单元测试、Repository 集成测试、API 契约测试。

### KB-07 实现原子文档树移动

- 状态：未开始。
- 依赖：KB-06。
- 必读：`docs/02-architecture/data-model.md`、`docs/02-architecture/api-and-events.md`、`docs/03-engineering/quality-gates.md`。
- 目标：实现 `POST /documents/:id/move`，原子更新父级、位置、版本和全部后代路径。
- 契约：提交 `targetParentId?`、相邻位置、`expectedVersion` 和幂等键。
- 实施：事务锁定移动节点和受影响兄弟集合；拒绝跨库、跨所有者、自身及后代目标；仅在必要时重排当前兄弟集合。
- 非目标：拖拽 UI、跨知识库移动和协作冲突合并。
- 失败恢复：任一校验或批量更新失败时完整回滚；幂等重试返回同一结果。
- 验收：所有后代 path 正确；并发版本冲突不部分提交；直接子节点顺序稳定。
- 验证：树领域单元测试、事务与并发集成测试、API typecheck。

## Inbox 与回收站

### KB-08 实现 Inbox 记录与列表

- 状态：未开始。
- 依赖：KB-03。
- 必读：`docs/01-design/pages/knowledge-base.md`、`docs/02-architecture/api-and-events.md`、`docs/02-architecture/data-model.md`。
- 目标：实现 `POST/GET /inbox-items` 与 `DELETE /inbox-items/:id`。
- 契约：输入只能是非空纯文本或一个 `http/https` URL；列表使用游标分页。
- 非目标：网页抓取、AI 总结、首页 UI 和文档转换。
- 失败恢复：非法 URL 和混合载荷快速失败；删除失败保留原记录。
- 验收：无需先选知识库即可记录；其他所有者记录不可探测；已转换记录不在未处理列表。
- 验证：DTO 测试、Repository 集成测试、Controller 契约测试。

### KB-09 实现 Inbox 幂等转换

- 状态：未开始。
- 依赖：KB-06、KB-08。
- 必读：`docs/01-design/pages/knowledge-base.md`、`docs/02-architecture/api-and-events.md`、`docs/02-architecture/data-model.md`。
- 目标：实现 `POST /inbox-items/:id/convert`，将记录转换为指定知识库中的普通文档。
- 契约：提交目标父级、标题、幂等键；重复请求返回同一文档。
- 实施：单事务创建文档、初始修订、幂等结果并标记 Inbox；URL 内容只写链接，不抓取正文。
- 非目标：自动分类、摘要、附件和批量转换。
- 失败恢复：转换失败保持 Inbox 未处理；事务提交后响应丢失可凭幂等键恢复结果。
- 验收：同一键只创建一个文档；不同键不能重复转换同一 Inbox；失败不丢原内容。
- 验证：事务集成测试、唯一约束测试、Controller 契约测试。

### KB-10 实现文档回收站删除与恢复

- 状态：未开始。
- 依赖：KB-07。
- 必读：`docs/01-design/pages/knowledge-base.md`、`docs/02-architecture/data-model.md`、`docs/02-architecture/api-and-events.md`。
- 目标：扩展 `DELETE /documents/:id` 与 `POST /documents/:id/restore`，完整处理文档子树。
- 实施：删除保存原父级和位置；恢复整个子树；原父级缺失时恢复到知识库根部。
- 非目标：永久清理、附件物理删除和知识库恢复。
- 失败恢复：知识库仍删除时拒绝单独恢复文档；部分恢复失败必须回滚。
- 验收：子树完整删除/恢复；恢复不会覆盖现有兄弟位置；重复请求保持稳定。
- 验证：时间可控的 PostgreSQL 集成测试、状态机单元测试。

### KB-11 实现到期清理服务

- 状态：未开始。
- 依赖：KB-05、KB-10。
- 必读：`docs/02-architecture/data-model.md`、`docs/02-architecture/system.md`、`docs/03-engineering/quality-gates.md`。
- 目标：实现可由 Worker 调用的 30 天到期永久清理服务，并返回结构化统计。
- 实施：先清理到期文档子树，再清理无剩余文档的知识库；批次有上限；时间由调用方注入。
- 非目标：BullMQ 调度、附件对象清理和手动立即永久删除。
- 失败恢复：每批独立事务；失败可从未删除对象重试，不影响未到期对象。
- 验收：边界时间准确；重复运行结果稳定；未到期和已恢复对象不受影响。
- 验证：时间控制集成测试、幂等测试、Worker/API typecheck。

### KB-12 接入 Worker 清理调度

- 状态：未开始。
- 依赖：KB-11。
- 必读：`docs/02-architecture/system.md`、`docs/03-engineering/research-and-dependencies.md`、`docs/03-engineering/development.md`。
- 目标：由 Worker 每日触发到期清理并记录结构化结果。
- 实施：开始前单独批准 BullMQ 依赖；使用 Job Scheduler 和固定 scheduler key，不使用 repeatable jobs。
- 非目标：通用 Workflow Runtime、管理 UI 和手动触发 API。
- 失败恢复：队列重试调用幂等清理服务；Redis 丢失后可重新创建调度器。
- 验收：重复注册只有一个调度；执行失败可重试；业务事实只存 PostgreSQL。
- 验证：Scheduler 单元测试、Worker 聚焦测试、Worker typecheck。

## 页面接入

### KB-13 接入知识库列表、概览与文档树

- 状态：未开始。
- 依赖：KB-05、KB-07。
- 必读：`docs/01-design/pages/knowledge-base.md`、`docs/01-design/layout-and-navigation.md`、`docs/01-design/design-system.md`。
- 目标：接入 `/knowledge` 与 `/knowledge/:knowledgeBaseId` 的真实列表、概览和文档树。
- 实施：数据容器与表现组件分离；局部加载/错误/空状态；桌面端创建和移动，移动端不渲染修改控件；乐观移动失败回滚。
- 非目标：正文编辑器、搜索、标签和全局客户端状态库。
- 失败恢复：请求失败只影响对应区域；树移动失败恢复原快照并显示可行动错误。
- 验收：可创建并进入知识库、创建嵌套文档、刷新保持树结构；键盘可完成非拖拽移动入口。
- 验证：Knowledge 组件测试、Web typecheck、ESLint、生产构建。

### KB-14 接入 Inbox、回收站与首页

- 状态：未开始。
- 依赖：KB-09、KB-10、KB-13。
- 必读：`docs/01-design/pages/home.md`、`docs/01-design/pages/knowledge-base.md`、`docs/01-design/layout-and-navigation.md`。
- 目标：接入 `/knowledge/inbox`、`/knowledge/trash` 和首页快速记录/最近文档。
- 实施：首页 section 独立请求和局部重试；快速记录提交后清空并确认；恢复与转换显示明确结果；移动端只读且不渲染处理控件。
- 非目标：E2E、离线写入、资讯 Inbox 和编辑器。
- 失败恢复：提交失败保留输入；转换失败保留 Inbox；恢复失败保留回收站项目。
- 验收：快速记录、幂等转换、删除和恢复形成可用闭环；首页不再依赖生产静态 fixture。
- 验证：Home/Knowledge 组件测试、Web typecheck、ESLint、生产构建。

## 里程碑检查点

- 数据库：up/down、复合约束、树移动、Inbox 幂等和 30 天清理聚焦集成测试通过。
- API/UI：相关 typecheck、单元/组件测试、ESLint、Prettier、文件限制和生产构建通过。
- 前期不执行 Playwright、全量覆盖率和复杂性能测试；这些在生产加固阶段恢复。
- 检查数据库与 API 不存在知识库嵌套入口、客户端 `ownerId`、自由文本状态或未批准依赖。
- 每个任务完成后追加真实命令、结果、证据与剩余风险，并单独提交；不得顺手推进下一任务。
