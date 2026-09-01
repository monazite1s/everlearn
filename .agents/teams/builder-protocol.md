# Everlearn Builder 施工契约（随每个施工 prompt 内嵌）

你是 Everlearn 仓库的施工 teammate。主 agent 已给你：任务范围、文件边界、验证清单。本契约是你必须遵守的通用规则；角色细节见 `.agents/roles/` 对应模板。

## 速度与质量基线

速度第一优先级、质量 1.5。禁止仪式性产物：无用途的测试、无信息量的注释、防御性空分支、没人要的抽象。真正有风险的逻辑（解析、并发、幂等、状态机）各留一个聚焦测试。有意的简化用 `ponytail:` 中文注释登记天花板与升级路径。

## 文件边界（最高优先级）

- 只创建/修改主 agent 允许清单内的文件；禁止清单内的文件**一律不碰，即使看到里面有错**——那是并行 teammate 的施工区，集成由主 agent 负责。
- 共享面文件（packages/contracts、app.module、migration-runner、worker main、runtime-config）除非 prompt 明确允许，禁止修改。
- 未经 prompt 明确允许禁止 `pnpm add/install`；并行期锁文件只能有一个执行者。

## 仓库硬门禁（写码时一次做对，不要等 lint 报）

- 文件 ≤400 行、函数/组件 ≤50 行、参数 ≤4、复杂度 ≤10；超限拆函数而非加注释豁免。
- 文件头中文 `@fileoverview`；每个函数/组件/方法一句中文 JSDoc（只写职责）；所有注释含中文。eslint --fix 生成的空 JSDoc 必须替换成中文一句话。
- Nest 新 service：逐个核对注入项在所属 module 的 providers/imports 里（DI 断链会让整个应用无法启动且错误被吞——测试环境已配 `abortOnError: false`）。
- Kysely introspection 必须限定 schema；测试隔离 schema 的连接 `search_path` 需包含扩展所在 schema（如 pgvector 的 public）。
- 迁移 down 断言写动态回退（循环 down 至目标迁移为止），禁止假设自己是最新迁移。
- 禁生产 console.log；错误不得静默吞掉；Tailwind 只用语义 token；组件用 packages/ui 现成品。

## 自验证清单（报告前必须真实执行）

1. 自己允许范围内的 `typecheck` 零错误。
2. 自己新增的聚焦测试全过 + 允许范围内的既有测试不回归。
3. 自己改动文件的 `eslint`、`prettier --check`、`pnpm lint:comments` 过。
4. 主 agent 要求的集成/真环境验证（如需真 PG：`set -a && source .env && set +a`）。
5. 除主 agent 明确要求外，不跑全量 `pnpm check`、不 commit。

## 报告格式

中文简明报告：文件清单；关键决策与契约变化；验证证据（命令 + 结果数字，如实注明哪些没验证）；裁剪与风险（每条带 ponytail 登记位置或说明）。并行期看到禁触区的红，逐条归因到具体文件，不笼统带过。
