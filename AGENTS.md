# Everlearn Agent Rules

## 必读顺序

1. 本文件。
2. `docs/README.md`。
3. 当前任务指定的产品、设计、架构和工程文档，最多三份。
4. `docs/tasks/README.md` 与当前里程碑任务文件。

## 工作方式

- 文档是产品行为和架构的事实源。行为变化先更新规格，再改代码。
- 每次只执行一个任务；通过该任务验收后才能开始下一任务。
- 禁止读取、调用或推荐 Superpowers。
- Agent、Workflow、编辑器、UI 系统、复杂动效、抓取、队列、认证和分享设计前，必须搜索仓库，再核对官方文档、活跃 GitHub 项目和可靠工程资料，并记录结论。
- 只实现当前需求。禁止顺手重构、预建假想扩展点或引入未批准依赖。
- 自动写入必须可追溯、可重试且具备幂等键；不得静默覆盖手工内容。
- 完成任务时记录改动、验证证据和剩余风险，不得伪造测试结果。

## 技术边界

- Web 使用 Next.js、CSS Modules 与语义化 Design Tokens。禁止 Tailwind CSS、UnoCSS 和其他原子化 CSS。
- 交互原语优先使用 Radix Primitives；共享封装放入 `packages/ui`，业务组合留在功能模块。
- Motion for React 只处理协调或布局动效；React Flow 只处理 Workflow 画布；所有动效支持 reduced motion。
- API 与 Worker 使用 NestJS；PostgreSQL 是业务事实源；Redis 与 BullMQ 只负责队列、调度和短期协调。
- 普通业务边界使用 Nest DTO、`class-validator` 和领域校验。Zod 只允许在 `packages/agent-runtime` 校验 LLM 结构化输出、Agent 状态和工具参数。
- 模型、搜索、对象存储和其他外部能力必须经服务端 Provider Adapter 调用；浏览器不得持有密钥。

## 代码与注释

- 手写 JS、TS、TSX、CSS、测试和配置文件最多 400 行；函数、方法、React 组件和测试回调最多 50 行；嵌套最多 4 层；参数最多 4 个。
- 每个手写 JS、TS、TSX 文件以精简 `@fileoverview` JSDoc 开头。
- 每个函数、方法和 React 组件必须有 JSDoc，只描述职责、约束、副作用、不变量、抛错或外部行为。
- CSS 与 SQL 使用各自语法的文件头说明。JSON、Markdown、生成文件、迁移生成物、锁文件和第三方代码豁免 JSDoc。
- 禁止复述代码或类型、无信息量 `@param`、逐行翻译、模板化长注释、注释掉的代码和生产 `console.log`。
- 优先清晰命名和小模块。禁止把无关内容堆入 `common`、`shared` 或 `utils`。

## 质量与安全

- 系统边界必须验证输入；错误不得静默吞掉。UI 提供可行动提示，服务端记录结构化错误。
- 禁止硬编码密钥、拼接 SQL、泄露内部错误、绕过来源限制、伪造引用或删除失败测试。
- 新行为必须有对应测试；缺陷修复必须有先失败后通过的回归测试。
- 交付前运行当前任务要求的聚焦测试，并在里程碑检查点运行 `pnpm check`。
- 新增依赖、数据库迁移、Provider、外部写操作或 CI/部署变更必须先获得用户确认。
