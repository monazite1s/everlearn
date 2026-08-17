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

- 状态：已完成（2026-08-18 后端与契约切片，子 agent 实现 + 主 agent 复验；编辑器上传 UI 与 E2E 属 ED-05 页面切片）。
- 依赖：FND-08、ED-01。
- 必读：`docs/01-design/pages/editor.md`、`docs/02-architecture/system.md`、`docs/02-architecture/api-and-events.md`。
- 目标：支持图片预览数据源、普通附件下载、受限上传确认和孤儿清理。
- 改动：`attachments` 表迁移（owner 全局对象、生命周期 CHECK `(pending∧0)∨(active∧>0)`、pending 清扫部分索引）；attachments 模块（预检/确认/下载/内部孤儿端点、SigV4 签名 Provider、引用计数服务）；contracts `attachment.ts`（闭集错误码与白名单常量）与 document 节点扩容（image/attachment 携带 blockId+attachmentId，未加 table/taskList/callout）；ED-02 校验器同步节点属性规则；保存/恢复/永久清理三处引用计数接线；Worker 第二个 Job Scheduler（固定 key，`0 4 * * *` 默认，经内部端点零 S3 依赖）。
- 设计要点：两段式上传——预检即落 pending 行并返回 Content-Type 约束的签名 PUT（15 分钟）；confirm 服务端 GetObject 流式复核实际大小/MIME/SHA-256，失败立即删对象+行（净效果等同「复核后入库」且免去 DB 外泄漏扫描，报告声明）；下载走 API 代理流式输出（授权单点，nosniff + 防注入 Disposition）；引用计数按文档保存全量重算差量（文档行锁内）；孤儿 TTL 以 updated_at 计（去引用对象自归零再保 24h）。
- 依赖决策：`@aws-sdk/client-s3`（Get/Delete）；presign 属独立包超出批准范围 → node:crypto 标准SigV4 查询签名（真实 SeaweedFS 探针：正确类型 200、错型 403），`ponytail:` 标注获批后可换官方 presigner。
- 复用与评审：错误信封扩 `ApiDomainException`（kind:'domain' 携带稳定码）；KB-12 内部端点密钥模式复用；独立 code-reviewer 评审 `REQUEST_CHANGES`（SigV4 签名逐行核验通过、下载注入防护通过、引用计数锁序通过），1 HIGH + 1 MEDIUM 已修——确认失败删除行改为「未确认且零引用」条件删除（消除悬空引用毒化回收站清理的路径，清理递减同步容忍缺失行）、confirm UPDATE 增加 `sha256 IS NULL` 守卫与重放分支（并发异哈希不再破坏已确认状态），并补并发 confirm 竞态与被引用保留两个回归（真实 S3 八连跑稳定）；LOW 处置：MIME 规范化后长度不足显式 TYPE_REJECTED，孤儿清理事务内删除加 `ponytail:` 一致性说明。主 agent 复验：attachments 集成 15/15、串行全量 126/126、unit 66/66、三包 typecheck、聚焦门禁全绿。
- 证据：预检拒绝矩阵（超限/非白名单/svg）；签名直传往返与错型 403；哈希/大小/类型复核失败删行删对象；确认幂等（同哈希同投影、异哈希 422）；他人对象下载统一 404；引用置 active/降级回 pending/多文档共享计数/未知引用整体 422；回收站保留引用、purge 递减；孤儿 TTL 边界（24h+1ms 删/23h 留/active 不删）与幂等重跑清零；根 tsconfig 单点 skipLibCheck 修复存量 happy-dom 类型冲突（干净树复现确认非本任务引入）。
- 风险：presign 自研签名（升级路径：批准 @aws-sdk/s3-request-presigner 后替换）；PUT 体积上限靠 confirm 复核兜底（签名无法限制 body 大小，失败路径已删对象）；孤儿 TTL 语义为「自最近生命周期变化」（要求「自创建」需加列，已登记）；S3 删除在行锁事务内（本地可忽略，高延迟对象存储改乐观删除）；DTO 长度字面量镜像契约常量（装饰器限制，既有先例）。

## ED-05 实现编辑器页面与工具栏

- 状态：已完成（2026-08-18，子 agent 实现 + 主 agent 复验 + code-reviewer 二审全部处置）。
- 依赖：ED-01..04、KB-06W。
- 必读：`docs/01-design/pages/editor.md`、`docs/01-design/design-system.md`、`docs/01-design/layout-and-navigation.md`。
- 目标：接入文档树、面包屑、编辑器、保存状态、属性和修订侧栏。
- 实施：桌面完整编辑；移动只加载只读渲染器；表格和代码局部滚动；键盘覆盖工具栏和 Slash Menu。
- 非目标：AI 与反向链接面板。
- 改动：新路由 `app/knowledge/[knowledgeBaseId]/documents/[docId]/page.tsx`（server component，404→删除态、500→错误态、离线检测）；editor feature 新增 18 文件——`editor-page`（布局分流：≥xl 三栏、lg 双栏+Sheet 面板、移动只读）、`document-session`（会话组合：保存/修订/附件三控制器 + 冲突信息拉取）、`editor-workbench`（重载/恢复 key 递增整体重挂）、`editor-title-bar`（面包屑+标题输入+保存徽标）、`editor-toolbar`（roving tabindex+行内链接输入）、`editor-side-panel`（修订/属性 Tabs 与 Sheet 双形态）、`revisions-panel`（时间轴+预览+恢复确认）、`properties-panel`（属性+附件引用清单）、`readonly-document`（移动端 `generateHTML` 共享 schema 渲染）、`editor-content.css`（prose 排版）、attachment 节点视图/确认对话框/上传 hook 等；knowledge 树最小 diff 接入 `activeDocumentId` 高亮与行链接（可选 prop，7 测试回归）；packages/ui 经 CLI 安装 Tabs/Progress；`@tiptap/html` 获批引入（移动端只读序列化）。
- 设计要点：会话三层结构 workbench（替换语义）→ session（控制器组合）→ 面板/工具栏（纯展示），重载与恢复统一走 `replaceSession`（丢弃保存/修订本地快照后整体重挂，新版本即新基线）；冲突只读三件套（editor editable=false + toolbar aria-disabled + title readOnly）+ 冲突期间修订触发失能；`omitPendingAttachments` 在 stageSnapshot 统一剔除未确认占位（保存与修订共用）；共享 `createEditorSchema` 单事实源，移动端零 ProseMirror 实例；`--width-prose` 经 `@theme inline --container-prose` 映射为官方 `max-w-prose` utility。
- 复用与评审：Tabs/Sheet/AlertDialog/Badge/Skeleton/Breadcrumb/Tooltip 全部 shadcn；独立 code-reviewer 二审 `REQUEST_CHANGES`（1 HIGH + 7 MEDIUM + 8 LOW）已全部处置——H-1 工具栏 roving 焦点改为 ref 数组实际 `focus()` 并放行文本输入内方向键（测试升级为 `toHaveFocus` + 新增输入放行断言）；M-1 冲突抑制修订（`triggers.reset()` + stage 守卫，测试锁定间隔与卸载零提交）；M-2/L-5 标题栏对齐正文列并改用官方 container utility；M-3 补 `omitPendingAttachments` 专项 4 测试 + 会话级 PATCH 剔除断言；M-4 删除重复 `EditorApiFailure`；M-5 新建 `shared/api-request.ts` 统一请求/信封/守卫骨架（editor-api、attachment-upload-api、properties-panel 迁移，`attrString` 收敛到 attachment-nodes 导出；knowledge 客户端迁移留 V2 债）；M-6 spinner/skeleton 补 `motion-reduce:animate-none`；M-7 恢复基线回归（发现并修复同族缺陷：卸载阶段编辑器末次事务重 stage 旧内容——`discard`/`reset` 置失能标志，恢复后全部 PATCH 断言 version=5）；L-1 单事实源导入、L-2 属性式 onOpenChange 删除 eslint-disable、L-4 重挂后焦点交还标题输入（autoFocusTitle）、L-6/L-7/L-8 记录于风险栏、块级 react-hooks/refs 豁免理由修正为准确表述。另修测试稳定性：editor-page 树高亮断言改为 waitFor 锚元素（全量并行下偶发）。
- 验证结果：主 agent 独立复跑——组件 196/196（连续三轮稳定；agent 交付时新增 33 个，评审处置阶段新增 8 个，合计 41）；typecheck、lint（注释 295 文件 2483 条 + eslint + stylelint + structure/design-token/file-size 门禁）、format:check、web 生产构建（`ƒ /knowledge/[knowledgeBaseId]/documents/[docId]`）全部通过；真实浏览器走查 9/9（桌面浅/深三栏+树高亮、输入触发防抖保存、修订时间轴、属性页签、工具栏 roving、1000px Sheet、390px 无编辑实例只读、sticky 工具栏）+ 截图 6 张目视核对（亮/暗/保存中/修订/Sheet/移动）全部通过；评审修复复核 5/5（方向键实际移动焦点、链接输入方向键不劫持、标题栏与正文列对齐、桌面与移动 axe 扫描 zero serious/critical 违规）。
- 证据：走查脚本对真实 API（含附件端点）驱动：连续输入 800ms 后徽标转「保存中→已保存」且 PATCH body 剔除占位；冲突由旧版本 PUT 触发 409 后三件套只读生效；恢复经 AlertDialog 确认产生新修订且时间轴即时追加；移动端 DOM 无 `[contenteditable]`；axe（wcag2/2.1 a+aa）桌面与移动均无 serious/critical。
- 风险：移动端只读暂缺目录（TOC）——editor.md L60 要求「正文、目录、内部链接和引用」，正文/链接已满足，TOC 属规格偏差待产品决策（补实现或修订规格），已登记里程碑回顾处置；附件重试为全量重建上传（新 attachment 行），幂等由服务端孤儿清理 24h TTL 兜底；卸载 fire-and-forget（保存与修订）浏览器直接关闭丢末次窗口——sendBeacon 评估结论：`fetch keepalive` 有 64KB body 上限而 contentJson 可超限，非无损方案，维持 `ponytail:` 天花板标注（正式方案随离线编辑任务立项）；请求骨架 knowledge 客户端仍持一份复制（V2 债，跨切片迁移）；视觉回归基线未建立（按 vibe 标准需单独获批）；Playwright 走查脚本为临时产物未入库（E2E 正式化随首个 E2E 任务统一立项）。

## 检查点

运行编辑器单元/组件、PostgreSQL/SeaweedFS S3 集成、自动保存与修订 E2E，再执行 `pnpm check`。
