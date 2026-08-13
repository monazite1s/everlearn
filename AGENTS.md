# Everlearn Agent Rules

## 事实源与读取顺序

1. 读取本文件。
2. 读取 docs/README.md。
3. 读取当前任务文件及其列出的上下文文档，业务上下文最多三份。
4. 按下表加载适用的项目 Skill；通常一项任务使用一至三个，不得无目的全量加载。

产品行为以产品与页面规格为准，技术边界以架构文档为准，当前施工范围以任务文件为准。发现冲突时停止实现，先修正文档事实源。

## Skill 强制路由

项目 Skill 位于 .agents/skills。命中触发条件时必须在设计或编码前读取完整 SKILL.md，并执行其门禁。

| Skill                            | 强制触发条件                                                         |
| -------------------------------- | -------------------------------------------------------------------- |
| everlearn-requirements           | 新功能、行为变化、需求含糊、跨页面流程或拆分施工任务                 |
| everlearn-ui-design              | 新建或修改页面、布局、组件、交互、视觉、响应式、可访问性或动效       |
| everlearn-reuse-first            | 新建组件、封装、工具、基础设施能力，或考虑新增/替换依赖              |
| everlearn-api-contract           | 新建或修改 HTTP、SSE、错误结构、分页、并发控制或前后端数据交互       |
| everlearn-postgres-design        | 新建或修改表、列、约束、索引、查询形态、迁移或数据保留规则           |
| everlearn-pragmatic-architecture | 新模块、跨模块依赖、Provider、队列流程、设计模式或难以回退的结构决策 |

组合门禁：

- UI 工作必须同时使用 everlearn-ui-design 与 everlearn-reuse-first。
- 跨前后端功能必须使用 everlearn-requirements 与 everlearn-api-contract；涉及数据持久化时再使用 everlearn-postgres-design。
- Agent、Workflow、编辑器、复杂动效、抓取、队列、认证和分享设计必须使用 everlearn-reuse-first 与 everlearn-pragmatic-architecture。
- Skill 改变了决策、范围或实现时，必须在任务完成证据中记录影响。
- 禁止读取、调用、安装或推荐 Superpowers。

## Agent 路由

`.claude/agents` 提供项目级执行入口，作为 Skill 之上的委派层：`architect`、`ui-designer`、`api-designer`、`db-designer`。Agent 只做路由与门禁摘要，不复制 Skill 全文；事实源仍以 AGENTS.md 与 docs 为准，Skill 按上表强制加载。Agent 与 Skill 冲突时，以 Skill 与文档事实源为准。

## 执行门禁

### G0 范围

- 每次只执行一个任务；通过验收后才能进入下一任务。
- 只实现当前需求。禁止顺手重构、预建假想扩展点或补做未批准功能。
- 行为变化先更新规格；任务文件不得创造产品需求。

### G1 研究与复用

- 写代码前先用 rg 搜索仓库、packages/ui、既有契约和相邻实现。
- 复杂能力和新依赖必须核对官方文档、维护者仓库及至少一个可靠工程来源，并记录采用、拒绝和替换成本。
- 采用顺序固定为：现有实现、已采用组件库、成熟依赖、薄适配、自研。
- 组件库已有 Menu、MenuItem、Breadcrumb、Select、Search、Dialog、Card、Tabs、Tooltip、Command 等能力时，禁止自行重写行为与可访问性。
- 禁止仅转发 props 或 className 的无价值包装；共享封装必须统一至少一项产品语义、可访问性、状态或跨页面行为。
- 禁止同时保留职责重叠的组件库。新增依赖或替换组件系统必须先获得用户批准。

### G2 设计与契约

- 页面实现前必须明确布局、组件复用清单、桌面/移动行为以及空、加载、部分成功、失败、离线和无权限状态。
- 前后端以公开契约交互；前端禁止手写与服务端重复的数据传输类型。
- Mock 只能用于测试、Story 或显式开发夹具，禁止作为生产路由默认数据源。
- 跨层功能按可运行的纵向切片交付，避免长期存在只有 UI Mock 或只有孤立 API 的半成品。
- 数据不变量优先由 PostgreSQL 约束表达；索引必须对应已知查询，不为假设场景预建。

### G3 架构

- 使用模块化单体和清晰领域所有权；禁止跨模块直接写表。
- 只有直接实现无法满足已确认约束时才引入设计模式。
- 每个实际使用的设计模式必须在主要实现符号的 JSDoc 中标记 @designPattern，并说明模式名称与解决的问题；同时在任务证据中记录位置、代价和移除条件。
- 不得把普通分层、依赖注入或一个接口包装成设计模式来合理化复杂度。

### G4 验证

- 实现后运行当前任务要求的格式化、类型检查和聚焦功能测试。
- 前期不运行 E2E、全量覆盖率或复杂测试，除非任务明确要求或用户重新批准。
- 缺陷修复必须有能复现失败的聚焦回归测试。
- 完成时记录实际命令、结果、产物与剩余风险；不得伪造或推断测试结果。

## Vibe Coding 商业化门禁

开发以 vibe coding 加速，质量以 `docs/03-engineering/vibe-coding-standards.md` 兜底（DoD 检查单、性能预算、评审与证据规则均以该文件为准）：

- 先验收后编码：任务开始前明确范围、非目标与验收；编码后按验收逐项取证。
- 关键任务（数据一致性、安全、跨模块契约、UI 打磨）交付前必须有第二视角评审（独立 agent 上下文或用户抽检），评审意见与处置写入任务文件；AI 自审不算评审。
- 性能敏感路径按差距规范预算表实测留档，禁止以 dev 模式运行速度代替。
- 破坏性契约变更必须带迁移与兼容说明；跨模块、公共契约、安全或供应商锁定决策写 `docs/decisions/` ADR。
- 任务风险栏不得为空：无风险写"无"；有风险必须列出内容、影响与移除触发条件（技术债登记）。
- 真实环境验证取代 mock 冒充；数据库以真实 PostgreSQL 验证，UI 以真实浏览器走查并截图留档。

## 技术边界

- Web 使用 Next.js、CSS Modules 与语义化 Design Tokens。禁止 Tailwind CSS、UnoCSS 和其他原子化 CSS。
- 组件系统及导入边界以 docs/03-engineering/research-and-dependencies.md 的当前批准项为准；packages/ui 只承载文档明确要求的 Token、Provider 和有产品语义的共享组件。
- Motion for React 只处理协调或布局动效；React Flow 只处理 Workflow 画布；所有动效支持 reduced motion。
- API 与 Worker 使用 NestJS；PostgreSQL 是业务事实源；Redis 与 BullMQ 只负责队列、调度和短期协调。
- 普通业务边界使用 Nest DTO、class-validator 与领域校验。Zod 仅允许在 packages/agent-runtime 校验 LLM 结构化输出、Agent 状态和工具参数。
- 模型、搜索、对象存储和其他外部能力必须经服务端 Provider Adapter 调用；浏览器不得持有密钥。
- 自动写入必须可追溯、可重试且具备幂等键，不得静默覆盖手工内容。

## 代码与注释

- 手写 JS、TS、TSX、CSS、测试和配置文件最多 400 行；函数、方法、React 组件和测试回调最多 50 行；嵌套最多 4 层；参数最多 4 个。
- 每个手写 JS、TS、TSX 文件以精简 @fileoverview JSDoc 开头。
- 每个函数、方法和 React 组件必须有精简 JSDoc，只描述职责、约束、副作用、不变量、抛错或外部行为。
- CSS 与 SQL 使用各自语法的文件头说明。JSON、Markdown、生成文件、迁移生成物、锁文件和第三方代码豁免 JSDoc。
- 禁止复述代码或类型、无信息量参数说明、逐行翻译、模板化长注释、注释掉的代码和生产 console.log。
- 优先清晰命名与小模块。禁止把无关内容堆入 common、shared 或 utils。

## 安全与变更授权

- 系统边界必须验证输入；错误不得静默吞掉。UI 提供可行动提示，服务端记录结构化错误。
- 禁止硬编码密钥、拼接 SQL、泄露内部错误、绕过来源限制、伪造引用或删除失败测试。
- 新增依赖、数据库迁移、Provider、外部写操作或 CI/部署变更必须先获得用户确认。
