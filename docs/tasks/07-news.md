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

### 进度（2026-09-02，速度优先裁剪交付）

- 已交付：NEWS-01 最小版（rss-parser RSS/Atom 适配，URL 规范化 + 指纹去重 + 关键词过滤；Tavily Search Provider 未做）；NEWS-02（订阅 CRUD + 自动维护「资讯」知识库 + BullMQ 计划）；NEWS-03（确定性去重与排序，LLM 相关性未做）；NEWS-04（LLM 中文简报写入资讯知识库，同日幂等近似）；NEWS-05 最小资讯页。
- 有意裁剪：内网地址黑名单等 SSRF 完整防护、运行详情 SSE、部分失败警告结构（全部失败即 run 失败）、E2E 自动发布验证（NEWS-06）。已用 ponytail 注释登记。

### 补充交付（2026-09-02 第二批）

- M4 门禁「计划时间只生成一份简报」已验证：`news-automation.integration.spec.ts` 6/6——真实 RSS 源 + OpenAI 兼容 mock LLM 的执行闭环（抓取→过滤→LLM→简报文档落入资讯知识库、标题「资讯简报 YYYY-MM-DD」、含来源链接且 utm 剥离）；同日重复计划触发返回同一 runId；终态重复 complete 被守卫拒绝（顺带修复 `numUpdatedRows`/`numChangedRows` 字段读错的真实 bug）；停用订阅从调度清单消失。
- 遗留：E2E 浏览器层的 NEWS-06 未做（集成层已覆盖同一语义）。

### 正式化交付（2026-09-04）

- NEWS-01 补齐：Tavily Web 搜索 Provider（`SEARCH_PROVIDER/SEARCH_API_KEY/TAVILY_BASE_URL`，未配置整体降级）；RSS 抓取前置 SSRF 私网/环回/链路本地地址守卫。
- NEWS-03/04 补齐：LLM 批量相关性判定（失败降级保留全部并记警告）；每条来源 adopted/skipped+原因落库可追溯；adopted<3 结构化「来源不足」警告；全源失败生成失败说明文档。
- NEWS-05 补齐：运行详情（警告条、来源 ✓/✗ 明细、失败重试按钮）进资讯页。
- 门禁「计划任务自动触发」在浏览器层达成：真实 Worker + mock Tavily/LLM 的 E2E（news-detail.spec）与 18 用例全量 E2E 稳定通过。
- 顺带修复：BullMQ 6 禁止 jobId 含 `:` 导致三个队列投递静默失败（P0，改 `-` 分隔）；自动化写入 content_json 形态错误导致其文档永不进搜索且全站 indexStatus 恒 updating（P1，改为编辑器 schema v1 形态）；终态守卫字段误读（前批）。
- 遗留：`allowPrivateFeedUrls` 测试缝未接 Worker 进程 env（浏览器级真实 RSS 抓取用例待补）；订阅级自定义相关性主题未做。

### 2026-09-05 重设计方案（质量优先）

方案事实源：`docs/00-product/product-spec.md`（资讯节）、`docs/01-design/pages/news.md`、`docs/02-architecture/data-model.md`（News 节）、`docs/02-architecture/api-and-events.md`。以下任务供后续认领，编号接续 NEWS-06：

- NEWS-07 条目独立入库迁移：新增 `news_items`（列、约束、索引按 data-model News 节执行），`SourceItem` 数据迁移为 `NewsItem`，`digest_items` 改挂条目；迁移带可回滚 down，真实 PostgreSQL 验证。
- NEWS-08 GLM Provider 接入：搜索与 LLM Provider 采用 GLM（业务只依赖 Provider 接口，Tavily 保留为可替换实现）；未配置时整体降级并如实提示。
- NEWS-09 相关性判定修复与 JSON 提取健壮化：判定主题必须取订阅自身主题（清除硬编码，对应上批「订阅级自定义相关性主题未做」遗留）；LLM 结构化输出解析带重试与失败降级（accepted+normal+运行警告），留聚焦测试。
- NEWS-10 条目 API：`GET /news-items`（主题/来源类型/重要性过滤 + keyset 游标与条件指纹）、`GET /news-items/:id`、`GET /news-digests`；DTO 校验、所有权过滤、游标边界测试。
- NEWS-11 条目流页面：Tabs「条目流｜简报」、过滤行、形状语言与主题色点（chart-1..5 色槽）、42rem Sheet 详情（移动全屏）、`?item=` 深链、`?run=` 运行详情、`j/k` 键盘流、状态表全部行为。
- NEWS-12 简报 tab 与聚合改造：置顶摘要卡 + 按日列表；简报改为条目聚合、不复制条目正文。
- NEWS-13 订阅管理收敛页头 DropdownMenu/弹窗；移动端只读边界（隐藏创建、编辑、立即运行、启停）。
- NEWS-14 E2E 更新：条目独立性、深链恢复、双通道标签、状态表、axe/390px/reduced motion；既有简报自动化用例迁移到新页面结构。

## 技术债登记（2026-09-05 评审）

以下缓办项经评审确认不在本轮修复，逐条登记内容、影响与升级条件：

1. 领取事务持锁时长：`claimPendingDigestRuns` 在 `forUpdate` 锁内联查订阅来源、seenHashes（上限 500）与 recentItemTitles（上限 20），持锁时长随条目量线性增长；已加 `skipLocked()` 避免多消费者排队阻塞。升级条件：多 worker 部署或领取延迟可观测恶化时，改为锁内只置 running、锁外装配上下文。
2. 上游错误不分级：`NEWS_SEARCH_FAILED`/`NEWS_LLM_FAILED` 把上游网络失败、非 200、解析失败折叠为单一 502，Provider 在折叠时已丢失原始状态码；搜索路径的上游错误类型与报文摘要存服务端结构化日志（`news.search.upstream.failed`），LLM 路径暂无等价日志。升级条件：需要向用户区分「配置错误可自愈」与「上游瞬时故障」时细分错误码并保留状态码入日志。
3. 相关性判定降级全保留：`judgeNewsDigest` 任一失败（LLM 报错或输出不可解析）降级为全保留 + normal 重要性 + 空摘要，仅以运行警告体现。升级条件：简报质量投诉或 importance/summary 成为主路径时引入重试与人工复核。
4. 同日幂等近似：`createScheduledDigest` 以「当天已有运行即跳过」近似 scheduleId+scheduledAt 幂等（ponytail 已注明）。升级条件：出现跨天重放或错过补跑需求时改为精确幂等键。
5. 经验常量未配置化：`MAX_ITEMS=8`、`SUMMARY_LIMIT=120`、`listRuns` limit 20、seenHashes 500 等为硬编码。升级条件：出现分页或订阅级定制需求时入配置。
6. 双份同源实现未下沉：json-extraction（api/ai 与 worker/tutorials）、搜索 Provider 契约（api/web-search 与 worker/tutorial-research）因跨包限制逐行复制维护，ponytail 已注明下沉条件。升级条件：任一份需要独立演化或出现第三处复用时抽到 packages。
