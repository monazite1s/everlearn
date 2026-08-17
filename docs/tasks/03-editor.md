# 里程碑 03：编辑器与修订

完成后桌面端具备稳定块编辑、自动保存、修订恢复和附件展示；移动端使用独立只读渲染器。

## ED-01 建立 Tiptap Schema 与 Block ID

- 状态：已完成（2026-08-17，子 agent 实现 + 主 agent 复验）。
- 依赖：KB-03、UI-02。
- 必读：`docs/01-design/pages/editor.md`、`docs/02-architecture/data-model.md`、`docs/03-engineering/research-and-dependencies.md`。
- 目标：配置批准的 Block、Markdown 快捷输入、Slash Menu 和稳定 `blockId` 扩展。
- 改动：新增 editor feature——`editor-schema.ts`（schemaVersion 1 节点/标记/标题层级常量与 StarterKit 配置）、`block-id.ts`（blockId 扩展：新建分配、复制重分配、拆分保留原块、合并保留幸存块、导入补齐、文档内唯一不变量）、`parse-document-json.ts`（信任边界收窄：非 doc/未知节点/未知标记/非法 blockId/越界标题层级/恶意深度拒绝）、`slash-menu.tsx`（官方 suggestion + shadcn Command，键盘导航与中英文过滤）、`rich-text-editor.tsx`（最小组件，`immediatelyRender: false`）；`packages/ui` 经 shadcn CLI 安装 Command 组件。
- 依赖：`@tiptap/core|react|starter-kit|pm|suggestion@3.30.1` + `cmdk@1.1.1`（Command 底层；版本与必要性逐包核对，React 19 peer 兼容）。里程碑 03 既定选型，用户完成里程碑 03 的指令即批准。
- 复用与评审：SlashMenu 用官方 `@tiptap/suggestion`（char `/` + mount 托管定位）+ CLI 安装的 Command 组件，未自研菜单交互；独立 code-reviewer 评审 `REQUEST_CHANGES`，M1（heading level 5 穿透信任边界——Tiptap content check 不校验 attr 值域）已修：`APPROVED_HEADING_LEVELS` 常量共享给 schema 与解析器并补越界/非整数用例；undo/redo 唯一性回归（重复导入、拆分各一轮）与死导出清理随评审补齐；link `javascript:` 穿透经 jsdom 探针排除（Tiptap attr 层清空）。
- 验证结果：editor 组件测试 3 文件 `44 passed`（parse 拒绝矩阵 19+、blockId 规则表 12 含 undo/redo、编辑器 6）；全量组件 `101+ passed`；Web/UI typecheck、聚焦 ESLint、Prettier、注释/文件/design-token/structure 门禁与生产构建通过。
- 证据：全部批准节点+标记 JSON→Editor→JSON 深度相等且双实例 ID 逐块稳定；KB 最小正文 `{type:'doc',content:[]}` 兼容加载；重复 ID 导入→undo→redo 全程唯一；level 5 与 1.5 层级被拒绝。
- 风险：`trailingNode: false`（与 blockId 初始化修复链时序冲突，`ponytail:` 已标注，ED-05 需要时专项启用）；同文档粘贴于源块前 ID 漂移（唯一性不受影响，跨文档重映射属 ED-02）；SlashMenu 视觉定位依赖官方 Floating UI autoUpdate，真实浏览器走查留待 ED-05 接入页面时；`parseDocumentJson` 与 ED-02 服务端校验为人工镜像，需契约测试锁定；Tiptap/cmdk 版本未走 pnpm catalog（第二包引用时迁移）。

## ED-02 实现正文保存与冲突

- 状态：已完成（2026-08-18，子 agent 实现 + 主 agent 复验）。
- 依赖：ED-01、KB-03。
- 必读：`docs/01-design/pages/editor.md`、`docs/02-architecture/api-and-events.md`、`docs/02-architecture/data-model.md`。
- 目标：实现标题/正文统一版本的防抖保存和服务端 Schema/Block ID 校验。
- 契约定稿：`GET /documents/:id/content` 返回 `DocumentContentDetail`（分裂投影——树/详情投影不携带正文，既有消费者不变）；`PATCH /documents/:id/content` 请求 `{ contentJson, schemaVersion, title?, version }`，成功 200 返回同投影；版本不符 409 `VERSION_CONFLICT`；内容/版本非法 422 `UNPROCESSABLE_ENTITY`（错误码闭集扩展）。无幂等键——PATCH+version 乐观并发与 rename 同范式（响应未知重放由版本域约束），报告声明。
- 服务端校验：单次遍历完成校验与 `plain_text` 派生（块间 `\n\n`、hardBreak 折叠 `\n`，不信任客户端）；类型闭集/标题层级/深度 64/blockId 必填且文档内唯一（服务端按 data-model 比客户端读路径严格）。镜像锁定三重：web/api 常量全部 `@everlearn/contracts` 单源（含 `DOCUMENT_BLOCK_ID_PATTERN` UUID 正则）、两侧场景矩阵断言同一清单、双端语义差异由集成测试显式断言。
- Web：`use-debounced-save`（`SAVE_DEBOUNCE_MS=800`）状态机 idle/saving/saved/conflict/failed——成功推进版本基线；409 停止覆盖提交并保留最新本地内容（`copyLocalContent()` 供复制）；网络失败下次输入或手动重试；提交中输入完成后重调度；卸载 fire-and-forget flush。请求层 `editor-api.ts` 置于 editor feature（knowledge 客户端属相邻切片禁区，请求骨架约 60 行复制已在风险登记）。
- Outbox 决策：仓库无 outbox 表（与 api-and-events.md 存在文档缺口）——保存事务内接线点已留（`ponytail:` + `DocumentSavedEventPayload` 版本化契约），最小迁移提案已写入交付报告；表创建延后至首个消费方任务（SEARCH 索引/链接投影），避免写入无消费者的投机结构（YAGNI），触发条件与缺口已在风险栏登记。
- 复用与评审：锁序复用 move 范式（KB 行→文档行，409 锁内比对）；防抖保存不建修订（集成断言修订数不变，ED-03 边界）；中断恢复上下文（预置 contracts 常量经审查全部保留并补 `DOCUMENT_BLOCK_ID_PATTERN` 与 422 错误码两处缺口）。主 agent 复验：typecheck 三包、聚焦 ESLint/Prettier、注释（222 文件 1813 条）、文件限制、内容集成 8/8、editor 组件 48/48、全量组件 147 与单元 55 回归。
- 验证结果：contracts/api/web typecheck、聚焦 ESLint、Prettier、注释/文件/结构/token 门禁通过；真实 PostgreSQL 集成 `document-content.integration.spec.ts` 8/8（roundtrip 深相等+blockId 保留、冲突胜者完整保留且败者不落库、并发一胜一 409、防抖不建修订、422 拒绝矩阵）；editor 组件测试 48/48（防抖聚合、基线推进、409 停止覆盖、失败重试、复制本地内容、卸载 flush）。
- 证据：保存→GET roundtrip `contentJson` 深相等；并发 `Promise.all` 一胜一 409；web 生产构建未在本任务执行（并行任务占用 api/worker 面，ED-05 接线时统一跑——组件测试与 typecheck 已覆盖本切片）。
- 风险：outbox 表延后创建（内容/影响：检索块与链接投影在消费方任务前不刷新；移除触发：SEARCH-01 或首个投影消费任务落地时按提案建表并接线）；卸载 flush 浏览器关闭丢 ≤800ms 窗口（`ponytail:` 已标注，ED-05 评估 sendBeacon）；`plainText` 派生为首期约定（`\n\n`/`\n`），分块任务变更时同步两侧测试；editor-api 请求骨架与 knowledge 客户端重复约 60 行（ED-05 接线时评估上移 shared）。

## ED-03 实现智能修订与恢复

- 状态：已完成（2026-08-18，子 agent 实现 + 主 agent 复验）。
- 依赖：ED-02。
- 必读：`docs/01-design/pages/editor.md`、`docs/02-architecture/data-model.md`。
- 目标：在离开、持续编辑间隔、AI 接受、导入和恢复事件创建不可变修订。
- 契约：`POST /documents/:id/revisions`（source 服务端恒为 manual，防伪造；标题缺省取文档当前值）、`GET .../revisions`（游标倒序，条目含服务端截取 200 字符摘要）、`GET .../revisions/:revisionNumber`（全文预览）、`POST .../revisions/:revisionNumber/restore`（单事务：读修订→版本校验→回写文档内容/纯文本/Schema/标题且 version+1→插入 `source='restore'` 修订→返回新当前内容投影；历史从不删除）。错误码复用闭集。
- 幂等设计：相邻快照去重（文档行锁内与最新修订内容+标题深相等则跳过插入返回既有 201）——否决全局 content_hash 唯一约束（同一内容允许多次合法进入历史是产品语义：恢复→编辑→再恢复）；创建仅拒绝超前版本（滞后续订兼容保存 flush 竞态）；恢复重放旧版本走 409 乐观并发。AI 接受/导入触发经 `DOCUMENT_REVISION_SOURCES` 契约常量与服务层 `insertRevision(source)` 留接入点（不经过本端点）。
- 迁移：`document_revisions.title` NOT NULL + 1..200 CHECK（与 documents.title 对齐），事务内回填存量后加约束；down 对称；迁移清单断言 spec 同步。
- 触发器（web）：`use-revision-triggers`——离开（卸载 fire-and-forget，与保存 flush 同语义）+ 持续编辑间隔（`REVISION_INTERVAL_MS=5min` 常量声明，有变更才提交）+ `use-revision-preview`（loading/loaded/failed/retry）。
- 路径偏离修正：api-and-events.md 的修订恢复路径已更正为嵌套 `/revisions/:revisionNumber/restore`（原 `/documents/:id/restore` 已被回收站恢复占用，事实源先行修正）。
- 复用与评审：锁序复用模块范式（KB→文档行）；ED-02「防抖保存不建修订」边界经双重锁定（既有 8/8 回归 + 新增专项断言）。独立 code-reviewer 评审结论见下。
- 验证结果：主 agent 独立复跑——全量集成 109/109（前次单轮 3 失败为已登记并行偶发，复跑全绿）、unit 60/60、editor 组件 57/57、全仓 typecheck；子 agent 交付时全量 lint/format/注释（243 文件 1993 条）/文件/结构门禁通过。
- 证据：修订矩阵 11 项集成（含恢复后历史 [1,2,3,4] 完整、HTTP 层 PATCH/DELETE 404 且行数不变、并发恢复一胜一 409、重复提交与重复恢复去重、摘要边界截断）；触发器组件 5 项（间隔提交/无变更不重复/卸载 flush/失败重试/确定结论后停）；预览恢复 4 项。
- 风险：卸载 fire-and-forget 浏览器关闭丢末次修订（`ponytail:` 标注，与保存同天花板，ED-05 评估 sendBeacon）；恢复目标恰为最新非 restore 修订时仍插入内容相同 restore 行（保留动作标记的有意行为，产品语义变更时回改去重条件）；迁移清单硬编码断言随新迁移再次触及（既有测试结构债）；web 生产构建与浏览器走查随 ED-05 页面统一执行。

## ED-04 实现附件上传与生命周期

- 依赖：FND-08、ED-01。
- 必读：`docs/01-design/pages/editor.md`、`docs/02-architecture/system.md`、`docs/02-architecture/api-and-events.md`。
- 目标：支持图片预览、普通附件下载、受限上传确认和孤儿清理。
- 实施：校验大小/MIME/哈希；对象先 pending，正文引用后 active；下载经所有权授权。
- 非目标：PDF/Office 解析、OCR、转码和 AI 检索。
- 验收：失败上传可重试且不写无效 Block；未授权对象不可下载；孤儿清理幂等。
- 验证：SeaweedFS S3 集成测试、授权测试、编辑器上传 E2E。

## ED-05 实现编辑器页面与工具栏

- 依赖：ED-01..04、KB-06W。
- 必读：`docs/01-design/pages/editor.md`、`docs/01-design/design-system.md`、`docs/01-design/layout-and-navigation.md`。
- 目标：接入文档树、面包屑、编辑器、保存状态、属性和修订侧栏。
- 实施：桌面完整编辑；移动只加载只读渲染器；表格和代码局部滚动；键盘覆盖工具栏和 Slash Menu。
- 非目标：AI 与反向链接面板。
- 验收：编辑不中断导航；保存/冲突/删除/离线状态符合规格；移动端无编辑实例。
- 验证：组件、axe、Playwright 桌面/移动与视觉回归。

## 检查点

运行编辑器单元/组件、PostgreSQL/SeaweedFS S3 集成、自动保存与修订 E2E，再执行 `pnpm check`。
