# 里程碑 02：知识库模型与 API

完成后可通过 API 创建多个知识库、管理文档树、Inbox 和回收站；尚不实现富文本编辑器。

## KB-01 建立 Identity 与 Knowledge Schema

- 依赖：FND-08、FND-09。
- 必读：`docs/02-architecture/data-model.md`、`docs/02-architecture/system.md`、`docs/00-product/product-spec.md`。
- 目标：创建 User、KnowledgeBase、Document、Revision、Inbox、Tag 与 Link 的首个迁移和本地用户种子。
- 实施：UUID、`ownerId`、版本、状态和唯一约束一次定义；文档先保存最小合法 JSON。
- 非目标：登录会话、分享和向量索引。
- 验收：固定用户由种子产生；所有用户数据有所有权约束；知识库没有父级字段。
- 验证：迁移 up/down 或恢复测试、数据库约束集成测试。

## KB-02 实现知识库 CRUD

- 依赖：KB-01。
- 必读：`docs/01-design/pages/knowledge-base.md`、`docs/02-architecture/api-and-events.md`、`docs/02-architecture/data-model.md`。
- 目标：实现知识库列表、创建、读取、更新、软删除和恢复 API。
- 实施：游标分页、版本冲突、所有权和 `normal/news/tutorial` 类型规则；系统类型只能由领域服务创建。
- 非目标：页面、文档 CRUD 和永久清理。
- 验收：版本冲突返回标准错误；其他所有者对象不可探测；软删除不出现在正常列表。
- 验证：Controller 契约测试、PostgreSQL 集成测试。

## KB-03 实现文档树 CRUD 与移动

- 依赖：KB-01、KB-02。
- 必读：`docs/02-architecture/data-model.md`、`docs/01-design/pages/knowledge-base.md`、`docs/02-architecture/api-and-events.md`。
- 目标：实现按父节点分页、新建、重命名、读取和原子子树移动。
- 实施：服务端维护物化路径与位置；事务拒绝跨库、跨所有者、自身和后代目标。
- 非目标：正文保存、拖拽 UI 和导入。
- 验收：移动后全部后代路径正确；并发版本冲突不部分提交；大树不全量返回。
- 验证：树领域单元测试、事务与并发集成测试。

## KB-04 实现 Inbox API

- 依赖：KB-01、KB-03。
- 必读：`docs/01-design/pages/knowledge-base.md`、`docs/02-architecture/api-and-events.md`。
- 目标：支持文本/单 URL 快速记录、列表、删除及幂等转换为目标文档。
- 实施：转换事务同时创建文档和标记 Inbox；失败保持未处理状态；重复请求返回同一文档。
- 非目标：网页抓取、AI 总结和首页 UI。
- 验收：无需选择知识库即可记录；转换失败不丢内容；同一幂等键只创建一个文档。
- 验证：DTO 单元测试、转换集成测试。

## KB-05 实现回收站与到期清理

- 依赖：KB-02、KB-03。
- 必读：`docs/01-design/pages/knowledge-base.md`、`docs/02-architecture/data-model.md`、`docs/02-architecture/system.md`。
- 目标：软删除/恢复知识库和文档子树，并由 Worker 永久清理超过 30 天对象。
- 实施：保存原位置；缺失父节点恢复到库根；知识库未恢复时拒绝单独恢复其文档。
- 非目标：附件物理清理和分享快照。
- 验收：子树完整恢复；永久清理可重试且不影响未到期对象；清理有结构化结果。
- 验证：时间控制集成测试、Worker 幂等测试。

## KB-06 接入知识库与首页 UI

- 依赖：UI-05、KB-02..05。
- 必读：`docs/01-design/pages/home.md`、`docs/01-design/pages/knowledge-base.md`、`docs/01-design/layout-and-navigation.md`。
- 目标：接入首页、知识库列表、树、Inbox 和回收站的真实 API。
- 实施：局部加载/错误、乐观视觉移动与失败回滚、桌面创作和移动只读能力表。
- 非目标：正文编辑器、搜索和 AI。
- 验收：首页可创建并进入知识库；树移动错误正确回滚；Inbox 和恢复闭环可用。
- 验证：组件集成测试、Playwright 知识库树/Inbox/回收站流程。

## 检查点

运行 Knowledge API/Worker 集成测试、知识库 E2E 和 `pnpm check`；检查数据库没有可形成知识库嵌套的字段或接口。
