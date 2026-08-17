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

- 依赖：ED-01、KB-03。
- 必读：`docs/01-design/pages/editor.md`、`docs/02-architecture/api-and-events.md`、`docs/02-architecture/data-model.md`。
- 目标：实现标题/正文统一版本的防抖保存和服务端 Schema/Block ID 校验。
- 实施：保存成功更新版本；409 停止覆盖并保留本地内容；写 Outbox 事件供投影处理。
- 非目标：自动合并、离线编辑和修订策略。
- 验收：刷新恢复内容；冲突不覆盖任一版本；保存失败可重试和复制本地内容。
- 验证：API 集成、并发测试、Playwright 保存/失败恢复。

## ED-03 实现智能修订与恢复

- 依赖：ED-02。
- 必读：`docs/01-design/pages/editor.md`、`docs/02-architecture/data-model.md`。
- 目标：在离开、持续编辑间隔、AI 接受、导入和恢复事件创建不可变修订。
- 实施：防抖保存不逐次建修订；恢复先读取预览，再创建 `restore` 来源新修订。
- 非目标：逐字差异算法和多用户版本合并。
- 验收：历史修订不可修改；恢复不删除后续历史；同一触发重复提交不产生重复修订。
- 验证：修订领域/仓储测试、Playwright 预览与恢复。

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
