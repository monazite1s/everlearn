# ADR 004：事务 Outbox 与搜索投影执行边界

- 状态：已接受（2026-08-24）
- 关联任务：SEARCH-01

## 背景与约束

正文保存必须保持同步、可回滚，搜索块允许异步更新。若业务写入提交后才创建事件，进程在两次写入之间退出会永久漏索引；若 Worker 直接写 Knowledge 表或复制 API 数据库层，又会破坏模块所有权并扩大运行时配置。Redis 允许丢失，PostgreSQL 必须保留可重建事实。

## 决策

采用 Transactional Outbox，并沿用既有 Worker → 内部 API 执行边界：

1. Knowledge 在正文或生命周期业务事务内追加版本化 Outbox 事件；业务变更与事件只能同时提交或同时回滚。
2. Worker 使用 BullMQ 固定调度与退避触发内部 Search 端点，不直接读写业务表，也不新增数据库运行时依赖。
3. API Search 模块锁定待处理事件，读取 Knowledge 提供的当前只读投影，并在同一 PostgreSQL 事务内更新 Search 自有表和事件完成状态。
4. 重复与乱序交付按 `documentVersion` 单调收敛；搜索读取始终联结有效 Document 与 KnowledgeBase，异步投影不能决定删除可见性。
5. Worker 启动和固定周期任务触发补偿扫描，修复既有、缺失、过期和多余投影；Redis 丢失不丢业务进度。
6. 补偿扫描以稳定文档 ID 游标轮转全部有效文档，永久非法旧正文也必须推进游标；`indexed_at` 表示最近一次成功写入或完整核对时间。只有头部或块集合与当前解析结果不一致时才计为修复并重写。

主要 Outbox 写入符号使用 `@designPattern Transactional Outbox` 标记。该模式只覆盖需要异步可靠投影的领域事件，不扩展成通用消息总线。

## 备选方案与拒绝原因

- Worker 直连 PostgreSQL：需要在 Worker 引入并复制 Kysely/pg、数据库类型和事务配置，且容易让 Search 执行代码跨模块直接写 Knowledge 表。
- API 提交后直接投递 BullMQ：提交与投递之间存在永久丢事件窗口，补偿扫描只能降低而不能消除正常路径不一致。
- 新建共享数据库或事件总线包：当前只有一个真实消费切片，为单一场景预建通用抽象会增加空壳和耦合。

## 代价与移除条件

- 代价：新增 Outbox 存储、内部端点、轮询调度、退避/隔离状态和补偿扫描；索引存在短暂最终一致窗口。
- 边界：Outbox 不保存业务正文，只保存版本化定位载荷；Search 不回写 `Document.plainText`；Worker 不持有业务状态。
- 移除条件：若未来 PostgreSQL 原生队列或已批准消息基础设施能在同一业务事务内提供可证明的原子投递与重放，可迁移后删除 Outbox；在此之前不得用仅 Redis 投递替代。
