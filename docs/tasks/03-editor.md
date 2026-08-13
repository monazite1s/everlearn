# 里程碑 03：编辑器与修订

完成后桌面端具备稳定块编辑、自动保存、修订恢复和附件展示；移动端使用独立只读渲染器。

## ED-01 建立 Tiptap Schema 与 Block ID

- 依赖：KB-03、UI-02。
- 必读：`docs/01-design/pages/editor.md`、`docs/02-architecture/data-model.md`、`docs/03-engineering/research-and-dependencies.md`。
- 目标：配置批准的 Block、Markdown 快捷输入、Slash Menu 和稳定 `blockId` 扩展。
- 实施：定义 Schema 版本；处理插入、复制、拆分、合并和导入时的 ID 规则；拖拽使用官方能力。
- 非目标：AI、协作、表格高级计算和自定义数据库 Block。
- 验收：所有可引用 Block ID 唯一；非法 JSON 拒绝；批准的 Block 可序列化往返。
- 验证：扩展单元测试、JSON round-trip 测试、编辑器组件测试。

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
