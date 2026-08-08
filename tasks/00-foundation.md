# 里程碑 00：工程基线

完成后仓库具备可复现启动、统一质量命令和服务端配置校验，不包含业务页面或领域模型。

## FND-01 初始化 Workspace 根配置

- 依赖：无。
- 必读：`docs/02-architecture/system.md`、`docs/03-engineering/development.md`、`docs/03-engineering/quality-gates.md`。
- 目标：建立 Node 24、pnpm 11、Turborepo 和严格 TypeScript 的 Monorepo 根配置。
- 实施：声明 workspace、版本约束、统一脚本和基础 TS 配置；先不创建应用实现。
- 非目标：应用脚手架、质量工具和业务模块。
- 验收：运行时版本不符时快速失败；workspace 配置可识别预定目录；根类型配置可被扩展。
- 验证：`node --version`、`pnpm --version`、`pnpm install --frozen-lockfile=false`。

## FND-02 建立 Web 应用壳

- 依赖：FND-01。
- 必读：`docs/02-architecture/system.md`、`docs/03-engineering/development.md`。
- 目标：建立可独立构建的 Next.js App Router 最小应用。
- 实施：使用 `src` 目录、Server Components 和 CSS Modules；只提供中文工程占位页。
- 非目标：设计系统、业务页面、原子化 CSS 和 React Compiler。
- 验收：Web 可启动和构建；没有业务组件或跨应用源码导入。
- 验证：Web package 的 `typecheck` 与 `build`。

## FND-03 建立 API 与 Worker 应用壳

- 依赖：FND-01。
- 必读：`docs/02-architecture/system.md`、`docs/03-engineering/development.md`、`docs/02-architecture/api-and-events.md`。
- 目标：建立 NestJS HTTP API 与无 HTTP 的 standalone Worker。
- 实施：API 提供 `/api/v1/health/live` 与 `/api/v1/health/ready`；Worker 只验证启动生命周期。
- 非目标：数据库连接、队列消费者、认证和业务模块。
- 验收：API 健康端点返回稳定契约；Worker 可启动并正常退出；两者可独立构建。
- 验证：API/Worker package 的 `typecheck` 与 `build`，健康端点 smoke。

## FND-04 建立共享 Package 边界

- 依赖：FND-01。
- 必读：`docs/02-architecture/system.md`、`docs/03-engineering/development.md`。
- 目标：建立 `contracts`、`ui` 与 `agent-runtime` 的最小公开入口。
- 实施：只声明 package 所有权和显式导出；不建立空接口、工厂或假实现。
- 非目标：DTO、组件、LangGraph 和 Zod Schema。
- 验收：package 可独立类型检查；应用只能通过 package 入口引用；不存在跨应用源码导入。
- 验证：共享 package 的 `typecheck` 与根 `pnpm typecheck`。

## FND-05 配置格式与静态门禁

- 依赖：FND-02、FND-03、FND-04。
- 必读：`docs/03-engineering/quality-gates.md`、`AGENTS.md`。
- 目标：配置 Prettier、ESLint flat config、Stylelint、JSDoc 与文件/函数规模检查。
- 实施：建立根配置和 `check-file-size`；仅豁免规格允许的生成物；用临时失败夹具验证后移除。
- 非目标：业务测试和 CI。
- 验收：缺少文件/函数 JSDoc、超过行数、原始业务颜色和 `console.log` 均失败；合法样例通过。
- 验证：`pnpm format:check`、`pnpm lint`、`pnpm check:file-size`。

## FND-06 建立运行时配置校验

- 依赖：FND-03、FND-05。
- 必读：`docs/02-architecture/system.md`、`docs/02-architecture/api-and-events.md`、`AGENTS.md`。
- 目标：API 与 Worker 启动时校验数据库、Redis 和对象存储配置。
- 实施：普通配置使用 Nest DTO 与 `class-validator`；LLM/Search 可选配置按完整组合校验；Web 构建不读取服务端密钥。
- 非目标：Provider、数据库和对象存储连接测试。
- 验收：缺少必需配置时快速失败；可选配置不完整时返回可定位错误；不使用 Zod。
- 验证：配置单元测试和 API/Worker 启动失败测试。

## FND-07 建立请求关联与结构化日志

- 依赖：FND-03、FND-06。
- 必读：`docs/02-architecture/api-and-events.md`、`docs/03-engineering/quality-gates.md`、`AGENTS.md`。
- 目标：API 统一生成或接收 request ID，并用 Nest Logger 输出结构化安全日志。
- 实施：响应回传 request ID；日志脱敏密钥、Cookie、正文和 Prompt；Worker 保留任务关联字段入口。
- 非目标：业务审计事件和第三方可观察性平台。
- 验收：合法请求 ID 被保留，缺失或非法值生成 UUID；日志不含敏感字段。
- 验证：API 集成测试与日志快照检查。

## FND-08 建立本地依赖环境

- 依赖：FND-01、FND-06。
- 必读：`docs/02-architecture/system.md`、`docs/03-engineering/development.md`。
- 目标：用 Docker Compose 启动 PostgreSQL+pgvector、Redis 和 SeaweedFS S3，并提供健康检查与持久卷。
- 实施：固定兼容版本；端口只绑定 localhost；提供示例环境文件；不加入应用镜像。
- 非目标：生产 TLS、备份和容器安全加固。
- 验收：三项依赖健康；重启后测试数据保留；端口与凭据可通过环境覆盖。
- 验证：`docker compose up -d`、健康检查命令、重启持久化检查。

## FND-09 建立测试骨架与根检查命令

- 依赖：FND-05、FND-08。
- 必读：`docs/03-engineering/quality-gates.md`、`docs/03-engineering/development.md`。
- 目标：建立 Vitest 单元/集成/组件入口、Supertest API 测试、Playwright E2E 和根 `pnpm check`。
- 实施：覆盖健康页与健康端点；配置 80% 全局覆盖率门槛；测试不依赖真实 Provider。
- 非目标：业务 E2E 和真实 Provider 测试。
- 验收：根测试命令齐全；失败测试和覆盖率不足会阻断；Playwright 产物可诊断。
- 验证：`pnpm check`、`pnpm test:e2e`。

## FND-10 建立 GitHub Actions 门禁

- 依赖：FND-09。
- 必读：`docs/03-engineering/quality-gates.md`、`docs/03-engineering/development.md`。
- 目标：建立静态/单元、Docker 集成和 E2E 三类 CI Job。
- 实施：使用锁文件安装；集成 Job 启动 Compose；E2E 失败上传 Trace；不使用真实 Provider 密钥。
- 非目标：部署、发布和远程仓库配置。
- 验收：任一门禁失败阻断 CI；Job 之间职责清晰；本地命令与 CI 一致。
- 验证：Workflow 语法检查、`pnpm check`、`pnpm test:e2e`。

## 检查点

FND-01..10 均完成后记录依赖版本、完整 `pnpm check` 和 Compose 健康结果；未通过不得进入 UI。
