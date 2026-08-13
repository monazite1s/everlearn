# 数据模型

## 通用约定

- 主键使用 UUID；时间存为 UTC，API 使用 ISO 8601；调度另存 IANA 时区。
- 可变业务对象保存 `version` 整数作乐观并发控制。
- 所有用户数据保存 `ownerId`；首期种子创建固定本地用户。
- 状态列使用数据库约束或受控枚举，不保存自由文本状态。
- 删除默认软删除；永久清理由显式操作或 30 天到期 Worker 完成。

## Identity 与 Knowledge

| 实体                  | 关键字段与约束                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `User`                | `id`、`displayName`、`timezone`、`createdAt`；首期只有本地种子用户。                                                            |
| `KnowledgeBase`       | `id`、`ownerId`、`name`、`description`、`kind=normal/news/tutorial`、`version`、删除时间；不可保存父知识库。                    |
| `Document`            | `id`、`ownerId`、`knowledgeBaseId`、`parentId?`、`path`、`position`、`title`、`contentJson`、`plainText`、`version`、删除信息。 |
| `DocumentRevision`    | 文档、连续修订号、来源 `manual/ai/import/restore/automation`、不可变内容快照、创建者、关联生成/运行。                           |
| `InboxItem`           | 原始文本或 URL、处理状态、创建时间、转换后的文档；转换操作幂等。                                                                |
| `Tag` / `DocumentTag` | 标签归属用户；同一用户下规范化名称唯一；文档只能使用同所有者标签。                                                              |
| `DocumentLink`        | 来源文档/Block、目标文档、显示文本；目标删除后记录保留为失效引用。                                                              |
| `Attachment`          | 所有者、对象键、原文件名、MIME、大小、SHA-256、上传状态、引用计数。                                                             |

知识库软删除只更新 `KnowledgeBase` 的删除状态；正常文档查询必须同时要求所属知识库未删除，因此整棵树不可见。恢复知识库不改写文档行，原树结构自然恢复，删除知识库前已单独进入回收站的文档仍保持删除。

### 文档树规则

- `parentId` 必须属于同一知识库和所有者；根文档为 `null`。
- `path` 是服务端维护的物化路径，只用于子树查询和排序，不暴露为稳定 API。
- 移动事务锁定目标文档与受影响父级，拒绝自身/后代目标，批量更新子树路径和排序。
- 删除文档将整个子树标记删除并保存原父级与位置；恢复以同一事务恢复子树。
- 同一父级的 `position` 由服务端生成可排序值；冲突时重新平衡该父级，不重排全库。

### 文档内容规则

- `contentJson` 必须符合已发布的 Tiptap Schema 版本；Document 记录保存 `schemaVersion`。
- 可引用节点必须含唯一 `blockId`。服务端拒绝同文档重复 ID，并在导入时重新映射冲突 ID。
- `plainText` 和搜索块由内容变更事件派生，不接受客户端直接写入。
- 防抖保存只更新 Document；达到修订触发条件时额外创建不可变 Revision。

## Search 与 Generations

| 实体                 | 关键字段与约束                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------- |
| `SearchBlock`        | 文档、修订、`blockId`、文本、层级标题、全文向量、内容哈希。                                 |
| `Embedding`          | SearchBlock、Provider、模型、维度、向量、内容哈希；模型变化允许并存重建。                   |
| `Generation`         | 所有者、用途、目标范围、Provider/模型、状态、输入摘要、输出草稿、token/成本、错误、幂等键。 |
| `GenerationCitation` | Generation、文档、修订、Block、来源片段；引用必须能定位到生成时修订。                       |

Generation 状态：`queued → running → awaiting_acceptance → succeeded`；任一活动状态可到 `cancelled` 或 `failed`。自动创建新文档的生成不经过 `awaiting_acceptance`，但必须保存 Revision。

## Workflow

| 实体              | 关键字段与约束                                                                            |
| ----------------- | ----------------------------------------------------------------------------------------- |
| `Workflow`        | 所有者、名称、用途、当前草稿版本号、最新发布版本号、归档时间。                            |
| `WorkflowVersion` | Workflow、连续版本号、`draft/published`、定义 JSON、Schema 版本、校验结果；发布后不可变。 |
| `Schedule`        | Workflow、频率 `daily/weekly`、星期、时刻、时区、输入、启用状态、BullMQ scheduler key。   |
| `WorkflowRun`     | 版本、触发方式、输入快照、状态、LangGraph thread ID、幂等键、开始/结束时间、费用。        |
| `NodeAttempt`     | 运行、节点、尝试号、状态、输入/输出摘要、错误类别、工具调用和时间。                       |
| `Approval`        | 运行、节点、请求载荷、状态、决定者、决定时间；只能决定一次。                              |

Workflow 定义状态：`draft`、`published`、`archived`。运行状态：`queued`、`running`、`waiting_input`、`succeeded`、`succeeded_warning`、`failed`、`cancelled`。恢复失败运行创建新尝试但沿用 Run 与 LangGraph thread。

## News

| 实体               | 关键字段与约束                                                                   |
| ------------------ | -------------------------------------------------------------------------------- |
| `NewsSubscription` | 所有者、名称、主题、包含/排除关键词、计划、启用状态、目标资讯知识库。            |
| `NewsSource`       | 订阅、类型 `rss/site/search`、URL 或查询配置、来源质量权重。                     |
| `SourceItem`       | 规范 URL、标题、发布日期、摘要、必要短摘录、内容指纹、获取时间；不保存完整正文。 |
| `DigestRun`        | 订阅配置快照、窗口、状态、质量结果、Workflow Run、输出文档、幂等键。             |
| `DigestItem`       | DigestRun、SourceItem、采用状态、相关性分数、跳过原因。                          |

Digest 状态与 Workflow Run 对齐。每个订阅和时间窗口有唯一幂等键；即使质量不足也关联一个输出文档，使用 `succeeded_warning`。

## Tutorials

| 实体              | 关键字段与约束                                                            |
| ----------------- | ------------------------------------------------------------------------- |
| `Tutorial`        | 所有者、主题、受众、目标、深度、状态、Workflow Run、目标知识库。          |
| `ResearchScope`   | Tutorial、连续版本、范围 JSON、确认状态、确认时间。                       |
| `TutorialOutline` | Tutorial、连续版本、结构化大纲、来源覆盖、确认状态；确认后不可变。        |
| `TutorialChapter` | Tutorial、Outline 节点 ID、Document、依赖节点、状态、最近运行和质量结果。 |

Tutorial 状态：`draft_scope`、`researching`、`awaiting_outline`、`generating`、`partial`、`completed`、`failed`、`cancelled`。章节状态：`placeholder`、`queued`、`running`、`completed`、`warning`、`failed`、`cancelled`。

## Sharing（M7）

| 实体          | 关键字段与约束                                                         |
| ------------- | ---------------------------------------------------------------------- |
| `Share`       | 所有者、目标知识库或文档根、不可猜测 Token 哈希、快照、过期/撤销时间。 |
| `CloneRecord` | 分享、来源对象、目标对象、克隆用户、克隆时间、幂等键；不保存同步状态。 |

分享快照只包含共享子树和实际引用附件的公开投影。克隆生成新实体与 Block ID 映射，不复用来源主键。
