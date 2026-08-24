# AI 与 Workflow Runtime

## 职责分离

- LLM Gateway 处理 Provider、模型选择、超时、重试、限流、token/成本、错误映射和 Prompt 版本。
- Retrieval 处理文档范围、全文与向量召回、排序、上下文预算和块级引用。
- LangGraph.js 处理状态图、分支、子图、持久化检查点与人工中断。
- BullMQ 处理分发、并发、退避和每日/每周 Job Scheduler；它不保存业务状态机。
- PostgreSQL 保存 Workflow 定义/运行索引、LangGraph 检查点、业务副作用和审计记录。

## Provider 接口

首个 LLM 实现兼容 OpenAI API，但业务代码只依赖稳定接口：流式文本生成、结构化生成、Embedding、取消和用量返回。Provider 错误统一映射为 `configuration`、`authentication`、`rate_limit`、`timeout`、`content_policy`、`invalid_output` 或 `upstream`。

Search Provider 使用 Strategy/Adapter；首个实现为 Tavily。适配器输出统一的标题、URL、发布日期、摘要、必要短摘录和来源标识。RSS 适配器使用相同来源投影。

密钥只由 API/Worker 解析；配置测试不得把原始响应写入业务日志。

## 检索与引用

1. 按所有者和用户选择的当前文档或知识库限定候选集。
2. 从 PostgreSQL FTS 与 pgvector 分别召回块，按内容哈希去重。
3. 合并分数并保留标题路径、文档版本、`blockId` 和匹配片段。
4. 在上下文预算内优先覆盖不同文档和章节，不只堆叠相邻块。
5. 生成输出引用只能引用提供给模型的候选；服务端校验引用 ID 存在且仍属于允许范围。
6. 无足够证据时返回明确的不足结果，不用模型常识伪装成知识库证据。

索引异步更新。编辑保存后 UI 可提示“内容已保存，索引更新中”；问答使用最后完成索引的文档版本并显示引用时间。候选交给模型前只接受 `SearchBlock.documentVersion` 仍等于当前 `Document.version` 的块，并在受锁当前正文上创建或复用不可变 Revision；版本不等的候选丢弃并等待索引更新或重新检索。生成结果只绑定已锁定 Revision，引用不得把可变文档版本伪装成修订号。

## Workflow 定义

定义包含 Schema 版本、输入 Schema、节点、边、入口、结束条件、允许工具、预算和输出映射。节点 ID 在版本内唯一；循环必须有最大次数；子图必须声明输入输出映射。

首期节点类型：

- 控制：输入、条件分支、受限循环、子图、人工确认、结束。
- AI：提示/LLM、结构化输出、质量检查。
- 读取：知识库文档、混合检索、Web 搜索、RSS 获取。
- 写入：创建新文档、更新本运行创建的草稿。

不得提供通用 HTTP、Shell、JavaScript 或任意代码节点。工具注册表同时约束设计器可见性、运行时授权和参数 Schema，不能只在 UI 隐藏。

## 版本、运行与检查点

- 编辑只改变草稿。发布前执行结构、可达性、循环上限、工具权限、输入输出和预算校验。
- 发布创建不可变版本；计划任务默认解析最新已发布版本，创建运行后固定版本和输入快照。
- 每次运行使用唯一 LangGraph `thread_id`；业务 Run ID 与 thread ID 一对一。
- PostgreSQL Checkpointer 保存每个 super-step 状态。恢复从最近有效检查点继续，不手工重放节点输出。
- LangGraph `interrupt` 恢复时会从节点开头重新执行；中断前不放置非幂等副作用。无法避免时，副作用必须由业务幂等键保护。
- NodeAttempt 只保存输入/输出摘要、工具结果引用和错误，不保存模型隐含推理。

## 人工确认

- 确认请求必须描述将执行的动作、目标、预计影响和可见输入，不只显示“是否继续”。
- Approval 只能从 `pending` 转为 `approved` 或 `rejected` 一次；重复提交返回第一次结果。
- 拒绝由图定义决定结束或进入替代分支；运行记录保留决定者和时间。
- 更新已有正式文档必须确认；新建文档和更新本运行创建的草稿可按模板规则自动执行。

## 调度与幂等

- 使用 BullMQ `upsertJobScheduler` 管理每日/每周计划，Scheduler key 来自持久化 Schedule ID。
- 计划触发幂等键由 `scheduleId + scheduledAt` 生成；手动运行使用客户端 Idempotency-Key。
- 计划修改只改变未来触发；历史 Run 保存旧配置快照。
- 重试按节点错误类别决定：校验、权限和内容策略错误不可自动重试；超时、限流和临时上游错误有限退避。
- 设置运行最大时长、节点最大尝试、循环上限和 token/费用预算；超限以明确错误终止。

## 领域流程

### 资讯模板

加载订阅快照 → 并行 RSS/Search 获取 → 规范化/去重 → 相关性筛选 → 单项摘要 → 聚合简报 → 引用与质量检查 → 创建或修订唯一简报文档。质量不足走 `succeeded_warning`，不是失败隐藏。

### 教程模板

规范化研究范围 → `interrupt` 确认 → 搜索和知识库研究 → 生成可编辑大纲 → `interrupt` 确认 → 创建独立知识库与占位文档 → 按依赖调度章节子图 → 质量检查与修订写入 → 汇总部分/完成状态。

## 可观察性与测试重点

- 记录 Provider、模型、Prompt 版本、token、费用、节点耗时、重试、引用和副作用资源 ID。
- 日志不包含密钥、完整正文、外部全文或隐含推理；需要排错时使用受控摘要和关联 ID。
- Agent Runtime、状态迁移、工具授权、引用校验与幂等分支覆盖率不低于 90%。
- 使用伪 Provider 做确定性测试；真实 Provider 只用于显式集成测试，不作为 CI 必需条件。

## 官方依据

- [LangGraph persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence)
- [LangGraph interrupts](https://docs.langchain.com/oss/javascript/langgraph/interrupts)
- [BullMQ Job Schedulers](https://docs.bullmq.io/guide/job-schedulers)
