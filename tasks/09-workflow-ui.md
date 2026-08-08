# 里程碑 09：Workflow UI

完成后用户可从模板或空白创建 Workflow，用步骤列表或 React Flow 画布编辑同一草稿并观察运行。

## WFU-01 建立系统模板目录

- 依赖：WFR-02、NEWS-04、TUT-04。
- 必读：`docs/01-design/pages/workflows.md`、`docs/02-architecture/ai-workflow-runtime.md`、`docs/02-architecture/data-model.md`。
- 目标：把资讯与教程流程注册为版本化系统模板，并支持只读查看与复制。
- 实施：模板有稳定 ID/版本；复制生成用户 Workflow 草稿；模板升级不覆盖副本。
- 非目标：模板市场和用户公开发布模板。
- 验收：系统模板不可原地编辑；重复复制请求幂等；副本独立发布。
- 验证：模板注册、复制 API 与版本隔离测试。

## WFU-02 实现步骤列表编辑器

- 依赖：WFR-01、WFR-02、UI-02。
- 必读：`docs/01-design/pages/workflows.md`、`docs/01-design/design-system.md`、`docs/02-architecture/ai-workflow-runtime.md`。
- 目标：完整支持节点添加、排序、连接、参数、工具权限、输入输出和校验错误定位。
- 实施：列表是完整可访问编辑入口；字段由节点元数据渲染，但不建设任意表单生成框架。
- 非目标：画布和运行时间线。
- 验收：只用键盘可创建有效顺序/分支流程；错误定位到节点和字段；保存版本冲突可恢复。
- 验证：Reducer/序列化单元、组件/axe、Playwright 列表发布。

## WFU-03 实现 React Flow 画布

- 依赖：WFU-02。
- 必读：`docs/01-design/pages/workflows.md`、`docs/01-design/design-system.md`、`docs/03-engineering/research-and-dependencies.md`。
- 目标：以同一编辑状态实现节点布局、连接、选择、键盘操作和错误标识。
- 实施：画布只改变坐标和定义关系；与列表共用序列化器；中文化 ARIA 指令并支持 reduced motion。
- 非目标：画布专属节点类型和自动生成 Workflow。
- 验收：列表/画布往返零语义差异；键盘可聚焦节点/边；移动端不加载编辑画布。
- 验证：序列化 round-trip、组件/axe、Playwright 视图切换与截图。

## WFU-04 实现版本与计划页面

- 依赖：WFU-02、WFR-07。
- 必读：`docs/01-design/pages/workflows.md`、`docs/02-architecture/api-and-events.md`。
- 目标：展示草稿校验、发布历史、定义差异和每日/每周计划。
- 实施：发布前显示不可变提示；计划明确时区和跟随最新发布版本；历史版本只读。
- 非目标：回滚覆盖旧版本和 Cron 编辑。
- 验收：草稿不能被误认为已发布；计划修改不改历史运行；版本差异不泄露密钥值。
- 验证：组件、API 集成、Playwright 发布与计划。

## WFU-05 实现运行观察页

- 依赖：WFR-06、WFU-03。
- 必读：`docs/01-design/pages/workflows.md`、`docs/02-architecture/api-and-events.md`、`docs/01-design/design-system.md`。
- 目标：以时间线和可选画布高亮展示运行、节点尝试、确认、错误、取消和恢复。
- 实施：SSE 重连后与快照校准；只显示安全摘要；路径动效集中在活动节点。
- 非目标：全局通知中心和隐含推理展示。
- 验收：列表与画布状态一致；确认前副作用说明可读；reduced motion 下状态仍清晰。
- 验证：SSE 组件、axe、Playwright 运行/中断/失败恢复与视觉回归。

## 检查点

从系统模板复制并用列表/画布修改、发布、计划、运行、确认和恢复；执行 Workflow UI E2E 与 `pnpm check`。
