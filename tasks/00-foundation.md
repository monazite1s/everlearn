# 里程碑 00：工程基线

完成后仓库具备可复现启动、统一质量命令和服务端配置校验，不包含业务页面或领域模型。

## FND-01 初始化 Workspace

- 依赖：无。
- 必读：`docs/02-architecture/system.md`、`docs/03-engineering/development.md`、`docs/03-engineering/quality-gates.md`。
- 目标：建立 pnpm workspace、Turborepo、`apps/web|api|worker` 与三个共享 package 的最小可构建入口。
- 实施：定义 package 边界、TypeScript 基础配置和根脚本；每个入口只输出健康占位，不创建业务模块。
- 非目标：数据库 Schema、页面组件、认证和 Provider。
- 验收：所有 workspace 被识别；应用不跨目录源码导入；`pnpm build` 与 `pnpm typecheck` 通过。
- 验证：`pnpm install --frozen-lockfile=false`、`pnpm typecheck`、`pnpm build`。

## FND-02 配置格式与静态门禁

- 依赖：FND-01。
- 必读：`docs/03-engineering/quality-gates.md`、`AGENTS.md`。
- 目标：配置 Prettier、ESLint flat config、Stylelint、JSDoc 与文件/函数规模检查。
- 实施：建立根配置和 `check-file-size`；仅豁免规格允许的生成物；添加最小失败夹具验证门禁后移除夹具。
- 非目标：业务测试和 CI。
- 验收：缺少文件/函数 JSDoc、超过行数、原始颜色和 `console.log` 均会失败；合法样例通过。
- 验证：`pnpm format:check`、`pnpm lint`、`pnpm check:file-size`。

## FND-03 配置与日志基础

- 依赖：FND-01。
- 必读：`docs/02-architecture/system.md`、`docs/02-architecture/api-and-events.md`、`AGENTS.md`。
- 目标：API/Worker 启动时校验数据库、Redis、对象存储和 Provider 环境配置，并提供结构化日志与 request ID。
- 实施：普通配置使用 Nest DTO/领域校验；密钥输出统一脱敏；Web 只取得公开配置。
- 非目标：Provider 连接测试和业务日志事件。
- 验收：缺少必需基础配置时进程快速失败；日志不包含密钥；请求响应含 request ID。
- 验证：配置单元测试、API 启动集成测试、日志快照检查。

## FND-04 建立本地依赖环境

- 依赖：FND-01、FND-03。
- 必读：`docs/02-architecture/system.md`、`docs/03-engineering/development.md`。
- 目标：用 Docker Compose 启动 PostgreSQL+pgvector、Redis 和 MinIO，并提供健康检查与持久卷。
- 实施：固定兼容版本；提供示例环境文件；不把应用镜像纳入本任务。
- 非目标：生产 TLS、备份和容器安全加固。
- 验收：三项依赖健康；重启后测试数据保留；端口与凭据可通过环境覆盖。
- 验证：`docker compose up -d`、健康检查命令、重启持久化检查。

## FND-05 建立测试与 CI 骨架

- 依赖：FND-02、FND-04。
- 必读：`docs/03-engineering/quality-gates.md`、`docs/03-engineering/development.md`。
- 目标：建立单元、集成、组件和 Playwright E2E 入口，以及根 `pnpm check`。
- 实施：CI 分为静态/单元与 Docker 集成/E2E Job；使用空白健康页完成首条 smoke test。
- 非目标：业务 E2E 和真实 Provider 测试。
- 验收：根命令齐全；失败测试阻断 CI；覆盖率报告可聚合且门槛生效。
- 验证：`pnpm check`、`pnpm test:e2e`。

## 检查点

FND-01..05 均完成后记录依赖版本、完整 `pnpm check` 和 Compose 健康结果；未通过不得进入 UI。
