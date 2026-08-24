# 里程碑 04：搜索与知识连接

完成后用户可跨知识库检索到 Block、使用标签和双向链接，并以 Markdown 交换内容。

## SEARCH-01 建立文本投影与全文索引

- 授权门禁：用户于 2026-08-24 批准非破坏性数据库迁移、PostgreSQL `pg_trgm` 与开发依赖 `kysely-codegen`。`kysely-codegen` 用于消除当前手写数据库类型与 PostgreSQL Skill“迁移后生成类型”门禁的冲突，不属于产品运行时依赖；迁移 down 只在隔离测试 Schema 验证，不对实际业务库执行。
- 依赖：ED-02、FND-09。
- 必读：`docs/02-architecture/data-model.md`、`docs/02-architecture/ai-workflow-runtime.md`、`docs/02-architecture/system.md`。
- 目标：消费 `document.saved`，从服务端已验证正文生成 `SearchBlock`，建立 PostgreSQL FTS 索引；`plainText` 继续由 Knowledge 保存事务同步派生。
- 生产者：正文 PATCH、Revision restore、Inbox 转换及任何写入非空初始正文的创建路径都必须与业务写入同事务追加 `document.saved`；文档子树删除/恢复追加对应生命周期事件。迁移后的既有文档由初始扫描覆盖，不能等待下一次编辑。
- 实施：按 Block ID、文档版本和内容哈希幂等更新。乱序旧事件只做成功空操作；删除后迟到的保存事件不得恢复可见性；恢复按数据库当前正文重建。查询必须联结有效 Document 与 KnowledgeBase，不能依赖异步可见标记防止泄漏。
- 恢复：暂时失败事件按有限指数退避保持待处理；达到上限或遇到未知事件类型/Schema 时隔离并记录安全错误码，不得阻塞后续事件，部署兼容消费者后由人工重放。Worker 启动时执行一次补偿扫描，并由固定 BullMQ 周期任务持续扫描；扫描以数据库当前正文为准，修复缺失、过期和多余块。Redis 状态丢失后，Worker 重启从 PostgreSQL Outbox 与扫描恢复。
- 语言边界：拉丁文本使用显式 `pg_catalog.simple` FTS 与 GIN；连续中文使用 PostgreSQL 官方 `pg_trgm` GIN 补足自然子串命中，不得以整句精确匹配冒充中文检索完成。
- 施工切片：在同一 SEARCH-01 内依次完成“Outbox 接线”“投影与扫描恢复”“真实 PostgreSQL 验证”，每段独立取证；该任务跨 Knowledge、Search、Worker 与数据库事务边界，不能拆成会长期留下无消费者事件或无生产者投影的独立任务。
- 非目标：搜索 HTTP/UI、Embedding、向量召回、标签、内部链接 UI 与 AI 问答。
- 验收：Worker 成功排空事件后保存内容可检索；v3 先于 v2 消费时只保留 v3；投影提交后重复消费无重复块；强制投影失败时 Outbox 保持待处理且重试后成功；删除后迟到保存不重新暴露，恢复后重新可见；知识库删除后其文档不进入候选；启动与周期扫描可修复既有、缺失、过期和多余块；清空 Redis 并重启 Worker 后重新收敛；不同所有者隔离；中文正文“分布式系统中的幂等设计”查询“幂等”命中，英文正文“transactional outbox”查询“outbox”命中。
- 验证：投影单元测试、Outbox/Worker/PostgreSQL 集成测试、迁移 up/down/up 与约束测试、代表查询 `EXPLAIN` 计划记录；小夹具允许 PostgreSQL 合理选择顺序扫描，不以强制命中 GIN 代替结果和索引定义验证。

### SEARCH-01 完成证据（2026-08-25）

- 状态：完成；产品、代码与安全独立复核均通过。
- TDD：先取得契约导出、迁移表、Outbox 生产者、Block parser、投影服务、同版本多余块、严格事件载荷、扫描公平性、外部明文内部地址和终态启动作业的聚焦失败，再分别完成最小实现；未删除失败测试。
- 真实环境：本地 PostgreSQL 已增量应用 `20260824000000_search_projection`，确认 `pg_trgm 1.6`、三张投影相关表和预期约束/索引；隔离 Schema 的 up/down/up、失败回滚、约束与级联测试通过。实际业务库未执行 down。
- 功能测试：加载本地测试环境后，5 个单元测试文件共 20 项通过；9 个真实 PostgreSQL/Redis 集成测试文件共 31 项通过。覆盖 Outbox 原子回滚、全部正文生产路径、事件乱序与重放、失败重试和隔离、缺失/过期/多余块、101 个文档扫描公平性、所有者与 KnowledgeBase 生命周期隔离，以及清空本地测试 Redis、重启 Worker 后由内部 API 和 PostgreSQL 扫描恢复投影。
- 代表查询：连续中文“分布式系统中的幂等设计”以参数化 trigram 查询“幂等”命中；英文“transactional outbox”以 `plainto_tsquery('pg_catalog.simple', 'outbox')` 命中。小夹具 `EXPLAIN` 使用所有者/文档唯一索引并联结有效 Document 与 KnowledgeBase；因数据量小未选择 GIN，符合本任务口径，迁移测试另行确认两个 GIN 索引存在。
- 静态验证：`check:file-size`、`check:structure`、`lint:comments`、ESLint、Prettier 和 `git diff --check` 通过；Contracts、API、Worker 类型检查通过；API、Worker 构建通过。全仓 `pnpm typecheck` 仅被任务外、未纳入提交的 `apps/web/next-env.d.ts` 与两个 `.next` 路由类型同时存在所阻断。
- 设计模式：`appendDocumentSearchEvent` 使用 Transactional Outbox，把正文写入与待处理事件放在同一 PostgreSQL 事务；代价是 Outbox 表、重试与补偿扫描，移除条件是未来由具备同等原子提交保证的基础设施替代，详见 ADR 004。
- Skill 影响：PostgreSQL 门禁促成真实迁移验证、生成数据库类型和查询索引取证；架构门禁固定 Knowledge 单一写者、Search 单一投影写者及内部 HTTP 边界；复用门禁选择既有 Nest/BullMQ/内部密钥链路，仅新增获批的开发期类型生成器与 PostgreSQL 官方扩展。
- 独立复核处置：产品复核提出的固定中英文查询、Redis 重启、精确扫描差异、KnowledgeBase/所有者隔离、可见文档成功重放和证据缺口均已补测；安全复核的测试专属 Redis 队列、Search 客户端非本机 HTTP 与重定向密钥限制、必填事件载荷和 KnowledgeBase 软删除回归均已处置；代码复核的未知可选事件字段兼容、全局 Worker 配置兼容、非法文档扫描饥饿、数据库时钟和终态启动作业问题均已修复并增加回归。
- 风险：`PURGE_TRIGGER_SECRET` 暂时复用于多个内部维护端点，后续统一内部凭据时应改为通用命名并提供部署兼容；永久非法的旧正文会被安全跳过并记录错误码，需在内容修复或导入迁移后重建；进程内扫描游标在 API 重启后归零，频繁重启且前 100 项持续非法时会延迟后续文档，若生产观测出现该模式则持久化检查点；down 保留可能被其他对象共享的 `pg_trgm` 扩展；仓库既有依赖审计高风险项不在本任务新增依赖路径内，需另任务处理。

## SEARCH-02 实现全局搜索 API 与页面

- 依赖：SEARCH-01、KB-06。
- 必读：`docs/01-design/pages/knowledge-base.md`、`docs/02-architecture/api-and-events.md`、`docs/01-design/layout-and-navigation.md`。
- 目标：实现跨全部知识库搜索、当前库范围和标题/正文/标签/更新时间筛选。
- 实施：游标分页；结果包含文档路径、Block ID 和安全高亮片段；顶部搜索与快捷键打开结果层。
- 非目标：语义搜索和 AI 回答。
- 验收：结果只含可访问内容；点击定位匹配 Block；空、加载和索引中状态明确。
- 验证：搜索集成测试、Playwright 筛选与定位。

## SEARCH-03 实现标签

- 依赖：KB-01、SEARCH-02。
- 必读：`docs/02-architecture/data-model.md`、`docs/01-design/pages/editor.md`。
- 目标：实现标签创建、规范化去重、文档关联和搜索筛选。
- 实施：标签按所有者唯一；编辑器属性侧栏支持添加/移除；删除标签不删除文档。
- 非目标：层级标签、标签权限和自动 AI 打标。
- 验收：大小写/空白规范化后不重复；跨用户不可复用；筛选结果正确。
- 验证：领域测试、API 集成、编辑器组件测试。

## SEARCH-04 实现内部链接与反向链接

- 依赖：ED-01、SEARCH-01。
- 必读：`docs/01-design/pages/editor.md`、`docs/02-architecture/data-model.md`、`docs/02-architecture/api-and-events.md`。
- 目标：通过标题搜索插入内部链接，并由内容投影维护反向链接。
- 实施：链接记录来源 Block；目标删除保留失效状态；右栏分页展示反向引用。
- 非目标：知识图谱和跨账号公共链接。
- 验收：保存后目标显示来源；移除链接后反向记录消失；失效链接不崩溃。
- 验证：链接解析单元、投影集成、Playwright 双向跳转。

## SEARCH-05 实现 Markdown 导入导出

- 依赖：ED-01、ED-04、KB-03。
- 必读：`docs/00-product/product-spec.md`、`docs/02-architecture/api-and-events.md`、`docs/02-architecture/data-model.md`。
- 目标：支持单 Markdown、附件 ZIP 导入，以及知识库/文档子树 Markdown ZIP 导出。
- 实施：异步运行；清理不可信 HTML/URL；映射 Block ID、内部链接和附件；导入失败不留下半棵树。
- 非目标：Notion/语雀专用迁移和 DOCX/PDF。
- 验收：导出再导入保持树、正文和可访问附件；冲突 ID 重建；失败事务可清理。
- 验证：转换 round-trip、恶意输入安全测试、Worker 集成和 E2E。

## 检查点

执行搜索/投影/导入集成、双向链接和 Markdown E2E、`pnpm check`；抽样核对结果高亮不产生 XSS。
