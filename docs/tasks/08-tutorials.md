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

### 交付记录（2026-09-04，速度优先可用版）

- TUT-01..05 后端闭环：会话状态机（draft→researching→outline_ready→generating→partial/completed/failed/canceled，未确认范围零研究调用）；研究+结构化大纲（WebSearchProvider 未配置降级仅 KB 研究并记警告，JSON 解析一次重试，环检测拒绝）；第二次确认原子创建 tutorial 知识库+章节占位文档（幂等）；无依赖章节并行生成、依赖完成后释放，写入占位文档新修订（引用 [n]+来源列表）；单章幂等重试（attempt 递增）与取消未开始章节。
- TUT-06：/tutorials 列表+创建、详情页两次确认/大纲编辑（行内编辑与排序，dependsOn 暂只读标签）/章节状态/单章重试/取消，researching/generating 5s 轮询；组件测试 12 例。
- 浏览器 E2E：教程完整闭环（含大纲编辑、占位立即可见、引用正文跳转）、单章失败重试（attempt=2）、取消后不领取，三轮全量 E2E 18/18 稳定。
- 遗留裁剪：大纲 dependsOn 页面不可编辑；章节占位正文仅段落块（行内标记不解析）；无进行中章节中断（cancel 只拦未开始）；真实 Tavily 出网未验证（mock 路径全覆盖）。

### 2026-09-05 重设计方案（质量优先）

方案事实源：`docs/00-product/product-spec.md`（系统教程节）、`docs/01-design/pages/tutorials.md`、`docs/02-architecture/data-model.md`（Tutorials 节）、`docs/02-architecture/api-and-events.md`。以下任务供后续认领，编号接续 TUT-06：

- TUT-07 教程书架列表：书架卡片（标题、进度 x/y 章、状态徽章、继续阅读）；质量对齐知识库入口的三通道层级、hover 反馈与结构化空态。
- TUT-08 详情三视图：左栏章节树 + 知识脊线；Tabs 树/列表/图写入 `?view=`；图视图用 dagre 布局 + SVG 自绘（不引入 React Flow），仅渲染本教程大纲内已确认 `dependsOn`，50+ 节点默认展开当前章节 2 跳其余折叠「+N」；列表视图作无障碍等价（顺带消化上批「dependsOn 页面不可编辑遗留」的展示面）。
- TUT-09 compose 会话持久化：`tutorial_messages` 迁移（消息/确认卡/提案统一落库，`UNIQUE (tutorial_id, sequence)`，提案与确认卡 `pending→accepted/rejected` 一次性状态机）；`GET /tutorials/:id/compose` 快照、`POST .../messages`（幂等键 202）、`POST .../proposals/:id/accept|reject` 端点。
- TUT-10 compose 子路由：`/tutorials/:id/compose` 左 1/3 对话流 + 右 2/3 实时预览；开始研究与建库两闸门以对话内确认卡呈现（复用 `confirm-scope`/`confirm-outline`，取代旧独立向导页）；Agent 提议仅提案、接受才落库；全新占位章节首次填充视为已授权；用户编辑章节（最近修订 manual）改写先展示差异（复用 `/generations/:id/accept`）；researching/generating 显示阶段名与真实计数。
- TUT-11 教程徽标：知识库列表对 `kind=tutorial` 显示教程徽标（不隐藏、不混排）；`/tutorials` 只列教程知识库。
- TUT-12 E2E 更新：闸门接受前零副作用、提案决议幂等与刷新恢复、三视图数据一致与折叠行为、差异接受流程、教程徽标可见性；axe/390px/reduced motion 走查。

## 技术债登记（2026-09-05 评审）

以下缓办项经评审确认不在本轮修复，逐条登记内容、影响与升级条件：

1. sendMessage 状态读取与落库存在窗口：LLM 调用在事务与锁外（有意避免长事务持锁），生成回复所依据的教程状态与最终落库之间可能落后一个并发写。升级条件：出现「闸门期内禁止发消息」等强一致需求时把会话状态校验收进写事务。
2. 对话历史窗口固定 50 条：`readHistory` 以 limit 50 作为提示词上下文，更早消息不进入模型。升级条件：长会话 Agent 遗忘早期约束成为质量问题时做滚动摘要压缩。
3. superseded 只覆盖同类提案：接受提案仅将同教程同 kind 其它 pending 提案置 superseded，不同 kind 的 pending 提案可继续独立决议（语义如此设计）。升级条件：产品要求一次决议清空全部待决提案时扩展。
4. 章节尝试上限为经验值：`MAX_CHAPTER_ATTEMPTS=5` 硬编码，耗尽后 claim/retry 置 failed（`TUTORIAL_CHAPTER_MAX_ATTEMPTS`），无自动告警与人工重置路径。升级条件：失败面数据支持调参或需要「重置尝试计数」功能。
5. Tavily 适配错误未分类：worker 侧 `searchWithTavily` 仍抛 `tavily search responded <status>` 原始错误，未与 GLM 一样映射稳定中文错误。升级条件：Tavily 重新成为默认 Provider 时对齐错误映射。
6. worker/api 搜索与 JSON 提取实现双份同源复制（ponytail 已注明下沉 packages 条件）。升级条件：任一份需要独立演化或出现第三处复用。
