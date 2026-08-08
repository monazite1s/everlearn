# 研究与依赖

## 触发条件

以下工作在设计或编码前必须研究：Agent/Workflow、编辑器扩展、UI 系统、复杂动效、抓取与内容解析、队列/调度、认证、分享安全，以及新增基础依赖或难以回退的外部协议。

普通 CRUD、文案和既有模式内的小改动不需要重复研究。

## 研究记录

1. 先用 `rg` 检查仓库已有实现、约束和依赖。
2. 至少核对两类证据：一项官方文档或维护者仓库；另一项活跃 GitHub 实现、维护者工程文章或可信生产案例。
3. 记录 URL、查阅日期、适用版本、采用能力、限制、拒绝方案和替换成本。
4. 可逆的模块选择写入对应架构文档；跨模块、数据格式、安全或供应商锁定决策写 ADR。
5. 博客只作为线索，不覆盖官方 API、许可证、项目约束或本地验证。

## 依赖准入

- 必须解决当前已批准需求；没有第三个用例时不引入大型通用框架。
- 检查维护频率、Issue/Release、许可证、包体积、安全记录、文档、服务端/浏览器边界和移除成本。
- 优先无样式、可组合且不接管业务数据模型的库。
- 新依赖任务必须包含最小可行验证、失败回退和版本锁定策略。

## 已采用基线

| 领域 | 选择 | 用途与边界 |
|---|---|---|
| 编辑器 | [Tiptap](https://github.com/ueberdosis/tiptap) | Headless ProseMirror 编辑器、扩展和拖拽；不采用协作云或 Yjs。 |
| UI 原语 | [Radix Primitives](https://www.radix-ui.com/primitives/docs/overview/introduction) | 可访问行为层，由 CSS Modules 提供视觉。 |
| 动效 | [Motion for React](https://motion.dev/docs/react) | 编排与布局动效；简单变化使用 CSS。 |
| 画布 | [React Flow](https://reactflow.dev/learn/concepts/terms-and-definitions) | Workflow 可视化；列表仍是完整编辑入口。 |
| Agent Runtime | [LangGraph.js](https://github.com/langchain-ai/langgraphjs) | 图执行、检查点、子图和人工中断。 |
| 队列 | [BullMQ Job Schedulers](https://docs.bullmq.io/guide/job-schedulers) | 后台分发与每日/每周调度；不用废弃 repeatable API。 |
| 搜索 | PostgreSQL FTS + pgvector | 普通搜索与 AI 混合召回；不引入独立搜索集群。 |
| Web 搜索 | Tavily Adapter | 首个实现；业务只依赖 Provider 接口。 |
| 组件样式 | CSS Modules + CSS variables | 禁止原子化 CSS。 |

## 已拒绝或延期

| 方案 | 结论 | 原因 |
|---|---|---|
| Superpowers | 禁止 | Token 成本与收益不符合项目工作方式。 |
| OpenAI Agents SDK 作为 Runtime | 不采用 | 当前需要可编辑图、持久检查点和明确子图；Provider 仍保持可替换。 |
| 自研 Workflow DSL/状态机 | 不采用 | 重复建设持久化、中断和恢复能力。 |
| 固定 Planner/Executor/Critic | 不采用 | 不是所有流程都需要三角色，节点和质量门槛应按模板定义。 |
| Tailwind/UnoCSS | 禁止 | 原子化样式不符合可读性和主题约束。 |
| Yjs/CRDT | 延期且无计划 | 产品不允许同时协作编辑。 |
| Browser automation | 首期排除 | 资讯仅支持 RSS/Atom 和 Search API。 |
| 任意 HTTP/代码节点 | 首期排除 | 密钥、SSRF、隔离与资源治理成本过高。 |

## 已校验的重要限制

- LangGraph `interrupt` 恢复会从节点开头重新执行，因此中断前副作用必须幂等或移到中断后。
- BullMQ v5.16 起以 Job Schedulers 取代旧 repeatable jobs API。
- React Flow 具备键盘与屏幕阅读器基础能力，项目必须保留并中文化其 ARIA 文案。
- Motion 必须根据系统 reduced-motion 偏好取消位移、缩放和路径动画。
