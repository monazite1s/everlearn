# Everlearn 项目 Skill 指南

## 目的与位置

项目 Skill 位于仓库 .agents/skills，随代码版本化，只约束 Everlearn。AGENTS.md 决定何时必须加载；本附录只解释职责，不复制 Skill 正文。

| Skill                            | 解决的问题                                       | 主要产物                                    |
| -------------------------------- | ------------------------------------------------ | ------------------------------------------- |
| everlearn-requirements           | 消除需求歧义并拆成上下文安全的纵向任务           | 范围、状态、验收条件、追踪关系和任务        |
| everlearn-ui-design              | 保证页面布局、组件复用、状态、可访问性和动效质量 | 组件复用图、状态覆盖和实页走查证据          |
| everlearn-reuse-first            | 在自研前查找仓库能力、组件库和成熟依赖           | adopt、compose、thin-adapt 或 custom 决策   |
| everlearn-api-contract           | 保证 NestJS 与 Next.js 共享稳定契约              | DTO、错误矩阵、并发、幂等、SSE 与客户端影响 |
| everlearn-postgres-design        | 保证表结构、约束、索引和迁移可维护               | 不变量、查询索引映射、迁移和真实数据库验证  |
| everlearn-pragmatic-architecture | 保持模块边界清晰并阻止过度设计                   | 选型、依赖边界、失败恢复和设计模式记录      |

## 使用原则

- Agent 先读取 AGENTS.md，再按强制路由加载适用 Skill；通常一项任务加载一至三个。
- Skill 不替代产品、页面、架构和任务事实源；冲突时先修正文档。
- UI 工作固定组合 everlearn-ui-design 与 everlearn-reuse-first。
- 跨前后端工作固定组合 everlearn-requirements 与 everlearn-api-contract；修改持久化时再加载 everlearn-postgres-design。
- 新模块、Provider、队列、Workflow 或设计模式加载 everlearn-pragmatic-architecture。
- Skill 产生的采用/拒绝决策、设计模式与验证证据写入当前任务，不另建重复报告。

## .claude/agents 双层体系

`.claude/agents` 提供项目级 Claude Code 执行入口：`architect`、`ui-designer`、`api-designer`、`db-designer`。它们是 Skill 之上的委派层，只做路由与门禁摘要，不复制 Skill 正文。Agent 命中触发条件时仍按 AGENTS.md 强制路由加载对应 Skill；事实源以 docs 为准，冲突时以 Skill 与文档为准。

## 维护规则

- 只有稳定、跨任务、容易被 Agent 忽略的流程才进入 Skill。
- 产品行为写产品或页面规格；具体架构决策写架构文档；一次性步骤写任务文件。
- SKILL.md 保持短小，详细检查表放 references；不创建 Skill README、变更日志或教程。
- 修改 Skill 后必须运行 Skill Creator 的 quick_validate.py，并检查 AGENTS.md 路由与本附录仍一致。
- 复杂 Skill 修改应由新上下文 Agent 使用真实任务前向验证；验证者只接收 Skill 路径、任务和必要原始材料。

## 设计模式标记

只有确实使用设计模式时，才在主要实现符号的 JSDoc 使用 @designPattern 标记，并在任务证据记录问题、代价、边界与移除条件。普通依赖注入、接口和文件分层不算设计模式。
