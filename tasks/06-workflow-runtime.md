# 里程碑 06：Workflow Runtime

完成后后端可校验、发布、调度和恢复受限 LangGraph Workflow；先提供 API 与最小列表调试界面，不包含 React Flow。

## WFR-01 定义 Workflow Schema 与校验器

- 依赖：AI-01、KB-03。
- 必读：`docs/02-architecture/ai-workflow-runtime.md`、`docs/02-architecture/data-model.md`、`docs/02-architecture/api-and-events.md`。
- 目标：在 `packages/agent-runtime` 用 Zod 定义版本化输入、节点、边、预算和输出 Schema。
- 实施：校验可达性、唯一 ID、输入输出映射、循环上限、工具许可和结束路径；提供升级入口。
- 非目标：运行执行、HTTP/代码节点和 UI 表单。
- 验收：所有批准节点可序列化；非法图返回可定位错误；未知版本不猜测执行。
- 验证：Schema 与图校验分支覆盖率 ≥90%。

## WFR-02 实现草稿、发布与版本 API

- 依赖：WFR-01、KB-01。
- 必读：`docs/01-design/pages/workflows.md`、`docs/02-architecture/data-model.md`、`docs/02-architecture/api-and-events.md`。
- 目标：实现 Workflow CRUD、草稿保存、校验、发布、版本列表和归档。
- 实施：发布事务创建不可变版本；后续编辑新草稿；版本更新使用乐观锁。
- 非目标：模板、运行和版本可视化差异。
- 验收：无效草稿不能发布；已发布定义不可修改；历史版本可读取。
- 验证：领域状态机、API/PostgreSQL 集成测试。

## WFR-03 建立 LangGraph 执行与检查点

- 依赖：WFR-01、WFR-02、FND-08。
- 必读：`docs/02-architecture/ai-workflow-runtime.md`、`docs/02-architecture/system.md`、`docs/03-engineering/research-and-dependencies.md`。
- 目标：把发布定义编译为 LangGraph，使用 PostgreSQL Checkpointer 和一对一 thread ID 运行。
- 实施：业务 Run 与检查点分离；节点尝试保存摘要；取消在节点和副作用边界检查。
- 非目标：全部工具实现、人工确认和调度。
- 验收：顺序/分支/有限循环/子图可执行；进程重启后读取检查点；未知节点拒绝。
- 验证：伪节点 Runtime 单元、Worker 重启恢复集成测试。

## WFR-04 实现工具注册与权限

- 依赖：WFR-03、AI-04。
- 必读：`docs/02-architecture/ai-workflow-runtime.md`、`docs/02-architecture/system.md`、`AGENTS.md`。
- 目标：注册知识库读取、混合检索、LLM、Web 搜索、RSS、创建文档和草稿更新工具。
- 实施：注册表同时提供参数 Schema、设计元数据和执行函数；执行前校验所有者、版本许可和预算。
- 非目标：任意 HTTP、脚本、代码和第三方写入。
- 验收：未声明工具不可调用；参数无效快速失败；写工具具备业务幂等键。
- 验证：工具契约、越权、预算和幂等集成测试。

## WFR-05 实现人工确认与恢复

- 依赖：WFR-03、WFR-04。
- 必读：`docs/02-architecture/ai-workflow-runtime.md`、`docs/01-design/pages/workflows.md`、`docs/02-architecture/data-model.md`。
- 目标：用 LangGraph `interrupt` 实现可持久化确认、拒绝和检查点恢复。
- 实施：中断载荷说明副作用；Approval 只能决定一次；中断前副作用移后或用幂等键保护。
- 非目标：通用人工任务系统和多审批人。
- 验收：批准前无副作用；重复批准结果一致；恢复不重复已完成写入。
- 验证：中断/恢复/拒绝状态机与 Worker 崩溃集成测试。

## WFR-06 实现运行事件与观察 API

- 依赖：WFR-03、WFR-05。
- 必读：`docs/02-architecture/api-and-events.md`、`docs/01-design/pages/workflows.md`、`docs/02-architecture/data-model.md`。
- 目标：提供运行列表、快照、节点尝试、安全输出摘要、SSE、取消和恢复端点。
- 实施：事件序号持久化；重连支持 reset；不暴露隐含推理或完整敏感输入。
- 非目标：完整可视化运行页。
- 验收：SSE 与快照最终一致；取消持久化；错误可定位到节点和尝试。
- 验证：SSE 重连、取消、权限和脱敏集成测试。

## WFR-07 实现每日/每周调度

- 依赖：WFR-02、WFR-03。
- 必读：`docs/02-architecture/ai-workflow-runtime.md`、`docs/02-architecture/data-model.md`、`docs/02-architecture/system.md`。
- 目标：用 BullMQ Job Schedulers 管理每日、每周和手动运行。
- 实施：保存 IANA 时区；Scheduler key 绑定 Schedule ID；计划触发幂等键为 scheduleId+scheduledAt；默认解析最新发布版本。
- 非目标：Cron 输入、事件触发和错过任务补跑策略 UI。
- 验收：修改计划不重复 Scheduler；历史 Run 保留旧配置/版本；同一计划时刻只建一个 Run。
- 验证：时区/DST 单元、Redis/PostgreSQL 调度集成、重启测试。

## 检查点

发布一个“读文档 → LLM → 质量检查 → 创建新文档”的测试 Workflow，验证工具边界、中断、重启恢复、调度幂等和 `pnpm check`。
