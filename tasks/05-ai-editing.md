# 里程碑 05：AI 编辑与问答

完成后用户可流式生成草稿、审阅差异并获得带块级引用的知识库回答；Provider 不可用不影响知识库。

## AI-01 定义 Provider 与 LLM Gateway

- 依赖：FND-07。
- 必读：`docs/02-architecture/ai-workflow-runtime.md`、`docs/02-architecture/system.md`、`docs/03-engineering/research-and-dependencies.md`。
- 目标：定义流式文本、结构化生成、Embedding、取消和用量接口，并实现 OpenAI-compatible Adapter。
- 实施：统一超时、重试、错误分类、模型配置和密钥隔离；提供确定性伪 Provider。
- 非目标：模型自动路由和第二家 Provider。
- 验收：业务模块不导入厂商 SDK；错误映射稳定；日志和 Web 无密钥。
- 验证：Provider 契约测试、取消/超时/限流测试。

## AI-02 实现 Generation 与 SSE

- 依赖：AI-01、ED-03。
- 必读：`docs/02-architecture/api-and-events.md`、`docs/02-architecture/data-model.md`、`docs/01-design/pages/editor.md`。
- 目标：实现 Generation 状态机、流式草稿、重连、取消和安全用量记录。
- 实施：先持久化 Generation；SSE 使用统一信封和序号；取消作为持久意图；内容只存草稿不写正文。
- 非目标：接受差异和知识库检索。
- 验收：重连不重复或乱序应用；取消结束流；失败不改变文档。
- 验证：状态机单元、SSE 契约/断线集成测试。

## AI-03 实现差异预览与接受

- 依赖：AI-02、ED-03。
- 必读：`docs/01-design/pages/editor.md`、`docs/02-architecture/api-and-events.md`、`docs/02-architecture/data-model.md`。
- 目标：把选区生成渲染为安全差异，仅在接受时写入目标 Block 并创建 AI 修订。
- 实施：接受提交目标文档版本、差异选择和幂等键；冲突要求重新预览，禁止盲目套用。
- 非目标：多人合并和自动覆盖已有内容。
- 验收：接受一次只产生一个修订；拒绝/取消零写入；版本冲突不修改正文。
- 验证：Patch 单元、API 幂等/冲突集成、Playwright 接受/拒绝/取消。

## AI-04 建立 Embedding 与混合检索

- 依赖：SEARCH-01、AI-01。
- 必读：`docs/02-architecture/ai-workflow-runtime.md`、`docs/02-architecture/data-model.md`、`docs/02-architecture/system.md`。
- 目标：为 SearchBlock 生成带模型版本的向量，并合并 FTS/pgvector 召回。
- 实施：按内容哈希幂等；模型升级允许并行索引；限定所有者与文档/知识库范围；结果跨文档去重。
- 非目标：全用户跨库问答和独立搜索集群。
- 验收：召回不越权；重复索引不重复计费；缺失向量时可用 FTS 降级。
- 验证：排序单元、pgvector 集成、降级测试。

## AI-05 实现带引用问答

- 依赖：AI-02、AI-04。
- 必读：`docs/01-design/pages/editor.md`、`docs/02-architecture/ai-workflow-runtime.md`、`docs/02-architecture/api-and-events.md`。
- 目标：支持当前文档或当前知识库问答，并返回可校验的文档/修订/Block 引用。
- 实施：只允许引用送入模型的候选；服务端验证引用范围；证据不足返回明确结果。
- 非目标：跨全部知识库默认问答和 Web 搜索问答。
- 验收：引用点击定位正确；删除/旧修订引用有明确状态；无证据不伪造。
- 验证：引用校验/权限单元、伪 Provider 集成、问答 E2E。

## AI-06 接入编辑器 AI 侧栏

- 依赖：AI-03、AI-05、ED-05。
- 必读：`docs/01-design/pages/editor.md`、`docs/01-design/design-system.md`、`docs/01-design/layout-and-navigation.md`。
- 目标：实现选区菜单、可折叠 AI/引用/修订侧栏和生成历史。
- 实施：流式内容节流渲染；不逐 token 播报；目标块外保持可编辑；引用使用知识脊线强调。
- 非目标：独立 AI 一级页和移动端 AI。
- 验收：侧栏范围持续可见；生成不覆盖正文；reduced motion 下引用定位可理解。
- 验证：组件、axe、Playwright AI 全流程与视觉回归。

## 检查点

用伪 Provider 运行 AI 全套单元/集成/E2E 与 `pnpm check`；断开 Provider 后复测知识库编辑、搜索和阅读仍可用。
