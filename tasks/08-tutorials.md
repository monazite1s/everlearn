# 里程碑 08：系统教程

完成后用户可通过两次确认，把知识库与 Web 研究转化为独立教程知识库，并逐章阅读和恢复失败任务。

## TUT-01 实现教程草案与研究范围

- 依赖：WFR-05、NEWS-01。
- 必读：`docs/01-design/pages/tutorials.md`、`docs/02-architecture/data-model.md`、`docs/02-architecture/api-and-events.md`。
- 目标：保存主题、受众、水平、目标、深度、覆盖/排除项、知识库范围和 Web 来源范围。
- 实施：规范化输入生成可见研究计划；确认前不执行搜索；确认形成不可变 Scope 版本。
- 非目标：大纲、建库和页面视觉。
- 验收：草案可反复编辑；重复确认只生效一次；修改已确认范围创建新研究版本。
- 验证：状态机、API 幂等与权限集成测试。

## TUT-02 建立研究与大纲 Workflow

- 依赖：TUT-01、AI-04、WFR-05。
- 必读：`docs/02-architecture/ai-workflow-runtime.md`、`docs/01-design/pages/tutorials.md`、`docs/02-architecture/data-model.md`。
- 目标：第一次 interrupt 后研究个人知识库和 Web，生成带来源覆盖的结构化可编辑大纲。
- 实施：大纲包含前置知识、章节依赖、目标、概念、示例/练习和引用；无效结构停止并可重试。
- 非目标：章节正文生成和自动替用户确认。
- 验收：未确认范围无研究调用；大纲事实来源可追踪；证据缺口明确标记。
- 验证：伪 Provider Workflow、结构化输出失败和引用校验测试。

## TUT-03 实现大纲编辑、确认与原子建库

- 依赖：TUT-02、KB-03。
- 必读：`docs/01-design/pages/tutorials.md`、`docs/02-architecture/data-model.md`、`docs/02-architecture/api-and-events.md`。
- 目标：允许编辑/重排大纲；第二次确认后原子创建独立教程知识库和章节占位文档。
- 实施：校验章节依赖无环；知识库类型为 tutorial；Outline 节点与 Document 一一映射。
- 非目标：章节内容和分享。
- 验收：确认前无知识库；失败回滚完整；重复确认返回同一知识库与树。
- 验证：大纲领域、数据库事务/幂等、树结构集成测试。

## TUT-04 实现章节生成子图

- 依赖：TUT-03、WFR-04。
- 必读：`docs/02-architecture/ai-workflow-runtime.md`、`docs/01-design/pages/tutorials.md`、`docs/02-architecture/data-model.md`。
- 目标：按依赖调度章节研究、撰写、质量检查、引用校验和修订写入。
- 实施：无依赖章节并行；完成即写入占位文档新修订；警告与失败状态独立。
- 非目标：逐章人工批准和跨教程共享章节。
- 验收：单章失败不阻塞无依赖章节；内容只引用实际候选；整体可处于 partial。
- 验证：依赖调度单元、并发/部分失败 Worker 集成测试。

## TUT-05 实现单章重试与取消

- 依赖：TUT-04。
- 必读：`docs/01-design/pages/tutorials.md`、`docs/02-architecture/ai-workflow-runtime.md`。
- 目标：从目标章节最近有效步骤重试，保留旧尝试并生成新修订；支持取消剩余章节。
- 实施：重试沿用确认大纲和允许来源范围；不重跑已完成无依赖章节；取消持久化。
- 非目标：自动修改已确认大纲。
- 验收：只更新目标章节；重复重试请求幂等；取消后未开始章节不执行。
- 验证：检查点恢复、文档修订和取消集成测试。

## TUT-06 实现教程页面与 E2E

- 依赖：TUT-01..05、UI-03。
- 必读：`docs/01-design/pages/tutorials.md`、`docs/01-design/design-system.md`、`docs/01-design/layout-and-navigation.md`。
- 目标：实现创建、两次确认、大纲编辑、章节状态、来源覆盖和失败重试页面。
- 实施：移动端只读；阶段动效不使用虚假百分比；完成章节链接标准编辑器。
- 非目标：协作审稿和移动创建。
- 验收：两次确认文案和副作用清楚；占位建库立即可见；单章重试状态准确。
- 验证：组件/axe、Playwright 教程完整闭环、视觉回归。

## 检查点

使用伪 Provider 完成两次确认、部分失败、单章重试、取消和恢复 E2E，执行 `pnpm check` 并核对引用覆盖。
