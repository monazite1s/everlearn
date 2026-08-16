# Everlearn 施工入口

## 执行规则

- 只领取第一个依赖均为“已完成”的任务；一次会话只执行一个任务。
- 每个任务最多读取列出的三份上下文文档，再按需读取将修改的源码。
- 状态只允许：未开始、进行中、已完成、阻塞。进入“已完成”必须填写实际命令、结果和产物。
- 任务通常修改 3–5 个手写文件，最多 8 个；超过时先拆分。迁移生成物和机械夹具不计数。
- 新依赖、迁移、Provider、CI、部署或外部写操作必须在对应任务开始前获得用户确认。
- 页面、API 和后台流程分成相邻任务；契约先行，禁止在一个任务中同时设计多个模块并补齐全部测试。

## 里程碑索引

| 顺序 | 文件                                                               | 结果                                                    | 状态   |
| ---- | ------------------------------------------------------------------ | ------------------------------------------------------- | ------ |
| 0    | [工程基线](00-foundation.md)                                       | 可构建、可检查的 Monorepo 与本地依赖。                  | 已完成 |
| 1    | [设计系统与应用壳](01-design-shell.md)                             | 主题、通用组件、导航和响应式壳。                        | 已完成 |
| 1A   | [Mantine 迁移与 UI 修正](01a-mantine-migration.md)                 | 组件系统、显式路由和既有 UI 组件化。                    | 已完成 |
| 1B   | [shadcn/Tailwind 迁移与 UI 重构](01b-shadcn-tailwind-migration.md) | ADR 001/002、默认主题、官方应用壳、页面迁移与最终验收。 | 已完成 |
| 2    | [知识库模型与 API](02-knowledge-model.md)                          | 多知识库、文档树、Inbox 和回收站。                      | 进行中 |
| 3    | [编辑器与修订](03-editor.md)                                       | Tiptap、自动保存、修订和附件。                          | 未开始 |
| 4    | [搜索与知识连接](04-search-import.md)                              | 搜索、标签、链接和 Markdown 交换。                      | 未开始 |
| 5    | [AI 编辑与问答](05-ai-editing.md)                                  | LLM Gateway、差异接受和带引用问答。                     | 未开始 |
| 6    | [Workflow Runtime](06-workflow-runtime.md)                         | LangGraph、版本、检查点、工具和调度。                   | 未开始 |
| 7    | [资讯自动化](07-news.md)                                           | 订阅、采集、简报和自动发布。                            | 未开始 |
| 8    | [系统教程](08-tutorials.md)                                        | 两次确认、逐章生成与恢复。                              | 未开始 |
| 9    | [Workflow UI](09-workflow-ui.md)                                   | 模板、步骤编辑、画布和运行观察。                        | 未开始 |
| 10   | [账号、分享与克隆](10-accounts-sharing.md)                         | 多账号与只读分享、独立克隆。                            | 未开始 |
| 11   | [生产加固](11-production.md)                                       | 备份、安全、性能和完整 E2E。                            | 未开始 |

## 依赖图

```text
00 → 01 → 01A → 02 → 03 → 04 → 05 → 06
                               ├── 07
                               ├── 08
                               └── 09
02..09 → 10 → 11
```

KB-00..05W 与 UIR-00..06 已完成；当前首个可领取任务是 KB-06。知识库后续采用“契约 → API → 对应真实 UI”的相邻纵向切片，不允许 API 长期等待统一页面任务。07、08、09 在 06 完成后可以独立推进；共享契约变化必须先落到 `packages/contracts`。

## 追踪矩阵

| 需求               | 页面                     | 数据/API                       | 任务                      | 核心验收                                 |
| ------------------ | ------------------------ | ------------------------------ | ------------------------- | ---------------------------------------- |
| 多知识库与嵌套文档 | knowledge-base、editor   | KnowledgeBase、Document        | KB-01..07W、ED-01         | 创建后进入真实库；非法子树移动拒绝。     |
| 首页真实知识库     | home、knowledge-base     | KnowledgeBase 列表/创建 API    | KB-04C、KB-04、KB-04W/04H | 两页数据一致；生产无静态 fixture。       |
| Inbox 与回收站     | home、knowledge-base     | InboxItem、Trash API           | KB-08..10W                | 写入、转换和恢复均以服务端事实为准。     |
| 修订与 Markdown    | editor                   | Revision、Import/Export        | ED-02..05、SEARCH-05      | 恢复产生新修订；树结构可交换。           |
| 搜索与知识连接     | knowledge-base、editor   | SearchBlock、DocumentLink      | SEARCH-01..04             | 搜索定位 Block；反向链接准确。           |
| AI 编辑与问答      | editor                   | Generation、Citation、SSE      | AI-01..06                 | 拒绝不写入；引用可定位。                 |
| Workflow Runtime   | workflows                | WorkflowVersion、Run、Approval | WFR-01..07                | 发布不可变；检查点恢复幂等。             |
| 定时资讯           | news                     | Subscription、DigestRun        | NEWS-01..06               | 自动发布；失败显示质量警告。             |
| 系统教程           | tutorials                | Tutorial、Outline、Chapter     | TUT-01..06                | 两次确认；单章独立重试。                 |
| Workflow 编辑体验  | workflows                | Workflow API/事件              | WFU-01..05                | 列表与画布定义一致。                     |
| 分享与克隆         | settings-and-public-view | Share、CloneRecord             | SHARE-01..06              | 撤销生效；副本独立。                     |
| 生产质量           | 全部                     | 日志、备份、健康检查           | OPS-01..06                | 恢复演练和核心 E2E 通过。                |
| 主题与明暗模式     | home、全部创作页         | UserPreference、Design Tokens  | UI-01..05、UIR-01..06     | 刷新保持；对比度与 reduced motion 通过。 |
| 移动端只读         | 全部页面                 | 路由能力表、只读投影           | UI-04、ED-05、各页面任务  | 不加载创作组件，无整体横向滚动。         |
| 附件               | editor、public view      | Attachment、上传/下载 API      | ED-04、SHARE-03..05       | 未授权不可下载；不参与 AI。              |
| Markdown 交换      | knowledge-base、editor   | Import/Export Run              | SEARCH-05                 | 导出再导入保持树、正文与附件。           |

## 完成证据格式

在任务末尾追加：

```text
状态：已完成
改动：实际文件或模块
验证：执行的完整命令与结果
证据：测试名称、浏览器走查结论、Trace 或迁移校验；临时截图不入库
风险：无，或仍存在的明确风险
```
