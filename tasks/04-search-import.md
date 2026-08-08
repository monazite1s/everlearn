# 里程碑 04：搜索与知识连接

完成后用户可跨知识库检索到 Block、使用标签和双向链接，并以 Markdown 交换内容。

## SEARCH-01 建立文本投影与全文索引

- 依赖：ED-02、FND-05。
- 必读：`docs/02-architecture/data-model.md`、`docs/02-architecture/ai-workflow-runtime.md`、`docs/02-architecture/system.md`。
- 目标：消费 `document.saved`，生成纯文本和 `SearchBlock`，建立 PostgreSQL FTS 索引。
- 实施：按 Block ID、修订和内容哈希幂等更新；删除/恢复同步可见性；失败可由扫描任务重建。
- 非目标：Embedding 与向量召回。
- 验收：保存最终可检索；重复事件无重复块；已删除文档不返回。
- 验证：投影单元测试、Outbox/Worker/PostgreSQL 集成测试。

## SEARCH-02 实现全局搜索 API 与页面

- 依赖：SEARCH-01、KB-06。
- 必读：`docs/01-design/pages/knowledge-base.md`、`docs/02-architecture/api-and-events.md`、`docs/01-design/layout-and-navigation.md`。
- 目标：实现跨全部知识库搜索、当前库范围和标题/正文/标签/更新时间筛选。
- 实施：游标分页；结果包含文档路径、Block ID 和安全高亮片段；顶部搜索与快捷键打开结果层。
- 非目标：语义搜索和 AI 回答。
- 验收：结果只含可访问内容；点击定位匹配 Block；空、加载和索引中状态明确。
- 验证：搜索集成测试、Playwright 筛选与定位。

## SEARCH-03 实现标签

- 依赖：KB-01、SEARCH-02。
- 必读：`docs/02-architecture/data-model.md`、`docs/01-design/pages/editor.md`。
- 目标：实现标签创建、规范化去重、文档关联和搜索筛选。
- 实施：标签按所有者唯一；编辑器属性侧栏支持添加/移除；删除标签不删除文档。
- 非目标：层级标签、标签权限和自动 AI 打标。
- 验收：大小写/空白规范化后不重复；跨用户不可复用；筛选结果正确。
- 验证：领域测试、API 集成、编辑器组件测试。

## SEARCH-04 实现内部链接与反向链接

- 依赖：ED-01、SEARCH-01。
- 必读：`docs/01-design/pages/editor.md`、`docs/02-architecture/data-model.md`、`docs/02-architecture/api-and-events.md`。
- 目标：通过标题搜索插入内部链接，并由内容投影维护反向链接。
- 实施：链接记录来源 Block；目标删除保留失效状态；右栏分页展示反向引用。
- 非目标：知识图谱和跨账号公共链接。
- 验收：保存后目标显示来源；移除链接后反向记录消失；失效链接不崩溃。
- 验证：链接解析单元、投影集成、Playwright 双向跳转。

## SEARCH-05 实现 Markdown 导入导出

- 依赖：ED-01、ED-04、KB-03。
- 必读：`docs/00-product/product-spec.md`、`docs/02-architecture/api-and-events.md`、`docs/02-architecture/data-model.md`。
- 目标：支持单 Markdown、附件 ZIP 导入，以及知识库/文档子树 Markdown ZIP 导出。
- 实施：异步运行；清理不可信 HTML/URL；映射 Block ID、内部链接和附件；导入失败不留下半棵树。
- 非目标：Notion/语雀专用迁移和 DOCX/PDF。
- 验收：导出再导入保持树、正文和可访问附件；冲突 ID 重建；失败事务可清理。
- 验证：转换 round-trip、恶意输入安全测试、Worker 集成和 E2E。

## 检查点

执行搜索/投影/导入集成、双向链接和 Markdown E2E、`pnpm check`；抽样核对结果高亮不产生 XSS。
