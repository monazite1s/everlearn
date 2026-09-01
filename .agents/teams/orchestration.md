# Everlearn Agent Team 编排协议

主 agent（lead）按本协议把开发工作分派给并行 sub agent（teammates），并负责集成、验收与提交。协议来自 2026-09-02 一夜交付 M2–M4 的实战复盘，配合 `.agents/roles/` 角色模板与 `.agents/teams/builder-protocol.md` 施工契约使用。

## 前沿实践对本仓库的取舍结论（2026-09 调研）

- 运行时框架（LangGraph / CrewAI / AutoGen）：用于构建 agent 产品的工具，不是开发团队的工具；不引入。
- BMAD Method 的文档驱动、阶段门禁思路与本仓库既有 AGENTS.md 门禁同构，只补执行协议，不引入其全套角色文件。
- Claude Code Agent Teams 的 lead/teammate/任务认领模式：ZCode 无原生运行时，以「lead 手工分派 + background agent + SendMessage」等价实现，规则固化于本文件。

## 施工流水线（六个阶段）

1. **侦察**：只读 Explore agent 盘点现状（文件集、既有模式、测试形态），lead 读事实源确认范围。
2. **切分**：lead 把工作切成可并行切片，给每个 teammate 三件套——文件边界（允许/禁止目录，逐字列出）、任务范围（含明确的裁剪与 ponytail 登记项）、验证清单。切片划分原则：**目录不相交、依赖单向、每片是可独立验证的纵向切片**。
3. **并行施工**：teammates 以 background agent 并行跑。硬规则见下节。
4. **集成清扫**：全部收回后 lead 统一处理跨切片断裂（DI 装配、契约对齐、迁移链测试、机械门禁），此时才允许跑全量门禁。
5. **验收**：全量 `pnpm check` + 按里程碑的验收测试（E2E / 集成）；第三方视角评审用 code-reviewer 或 pm 角色。
6. **提交**：lead 提交并按里程碑分片写 commit message；任务文件登记证据与裁剪。

## 硬规则（每轮并行施工必须执行）

1. **单一 pnpm 执行者**：同一时间只允许一个 teammate 执行 `pnpm add/install`（锁文件竞争）；不需要新依赖的切片优先并行。
2. **文件边界逐字写进 prompt**：允许与禁止目录都要写；禁触理由是并行 WIP 时注明「他人施工区，见 X 任务」。
3. **teammate 一律不 commit**；commit 权集中在 lead。
4. **施工契约随发**：每个 teammate 的 prompt 必须内嵌 `.agents/teams/builder-protocol.md` 全文。
5. **跨切片契约先登记**：任何 teammate 要改共享面（contracts、app.module、migration-runner、worker main、runtime-config），先在分派时声明，lead 决定归属，禁止顺手改。
6. **迁移纪律**：新迁移只追加；`identity-knowledge-schema` 链式 spec 的迁移穷举列表由 lead 在集成阶段统一补齐；各 spec 的 down 断言一律写动态回退（循环 down 至目标迁移为止），禁止硬编码「最新迁移」。
7. **集成清单**（lead 在阶段 4 逐项过）：Nest 模块 DI（新 service 的每个注入项都有 provider/module import）；Web↔API 契约字段全集（精确匹配解析器必须同步新字段）；eslint --fix 产生的空 JSDoc 换中文一句话；Kysely introspection 限定 schema；测试环境隔离 schema 的 search_path 含扩展所在 schema。
8. **证据纪律**：teammate 报告必须含真实命令与结果数字；「并行 WIP 导致的红」要逐条归因到禁触文件，不许笼统带过。
9. **时间盒**：单个障碍 10 分钟换路径；工具结构性限制（如 Playwright 转译器不读装饰器配置）登记后绕行，不硬凿。

## 角色分工

| 角色     | 承载                                                     | 职责                                                 |
| -------- | -------------------------------------------------------- | ---------------------------------------------------- |
| Lead     | 主 agent                                                 | 切分、分派、集成、门禁、提交，不亲自实现大块功能     |
| Builder  | general-purpose / backend-architect / frontend-developer | 按 builder-protocol 施工，自验证到「自己的文件全绿」 |
| Reviewer | code-reviewer                                            | 只读审查（最小 diff、纯度、遗漏状态），关键任务必配  |
| Verifier | test-automator                                           | 补验收测试、跑 E2E/集成并出具证据                    |
| PM       | general-purpose 承载 `pm.md`                             | 产品视角复核（范围/YAGNI/验收）                      |

## 任务认领（轻量版）

并行切片少（≤4）时由 lead 直接在 prompt 指派；切片多或跨会话时，lead 在 `docs/tasks/` 当前任务文件以「认领人/边界/状态」三行登记，teammate 完成后回报，lead 更新。
