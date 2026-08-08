# 系统架构

## 部署单元

Everlearn 使用 `pnpm workspace` Monorepo 和模块化单体，不拆微服务。

```text
Next.js Web ── HTTP/SSE ── NestJS API ───── PostgreSQL + pgvector
                               │                    │
                               ├── Redis/BullMQ ─ NestJS Worker
                               ├── S3 Adapter ─── SeaweedFS
                               ├── LLM Provider
                               └── Search Provider / RSS
```

| 单元                     | 职责                                                           |
| ------------------------ | -------------------------------------------------------------- |
| `apps/web`               | 路由、UI、只读渲染器、编辑器与 SSE 客户端。                    |
| `apps/api`               | 业务 API、鉴权边界、事务、Provider Gateway 和运行查询。        |
| `apps/worker`            | BullMQ 消费、LangGraph 执行、调度任务、索引和到期清理。        |
| `packages/contracts`     | API DTO 派生类型、错误码、事件信封和共享枚举。                 |
| `packages/ui`            | Design Tokens、Radix 封装和稳定通用组件。                      |
| `packages/agent-runtime` | LangGraph 定义、工具注册、检查点协议和 Agent 专用 Zod Schema。 |

Docker Compose 是首个部署基线，包含 Web、API、Worker、PostgreSQL、Redis 和 SeaweedFS。Web、API 与 Worker 使用同一源码版本；部署不得让不同版本同时处理同一 Workflow 定义格式。

## 领域模块

| 模块        | 所有权                                            |
| ----------- | ------------------------------------------------- |
| Identity    | 用户主体、本地开发身份和后续会话。                |
| Knowledge   | 知识库、文档树、Inbox、回收站、标签、链接和修订。 |
| Search      | 文本投影、全文索引、向量块、混合排序和引用定位。  |
| Files       | 附件元数据、上传授权、对象生命周期。              |
| Generations | LLM 请求、流式草稿、差异接受、费用和错误。        |
| Workflows   | 定义、版本、计划、运行索引、节点尝试和人工确认。  |
| News        | 订阅、来源、条目摘要、简报与质量警告。            |
| Tutorials   | 研究范围、大纲、章节状态和教程知识库映射。        |
| Sharing     | M7 的发布快照、Token、撤销、过期和克隆来源。      |

模块只能通过应用服务、只读查询接口或领域事件协作。禁止跨模块直接写表；允许在同一数据库事务内由应用服务协调多个模块仓储。

## 同步与异步边界

- 同步：知识库与文档 CRUD、编辑保存、差异接受、普通搜索、配置读取和 Workflow 草稿编辑。
- SSE：LLM 草稿、运行状态和长任务阶段更新。SSE 不是业务事实源；重连从数据库状态恢复。
- 异步：嵌入索引、导入导出、计划触发、资讯抓取、教程研究/章节、Workflow 执行、附件清理和回收站清理。
- API 提交异步任务前先在 PostgreSQL 创建业务运行记录，再向 BullMQ 投递。投递失败可由补偿扫描恢复。
- Worker 完成副作用时先用幂等键锁定目标，再提交业务事务；Redis 不作为完成状态的唯一依据。

## 数据与存储

- PostgreSQL 是业务、状态和审计事实源；pgvector 与全文索引与文档修订关联。
- Redis 只保存队列、调度、限流和短期协调数据，允许在业务数据保留时重建。
- SeaweedFS S3 保存附件和导入导出临时对象；数据库保存所有权、哈希、大小、MIME、状态和对象键。
- 文档使用 ProseMirror JSON；服务端派生纯文本和块级索引。Markdown 不是内部事实源。
- 外部资料不归档完整正文，只保存生成所需且允许长期保存的摘要、短摘录和来源元数据。

## 可靠性

- 所有队列消费者按至少一次交付设计；副作用使用业务唯一约束和幂等键。
- 运行重试创建新的 `attempt`，不覆盖之前的输入、输出摘要或错误。
- 取消是持久化意图；节点在开始外部调用与提交副作用前检查取消状态。
- LangGraph 检查点保存在 PostgreSQL；业务运行表保存可查询索引，不能把检查点 JSON 当作产品查询模型。
- 对象存储上传采用待确认状态；只有正文或附件记录提交后才转为已引用，孤儿对象由清理任务删除。

## 安全边界

- 密钥只存在服务端环境变量或加密配置，日志和 API 不返回原值。
- 外部网页、RSS、Markdown、附件名、模型输出和 Workflow 参数均是不可信输入。
- HTML 渲染采用允许列表；URL 仅允许批准协议；服务端请求防 SSRF 并限制响应大小和超时。
- 普通查询始终按 `ownerId` 限定；本地固定用户也不得省略所有权条件。
- 公开分享使用独立读取路径和最小投影，不复用私有实体序列化器。

## 非目标

不引入 Kafka、Elasticsearch/OpenSearch、图数据库、Yjs/CRDT、微服务、Kubernetes 或多区域部署。出现经测量的瓶颈后才允许通过 ADR 重新评估。
