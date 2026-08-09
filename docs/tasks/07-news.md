# 里程碑 07：资讯自动化

完成后用户配置一次订阅即可按每日/每周持续生成直接发布、来源可追溯的资讯知识库文档。

## NEWS-01 实现 Search/RSS Provider

- 依赖：AI-01、WFR-04。
- 必读：`docs/02-architecture/ai-workflow-runtime.md`、`docs/03-engineering/research-and-dependencies.md`、`docs/02-architecture/system.md`。
- 目标：实现 Tavily Search Adapter 与 RSS/Atom Adapter 的统一来源投影。
- 实施：规范 URL、超时/大小/协议限制、错误分类；只返回元数据、摘要和必要短摘录。
- 非目标：登录抓取、浏览器自动化和完整网页归档。
- 验收：单源失败隔离；SSRF/超大响应被拒绝；业务不依赖 Tavily 响应结构。
- 验证：Provider 契约、恶意 URL 安全、固定 Feed 集成测试。

## NEWS-02 实现订阅模型与 API

- 依赖：KB-02、WFR-07、NEWS-01。
- 必读：`docs/01-design/pages/news.md`、`docs/02-architecture/data-model.md`、`docs/02-architecture/api-and-events.md`。
- 目标：管理主题、来源、包含/排除关键词和每日/每周计划，并确保系统资讯知识库存在。
- 实施：创建订阅同时管理 Schedule；停用只停未来触发；保存配置版本。
- 非目标：简报生成和页面。
- 验收：计划与时区显示一致；停用保留历史；系统资讯库每个用户最多一个。
- 验证：DTO/领域、Schedule 集成、并发创建测试。

## NEWS-03 实现来源规范化、去重与排序

- 依赖：NEWS-01、NEWS-02。
- 必读：`docs/02-architecture/data-model.md`、`docs/02-architecture/ai-workflow-runtime.md`。
- 目标：按规范 URL、内容指纹和时间窗口去重，并按相关性、时效和来源质量排序。
- 实施：记录采用/跳过原因；关键词先做确定性过滤，再用 LLM 处理模糊相关性。
- 非目标：个性化推荐模型和用户行为学习。
- 验收：重复条目只保留一次；排除词确定生效；排序结果有可解释分项。
- 验证：去重/排序单元、混合来源集成测试。

## NEWS-04 建立简报 Workflow 模板

- 依赖：NEWS-03、WFR-05。
- 必读：`docs/02-architecture/ai-workflow-runtime.md`、`docs/01-design/pages/news.md`、`docs/02-architecture/data-model.md`。
- 目标：实现获取、筛选、单项摘要、聚合、引用校验、质量检查和文档发布的系统模板。
- 实施：订阅+窗口生成幂等键；成功或警告均发布；全源失败生成失败说明文档，不生成无来源结论。
- 非目标：人工审核门槛和外部发布。
- 验收：同一运行重试只更新同一文档新修订；警告与失败步骤一致；引用链接完整。
- 验证：伪 Provider 端到端 Worker、幂等和部分失败测试。

## NEWS-05 实现资讯页面

- 依赖：NEWS-02、NEWS-04、UI-03。
- 必读：`docs/01-design/pages/news.md`、`docs/01-design/design-system.md`、`docs/01-design/layout-and-navigation.md`。
- 目标：实现订阅列表/表单、最近简报和运行详情，移动端只读。
- 实施：局部状态、立即运行、停用、来源结果和步骤重试；完成只显示页面内 Toast。
- 非目标：全局通知中心和移动配置。
- 验收：所有配置字段与下次时间明确；运行详情可追溯每个来源；警告跳转到成品文档。
- 验证：表单/时区组件、axe、Playwright 订阅与手动运行。

## NEWS-06 验证计划自动发布

- 依赖：NEWS-04、NEWS-05。
- 必读：`docs/01-design/pages/news.md`、`docs/00-product/release-roadmap.md`。
- 目标：建立每日/每周自动触发、部分失败、重试和进程重启 E2E。
- 实施：测试时钟和伪来源；验证 Scheduler、Workflow Run、DigestRun、文档和修订关联。
- 非目标：真实付费搜索调用和长时间等待测试。
- 验收：计划时间只生成一份简报；部分失败带警告直接发布；重启不重复。
- 验证：Docker E2E、运行/文档数据库断言、Trace 证据。

## 检查点

运行 NEWS 全部单元/集成/E2E 与 `pnpm check`；人工检查成品没有保存或展示外部完整正文。
