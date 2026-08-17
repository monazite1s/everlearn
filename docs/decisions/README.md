# Everlearn ADR 目录

跨模块、公共契约、数据格式、安全或供应商锁定决策在此记录（依据 `docs/03-engineering/research-and-dependencies.md` 与 `docs/03-engineering/vibe-coding-standards.md`）。

- [001 - shadcn/ui + Tailwind v4 迁移](001-shadcn-tailwind-migration.md)
- [002 - 删除自定义主题色板并整体重写布局](002-default-theme-and-layout-rewrite.md)
- [003 - 到期清理直写 InboxItems 表的跨模块豁免](003-purge-cross-module-inbox-delete.md)

## 命名与格式

- 文件名：`<NNN>-<slug>.md`，`NNN` 为三位递增序号（如 `001-mantine-migration.md`）。
- 每个 ADR 包含：状态（提案/已接受/已废弃）、背景与约束、决策、备选方案与拒绝原因、代价与移除条件。
- 可逆的模块选择写入对应架构文档；只有跨模块、公共契约、数据格式、安全或供应商锁定决策才写 ADR。

## 维护规则

- 决策改变后先更新 ADR 状态，再实施；ADR 是决策事实源之一。
- 任务风险栏中登记的技术债若涉及 ADR 范围，必须链接对应 ADR。
