# Everlearn 文档入口

文档只记录当前有效的产品决策、行为、架构和验收标准。历史方案由版本控制保存，不在正文中兼容。

| 层级 | 事实源                                                                                                                                                                                                                                   | 使用时机                                                               |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 产品 | [产品规格](00-product/product-spec.md)、[发布路线](00-product/release-roadmap.md)                                                                                                                                                        | 判断目标、范围、优先级和延期能力。                                     |
| 设计 | [设计系统](01-design/design-system.md)、[布局与导航](01-design/layout-and-navigation.md)、[页面规格](01-design/pages/)                                                                                                                   | 新建或修改页面、组件和交互。                                           |
| 架构 | [系统架构](02-architecture/system.md)、[数据模型](02-architecture/data-model.md)、[API 与事件](02-architecture/api-and-events.md)、[AI 与 Workflow Runtime](02-architecture/ai-workflow-runtime.md)、[决策记录 ADR](decisions/README.md) | 修改模块、数据、接口、异步任务或外部集成；跨模块/契约/安全决策写 ADR。 |
| 工程 | [开发规范](03-engineering/development.md)、[质量门禁](03-engineering/quality-gates.md)、[研究与依赖](03-engineering/research-and-dependencies.md)、[Vibe Coding 商业化差距规范](03-engineering/vibe-coding-standards.md)                 | 执行任何代码任务或引入依赖；vibe coding 任务按差距规范补齐门禁。       |
| 施工 | [任务入口](tasks/README.md)                                                                                                                                                                                                              | 领取任务、确认依赖和记录验收证据。                                     |
| 附录 | [项目 Skill 指南](99-appendix/agent-skills.md)                                                                                                                                                                                           | 了解 Skill 路由、职责边界和维护规则。                                  |

## 冲突处理

1. `product-spec.md` 决定产品行为和范围。
2. 页面规格决定用户可见行为，架构文档决定实现边界。
3. 工程文档只约束实现质量，不得改变产品语义。
4. 任务文件不得创造新需求；发现冲突时停止实现，先更新事实源。

## 页面规格要求

页面文档必须包含目的、路由、入口和离开路径、桌面与移动布局、数据实体、操作反馈、完整状态、异步行为、接口关系、可访问性、动效降级和 E2E 验收。
