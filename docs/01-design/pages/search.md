# 页面规格：全局搜索

## 目的与路由

- `/search`：在全部知识库或入口指定的当前知识库中查找文档标题与正文块。
- 顶栏搜索触发器与 `Cmd/Ctrl+K` 进入全部知识库范围；知识库概览的搜索入口携带当前知识库范围。
- 搜索不是一级导航，也不是通用 Command Menu。本任务不显示最近文档、新建文档或危险操作。
- 路由可刷新、可深链并进入浏览器历史。持久 AppShell 在进入前记录最后一个非搜索 href 和稳定触发器标识；关闭与 `Escape` 使用同一退出动作返回并恢复焦点。直接访问或刷新后没有来源记录时回到 `/knowledge`。

## 查询、筛选与排序

- 页面 URL 保存 `query`、`scope`、`knowledgeBaseId`、`field` 与 `updatedWithin=any|24h|7d|30d`；刷新和分享可恢复同一查询，不保存已加载页数。首次进入使用 history push，输入与筛选同步只使用 replace，避免每次键入污染返回历史。
- `query` 去除首尾空白后长度为 1–200，匹配不区分大小写；SEARCH-02 不改变已索引标题或正文的 Unicode 规范形式。空查询不调用 Search API，只显示搜索引导；当前库范围详情仍按数据章节读取。
- `scope` 为 `all | knowledgeBase`：全部范围不得带 `knowledgeBaseId`；当前库范围必须带一个有效且可访问的知识库 ID。
- `field` 为 `all | title | content`，默认 `all`。更新时间首期提供不限、过去 24 小时、7 天和 30 天，前端向 API 发送对应 UTC `updatedAfter`。
- SEARCH-02 不显示也不提交标签筛选；`tagIds` 随 SEARCH-03 的标签模型和关联一起扩展。
- 输入停止 300ms 后搜索，Enter 立即提交；输入始终在 100ms 内给出本地反馈。结果按固定相关度、文档更新时间倒序和文档 ID 升序排列；用户不能切换排序。筛选或查询变化会取消旧请求、清空旧游标并从第一页重新读取。
- 相关度排序固定为 `rankTier ASC, rankScore DESC, updatedAt DESC, documentId ASC`。Tier 依次为标题精确、标题前缀、标题 FTS、标题字面子串、正文 FTS、正文字面子串；FTS 固定使用 `plainto_tsquery('pg_catalog.simple', trimmedQuery)`，全部有效 lexeme 为 AND，标点只作分隔，空 tsquery 不构成命中；字面 Tier 比较完整裁剪后查询。同一 Tier 的 FTS 使用 `ts_rank_cd`，字面命中使用 `similarity`，统一量化为六位小数。正文块并列按 Block 顺序与 Block ID 升序选取。

## 结果语义

- 每个文档最多返回一项。标题与正文同时命中时仍只显示一项，并采用该文档最高相关正文块作为摘要和定位目标。
- 结果显示知识库名称、祖先文档标题链、文档标题、更新时间、标题高亮和正文摘要；不得把内部物化 UUID path 直接暴露给浏览器。
- `matchedField` 为 `title | content | both`。仅标题命中时 `blockId` 为 `null`，打开文档顶部；正文或两者命中时返回真实稳定 Block ID。
- 正文结果在摘要上方显示 `readonly string[]` 形态、最多 4 层的 `headingPath`，每项最多投影 200 个 Unicode 字符，空路径不占位。
- 摘要与标题高亮由 `{ text, highlighted }` 纯文本分段组成，客户端逐段渲染文本节点；服务端不返回可注入的 HTML。标题保留完整文本且最多标记前 16 个命中，正文摘要最多 240 个 Unicode 字符并带首尾截断标识。
- 祖先链按根到父节点返回，最多 8 项；超限时保留根节点和最近 7 级并通过 `pathTruncated` 表示省略层级。每项只含公开文档 ID 与标题。
- 正文存在多个命中块时选相关度最高者，并列时按 Block 顺序与 Block ID 稳定选择。
- 打开正文结果使用 `?searchBlockId=<uuid>&searchDocumentVersion=<positive-int>`。正文加载后以已校验 UUID 精确查找 `data-block-id`：目标仍存在时临时设 `tabIndex=-1`，即使文档版本已变化也滚动、聚焦并短暂标识该块，版本变化时在正文起始位置以非模态 `role=status` 提示“文档已更新，已定位到原匹配位置”；目标不存在时聚焦正文起始状态提示“匹配内容已更新”。状态只播报一次，不把焦点交给桌面标题输入。标题-only 链接不带这两个参数。

## 桌面布局

- 顶栏显示真实搜索触发器，包含搜索图标、说明和快捷键提示；进入 `/search` 后由 Shell 的单一路由焦点规则优先聚焦标记为 `data-route-focus` 的搜索输入，其他页面仍聚焦 `data-page-title`，禁止两个 effect 竞态抢焦点。
- `/search` 的顶栏面包屑固定为“首页 / 搜索”，不激活任何一级侧栏导航。
- 主区是应用壳内的单一搜索结果层：第一行为搜索输入，第二行为范围摘要与带持续标签的字段、时间 Select，之后为结果列表和加载更多。当前库范围显示只读名称与“搜索全部知识库”次要操作，不在本任务提供任意知识库选择器。
- 结果以安静的分隔列表组织，不把每条结果装进独立重卡片；标题、路径、摘要和元信息通过字号、字重与语义前景色形成层级。
- 搜索页没有创作主操作。关闭是页面级次要操作，筛选变化不打开额外浮层。

## 移动端

- 390px 下搜索占满主内容宽度：返回操作单独一行，输入全宽，范围摘要单独一行，字段和时间两个 Select 各自全宽纵向排列；保留结果、加载更多和返回操作。
- ≤768px 的壳顶栏搜索触发器只显示 Search 图标并保留 `aria-label="全局搜索"`，隐藏说明与快捷键，不依赖 Tooltip 才能理解；不显示任何创建、编辑或配置操作。打开结果进入现有移动只读文档。
- 返回搜索页时保留 URL 中的查询与筛选；若浏览器保留页面状态，也保留已加载结果和滚动位置。

## 数据与接口

- 使用 `GET /api/v1/search`。请求参数为 `query/scope/knowledgeBaseId/field/updatedAfter/limit/cursor`，列表默认 20、最大 100；`scope` 默认 `all`，`field` 默认 `all`。`all` 禁止 `knowledgeBaseId`，`knowledgeBase` 要求 UUID；`updatedAfter` 必须是以 `Z` 结尾的 UTC RFC 3339 时间且查询语义为严格晚于。页面把相对时间范围在一次查询会话开始时转换一次，翻页复用相同时间；刷新后开始新会话。
- 响应为 `{ items, nextCursor, indexStatus }`；`indexStatus` 为 `ready | updating`。每项共有 `documentId/documentTitle/documentVersion/updatedAt/knowledgeBaseId/knowledgeBaseName/ancestors/pathTruncated/matchedField/titleSegments`，其中 `ancestors` 项为 `{ documentId, title }`，所有高亮数组项为 `{ text, highlighted }`。`matchedField=title` 时 `blockId/contentSnippet` 均为 `null`、`headingPath=[]`，标题至少一段高亮；`content` 时标题分段均不高亮，`both` 时标题与正文均有高亮。`content|both` 的 `blockId` 为 UUID，`contentSnippet={ segments, leadingTruncated, trailingTruncated }` 且正文至少一段高亮，并返回最多 4 层 `headingPath`。
- `field=title` 只会返回 `matchedField=title`，且 `indexStatus=ready`。`field=content` 只会返回 `content`；`field=all` 可返回三种值。包含正文时只返回投影头和 Block 版本都等于当前 Document 版本的内容。
- `updating` 只按当前 owner、Document/KnowledgeBase 生命周期、scope 和 `updatedAfter` 范围检查缺失或过期投影，不按 query 是否命中判断；已有有效结果仍可展示。
- 当前库空查询不调用 Search API，但会复用 `GET /knowledge-bases/:id` 验证范围并取得名称；加载时范围名使用 Skeleton 且输入和 Select 暂不可提交，网络失败可重试，404 不重试，离线无缓存进入离线冷启动。其状态独立于结果请求。
- 当前知识库不存在、已删除或不属于当前用户时统一返回 404，不显示名称。非法参数与空白查询沿用全局边界返回 `400 VALIDATION_FAILED`。
- 游标为最大 512 字符的规范 Base64URL，保存版本、Tier、六位小数相关度、微秒更新时间、文档 ID，以及 `query/scope/knowledgeBaseId/field/updatedAfter` 规范元组的 SHA-256 指纹；`limit` 与 cursor 自身不进入指纹。未知/重复参数、非法组合、畸形或跨查询游标统一返回 `400 VALIDATION_FAILED`，`details.fields` 指向对应字段。分页期间文档更新采用普通 keyset 语义，不承诺快照一致性；客户端仍按 `documentId` 去重。

## 状态与反馈

| 状态       | 行为                                                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 空查询     | 不发送 Search 请求；显示搜索范围说明和输入引导，不显示示例或伪结果。                                                                       |
| 首次加载   | 保留输入与筛选，结果区显示镜像列表 Skeleton，不使用全屏 Spinner。                                                                          |
| 零结果     | 保留查询；有非默认筛选时唯一主行动为清除筛选，默认筛选时改为聚焦并选中搜索词。当前库可用“搜索全部知识库”替代，但同一空态只保留一个主行动。 |
| 索引中     | 保留已返回结果，提示部分最新正文仍在索引，并提供刷新。                                                                                     |
| 首屏失败   | 保留查询与筛选；网络或服务失败提供就地重试。                                                                                               |
| 分页失败   | 保留已加载结果，在列表末尾说明后续结果加载失败并提供重试。                                                                                 |
| 加载更多中 | 保留已加载结果，禁用按钮并显示“正在加载更多结果”和列表尾镜像行。                                                                           |
| 分页结束   | `nextCursor=null` 时不渲染加载按钮，不额外制造终点卡片。                                                                                   |
| 离线       | 保留已加载结果与查询；禁用新搜索、筛选请求和加载更多，不承诺离线检索。                                                                     |
| 离线冷启动 | 没有缓存结果时显示离线说明；输入可读可复制，但不触发请求。                                                                                 |
| 无权限范围 | 显示统一不可访问状态，不显示知识库标题、不提供重试；唯一行动切换到全部知识库搜索。                                                         |
| 请求竞态   | 新查询取消旧请求；迟到响应不得覆盖当前查询。                                                                                               |

## 可访问性与动效

- 顶栏触发器、输入、筛选、结果和加载更多均可只用键盘操作；结果使用真实链接。在 `/search` 当前页再次点击触发器或按 `Cmd/Ctrl+K` 只聚焦现有输入，不重复 push 或覆盖来源记录；IME composing 时不处理快捷键。
- 搜索结果数量与索引状态在一次响应完成后通过克制的 `aria-live` 更新，不逐字播报输入。
- `Escape` 只在事件未被 `defaultPrevented` 且没有 Select 等子浮层消费时离开搜索；来源触发器仍存在则恢复焦点，直接访问的回退路径把焦点交给目标页标题。
- 高亮不能只靠颜色，使用语义 `mark` 文本结构；焦点环保持可见并满足 WCAG 2.1 AA。
- 只使用短暂颜色/边界过渡；减少动效时取消结果进入位移和命中块滚动动画。

## E2E 验收

1. 顶栏触发器和 `Cmd/Ctrl+K` 进入全部知识库搜索并聚焦输入；知识库概览入口进入当前库范围。
2. 中文和英文查询可命中真实 API 数据；范围、字段与更新时间筛选正确，连续分页无重复。
3. 标题-only 结果打开文档顶部；正文结果定位真实 Block；Block 已变化时回退顶部并提示内容已更新。
4. 空查询不发 Search 请求；零结果、索引中、首屏失败、加载更多、分页失败、离线与不可访问范围均符合状态表。
5. 恶意标题或正文只按文本渲染，不能产生脚本、事件属性或任意 HTML。
6. 浅色、深色、390px、reduced motion 和键盘流程通过真实浏览器与 axe Critical/Serious 零问题验证。

## 性能边界

- 一至两字符查询为已知性能风险：`pg_trgm` 无法保证提取有效 trigram，但中文单字检索仍属于产品能力。验收使用足量真实 PostgreSQL 夹具记录 1 字中文、英文 FTS 和常规中文子串的 `EXPLAIN` 与耗时；若首屏查询超过 300ms，则在发布前提升最小长度或引入经批准的中文检索方案。
- production build 下搜索输入本地响应不超过 100ms、页面 LCP 不超过 2.5s、搜索路由首屏 JS gzip 不超过 200KB。
