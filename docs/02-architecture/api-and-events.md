# API 与事件契约

## 传输约定

- API 前缀 `/api/v1`；资源名使用复数名词，行为仅用于无法表示为资源状态转换的端点。
- 浏览器只请求当前 Web Origin 下的 `/api/v1/*`；Next 使用透明 rewrite 转发到服务端 `API_INTERNAL_URL`。Rewrite 不转换 DTO、错误或状态码，不构成第二个业务 API 层。
- Server Component 可经同一服务端 API 地址读取，但页面不得直接查询数据库；客户端代码不得读取内部 API 地址、数据库凭据或 Provider 密钥。
- JSON 字段使用 camelCase；ID 为 UUID；时间为 UTC ISO 8601；用户时区为 IANA 字符串。
- 列表使用 `limit` 与不透明 `cursor`，响应为 `{ items, nextCursor }`；默认 20，最大 100。
- 成功创建返回 201；异步运行创建返回 202；无正文删除返回 204。
- 可变资源更新必须提交 `version`；冲突返回 409 `VERSION_CONFLICT`。

## 错误结构

```json
{
  "code": "VERSION_CONFLICT",
  "message": "文档已被其他保存更新。",
  "requestId": "uuid",
  "details": {}
}
```

`message` 可直接展示给用户且不含内部信息；`details` 只放字段错误或安全的恢复信息。服务端日志用 `requestId` 关联详细异常。

## 请求关联与日志

- 客户端可发送 `X-Request-Id`；仅 UUID 被保留，缺失或非法值由服务端生成 UUID v4。
- 每个响应以 `X-Request-Id` 回传最终值；错误响应的 `requestId` 字段必须与响应头一致。
- HTTP 完成日志只包含事件名、request ID、方法、无查询参数路径、状态码和耗时；禁止记录 Cookie、Authorization、请求/响应正文、Prompt、密钥或外部全文。
- Worker 日志固定包含事件名与服务名；处理任务时保留 `jobId`，有来源时同时保留 `runId` 和 `requestId`，不得记录完整任务载荷。
- Nest 系统日志与应用日志使用单行 JSON；本阶段不引入第三方日志 SDK。

## 核心资源

### Knowledge

- `/knowledge-bases`：列表、创建。
- `/knowledge-bases/:id`：读取、更新、软删除、恢复。
- `/knowledge-bases/:id/documents`：按父节点分页读取和创建。
- `/documents/:id`：读取、更新、软删除、恢复。
- `/documents/:id/move`：提交目标父级、相邻位置与版本。
- `/documents/:id/revisions`、`/documents/:id/revisions/:revisionNumber/restore`：修订列表、预览和恢复（`/documents/:id/restore` 是回收站软删除恢复，两者不同资源）。
- `/documents/:id/links`、`/documents/:id/backlinks`：内部链接关系。
- `/inbox-items`、`/inbox-items/:id/convert`：快速记录与幂等转换。
- `/search`：`query/scope/knowledgeBaseId/field/updatedAfter/limit/cursor`。`scope` 为 `all | knowledgeBase`，`field` 为 `all | title | content`；SEARCH-02 不接受 `tagIds`，标签筛选在 SEARCH-03 随标签关系一并扩展。响应按文档去重并返回纯文本高亮分段、可空 Block ID、展示型祖先路径、游标和范围级索引状态，不返回内部物化 path 或高亮 HTML。

### Files 与导入导出

- `/attachments/uploads` 创建受限上传；确认端点校验对象大小、类型和哈希。
- `/imports` 和 `/exports` 创建异步任务；结果通过运行事件和短期下载链接取得。
- 附件下载必须经过所有权或分享快照授权，禁止直接暴露永久公共对象 URL。

### Generations

- `/generations` 创建生成；请求指定用途、上下文范围、目标 Block、操作和幂等键。
- `/generations/:id/events` 提供 SSE；`/cancel` 持久化取消意图。
- `/generations/:id/accept` 提交目标文档版本和选择的差异；重复接受返回同一修订。
- `/knowledge-questions` 创建带引用问答，范围只允许 `document` 或 `knowledgeBase`。

### Workflows、News 与 Tutorials

- `/workflows`、`/workflows/:id/versions`、`/workflows/:id/publish` 管理定义与发布。
- `/workflow-runs` 创建手动运行；`/:id/events`、`/:id/cancel`、`/:id/resume` 管理执行。
- `/schedules` 管理每日/每周计划；客户端不提交 Cron。
- `/news-subscriptions` 管理订阅、启停与 `/:id/run` 手动运行；配置界面收敛在资讯页头。
- `/news-items` 条目流：`subscriptionId/sourceType/importance/limit/cursor` 过滤，固定 `importance desc → discoveredAt desc → id desc` 排序和不透明游标；被判无关条目不返回。`/news-items/:id` 返回处理正文、相关性/重要性判定与发现运行 ID。
- `/news-digests` 简报按日列表；`/digest-runs/:id` 查询详情和重试步骤。
- `/tutorials`：列表（含进度与状态投影）与创建草案；`/:id/confirm-scope`、`/:id/confirm-outline` 对应两次不可隐式跳过的确认闸门（compose 快照中的 outline gate 确认卡即 `confirm-outline` 端点语义，首次大纲确认走该端点；对话内 outline 提案用于建库后的修订）；章节重试为 `/tutorial-chapters/:id/retry`。
- `/tutorials/:id/compose` 返回会话快照（分页消息、待处理提案与确认卡、大纲与章节状态）；`POST /tutorials/:id/compose/messages` 以幂等键发送消息并返回 202；`POST /tutorials/:id/compose/proposals/:proposalId/accept|reject` 决议提案，重复决议返回首次结果；章节差异接受沿用 `/generations/:id/accept`；compose 流式更新订阅既有 `/workflow-runs/:id/events`。

## SSE

SSE 信封固定为：

```json
{
  "eventId": "uuid",
  "type": "run.node.completed",
  "runId": "uuid",
  "sequence": 12,
  "timestamp": "2026-08-09T08:00:00.000Z",
  "payload": {}
}
```

- `sequence` 在单个运行内单调递增；服务端持久化可恢复事件的摘要。
- 客户端用 `Last-Event-ID` 重连；事件窗口失效时收到 `stream.reset`，随后重新获取运行快照。
- SSE 仅传状态、增量草稿和安全摘要，不发送密钥、完整外部正文或隐含推理过程。
- 客户端无法维持 SSE 时按运行详情端点指数退避轮询。

## 领域事件

领域事件与对应业务变更在同一 PostgreSQL 事务内追加到 Outbox；事务提交后由 Worker 至少一次消费：

- `document.saved`：刷新链接和检索块；`plainText` 已由 Knowledge 在正文保存事务中同步派生。
- `document.deleted/restored`：触发搜索投影清理或重建；读取可见性的最终门禁始终是有效 Document 与 KnowledgeBase 联结。
- `generation.accepted`：关联修订并完成生成。
- `workflow.published`：刷新默认调度目标版本。
- `schedule.due`：创建有唯一幂等键的 Workflow Run。
- `digest.completed`、`tutorial.chapter.completed`：刷新领域状态和页面事件。

事件 Schema 必须版本化；消费者忽略未知可选字段，但不得猜测未知事件类型。文档投影以数据库当前状态和单调递增的 `documentVersion` 为准：旧事件只能成功空操作，删除后迟到的保存事件不得重新暴露内容，恢复事件按当前正文重建。搜索读取同时联结有效 Document 与 KnowledgeBase，队列延迟不能让已删除内容进入候选集。

## 验证与安全

- Controller DTO 使用 `class-validator`，应用服务继续校验所有权、状态迁移和跨实体不变量。
- Agent Runtime 内部 Zod Schema 不得直接作为公开 HTTP DTO。
- 异步运行、外部副作用以及任务明确标注的转换、移动或恢复写入必须支持 `Idempotency-Key`；服务端保存所有者、操作类型和响应资源，键不能跨用户复用。修订恢复（`POST /documents/:id/revisions/:revisionNumber/restore`）为例外：重放由 409 乐观版本并发与相邻 restore 修订去重约束，ED-03 已定稿该语义。
- 简单同步创建默认不具备幂等语义；除非对应任务另有约定，响应结果未知时客户端必须重新读取资源，不得盲目重放创建请求。
- 公开分享端点限流并返回统一不可访问响应；私有 API 不允许通过 ID 探测其他用户对象。
