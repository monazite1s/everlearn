# 里程碑 00：工程基线

完成后仓库具备可复现启动、统一质量命令和服务端配置校验，不包含业务页面或领域模型。

## FND-01 初始化 Workspace 根配置

- 状态：已完成。
- 依赖：无。
- 必读：`docs/02-architecture/system.md`、`docs/03-engineering/development.md`、`docs/03-engineering/quality-gates.md`。
- 目标：建立 Node 24、pnpm 11、Turborepo 和严格 TypeScript 的 Monorepo 根配置。
- 实施：声明 workspace、版本约束、统一脚本和基础 TS 配置；先不创建应用实现。
- 非目标：应用脚手架、质量工具和业务模块。
- 验收：运行时版本不符时快速失败；workspace 配置可识别预定目录；根类型配置可被扩展。
- 验证：`node --version`、`pnpm --version`、`pnpm install --frozen-lockfile=false`。

### FND-01 完成证据

- 改动：建立 pnpm Workspace、Catalog、Turbo 任务图、Node/pnpm 约束和严格 TypeScript 基础配置。
- 验证：`pnpm install --frozen-lockfile`、`pnpm typecheck`、`pnpm build` 均退出 0；Node 24.18.0、pnpm 11.20.0、Turbo 2.10.6、TypeScript 5.9.3。
- 风险：应用 package 尚未创建，因此 Turbo 本任务执行 0 个 package；FND-02..04 分别提供真实构建任务。

## FND-02 建立 Web 应用壳

- 状态：已完成。
- 依赖：FND-01。
- 必读：`docs/02-architecture/system.md`、`docs/03-engineering/development.md`。
- 目标：建立可独立构建的 Next.js App Router 最小应用。
- 实施：使用 `src` 目录、Server Components 和 CSS Modules；只提供中文工程占位页。
- 非目标：设计系统、业务页面、原子化 CSS 和 React Compiler。
- 验收：Web 可启动和构建；没有业务组件或跨应用源码导入。
- 验证：Web package 的 `typecheck` 与 `build`。

### FND-02 完成证据

- 改动：建立 Next.js App Router、Server Component 根布局、中文工程占位页和 CSS Modules。
- 验证：根 `pnpm typecheck` 与 `pnpm build` 各执行 1 个 Web 任务并通过；本地生产服务器返回 HTTP 200 且包含页面标题。
- 风险：当前页面只验证应用边界，不代表 M1 设计系统或产品应用壳。

## FND-03 建立 API 与 Worker 应用壳

- 状态：已完成。
- 依赖：FND-01。
- 必读：`docs/02-architecture/system.md`、`docs/03-engineering/development.md`、`docs/02-architecture/api-and-events.md`。
- 目标：建立 NestJS HTTP API 与无 HTTP 的 standalone Worker。
- 实施：API 提供 `/api/v1/health/live` 与 `/api/v1/health/ready`；Worker 只验证启动生命周期。
- 非目标：数据库连接、队列消费者、认证和业务模块。
- 验收：API 健康端点返回稳定契约；Worker 可启动并正常退出；两者可独立构建。
- 验证：API/Worker package 的 `typecheck` 与 `build`，健康端点 smoke。

### FND-03 完成证据

- 改动：建立 NestJS HTTP API、存活/就绪健康端点与无 HTTP 的 standalone Worker。
- 验证：API 和 Worker 独立 `typecheck`、`build` 均退出 0；Worker 启动后记录生命周期就绪并正常退出；根 `pnpm typecheck` 与 `pnpm build` 共执行 3 个 package 且全部通过。
- 证据：`/api/v1/health/live` 与 `/api/v1/health/ready` smoke 均返回 HTTP 200 和稳定状态字段。
- 风险：健康就绪端点尚未探测 PostgreSQL、Redis 与对象存储；该能力按 FND-06 的配置基线和后续连接任务实现。

## FND-04 建立共享 Package 边界

- 状态：已完成。
- 依赖：FND-01。
- 必读：`docs/02-architecture/system.md`、`docs/03-engineering/development.md`。
- 目标：建立 `contracts`、`ui` 与 `agent-runtime` 的最小公开入口。
- 实施：只声明 package 所有权和显式导出；不建立空接口、工厂或假实现。
- 非目标：DTO、组件、LangGraph 和 Zod Schema。
- 验收：package 可独立类型检查；应用只能通过 package 入口引用；不存在跨应用源码导入。
- 验证：共享 package 的 `typecheck` 与根 `pnpm typecheck`。

### FND-04 完成证据

- 改动：建立 `contracts`、`ui` 与 `agent-runtime` 三个独立 package，声明显式公开入口和统一 TypeScript 构建边界。
- 验证：三个 package 的聚焦 `typecheck` 与 `build` 均退出 0；根 `pnpm typecheck` 和 `pnpm build` 共执行 6 个 package 且全部通过。
- 证据：公开入口当前不导出占位 DTO、组件、Schema、工厂或假实现；仓库不存在跨应用源码导入。
- 风险：共享包尚无业务导出；后续能力只能在出现真实用例的任务中加入。

## FND-05 配置格式与静态门禁

- 状态：已完成。
- 依赖：FND-02、FND-03、FND-04。
- 必读：`docs/03-engineering/quality-gates.md`、`AGENTS.md`。
- 目标：配置 Prettier、ESLint flat config、Stylelint、JSDoc 与文件/函数规模检查。
- 实施：建立根配置和 `check-file-size`；仅豁免规格允许的生成物；用临时失败夹具验证后移除。
- 非目标：业务测试和 CI。
- 验收：缺少文件/函数 JSDoc、超过行数、原始业务颜色和 `console.log` 均失败；合法样例通过。
- 验证：`pnpm format:check`、`pnpm lint`、`pnpm check:file-size`。

### FND-05 完成证据

- 改动：配置独立 Prettier、类型感知 ESLint flat config、Stylelint、Design Token 限制和手写文件 400 行扫描脚本。
- 验证：`pnpm check:file-size`、`pnpm format:check`、`pnpm lint`、`pnpm typecheck`、`pnpm build` 与 `pnpm peers check` 均退出 0。
- 证据：临时失败夹具分别触发 `require-file-overview`、`require-jsdoc`、`no-console`、`declaration-strict-value`、`declaration-no-important` 和 405 行文件阻断，验证后已删除。
- 风险：当前 `npmmirror` 不实现 npm audit endpoint，`pnpm audit --audit-level high` 无法运行；未切换用户 registry，依赖漏洞扫描留给支持审计源的 CI 环境。

### FND-05A 统一中文注释规范与全仓审计

- 状态：已完成（2026-08-15）。
- 目标：所有手写源码自然语言注释使用中文；文件与函数用一句话说明职责或关键约束，不保留历史叙述。
- 非目标：翻译标识符、协议名、库名、JSDoc 标签、工具指令、生成文件和第三方内容。
- 改动：精简 Agent 与工程规范；为 `pnpm lint` 增加无依赖中文注释扫描；审计并规范化 API、Web、Worker、共享包、测试、脚本和配置注释。
- 验证：`pnpm lint:comments` 检查 107 个文件、614 条注释；临时英文夹具准确报告两条违规且已移除；文件规模、Prettier、ESLint、Stylelint、6 包 typecheck、44 项轻量测试和 6 包生产构建通过。
- 范围：全仓注释审计必须触及所有含注释手写文件，因此不适用单任务 8 个文件的常规上限；未修改业务行为。
- Skill 影响：Requirements 将“中文、精简、无历史叙述”转为可验证边界；Reuse First 复用现有 JSDoc 门禁并只补充仓库扫描器；Ponytail 避免新增依赖和抽象。
- 风险：无。

## FND-06 建立运行时配置校验

- 状态：已完成。
- 依赖：FND-03、FND-05。
- 必读：`docs/02-architecture/system.md`、`docs/02-architecture/api-and-events.md`、`AGENTS.md`。
- 目标：API 与 Worker 启动时校验数据库、Redis 和对象存储配置。
- 实施：普通配置使用 Nest DTO 与 `class-validator`；LLM/Search 可选配置按完整组合校验；Web 构建不读取服务端密钥。
- 非目标：Provider、数据库和对象存储连接测试。
- 验收：缺少必需配置时快速失败；可选配置不完整时返回可定位错误；不使用 Zod。
- 验证：配置单元测试和 API/Worker 启动失败测试。

### FND-06 完成证据

- 改动：API 与 Worker 使用 Nest Config、`class-validator` 和白名单投影校验 PostgreSQL、Redis、S3 及可选 Provider 配置；完整契约已写入开发规范。
- 验证：API/Worker 配置测试共 8 项全部通过；缺少基础配置时两个进程均退出 1；完整本地假配置下 Worker 正常退出且 API 就绪端点返回 HTTP 200。
- 证据：测试覆盖必填字段、空字符串、Provider 组合完整性、冻结结果和错误不回显密钥值；`pnpm lint`、聚焦类型检查、格式与文件规模门禁通过。
- 风险：本任务只验证配置结构，不连接 PostgreSQL、Redis 或 S3；真实依赖健康检查在 FND-08 环境就绪后实现。

## FND-07 建立请求关联与结构化日志

- 状态：已完成。
- 依赖：FND-03、FND-06。
- 必读：`docs/02-architecture/api-and-events.md`、`docs/03-engineering/quality-gates.md`、`AGENTS.md`。
- 目标：API 统一生成或接收 request ID，并用 Nest Logger 输出结构化安全日志。
- 实施：响应回传 request ID；日志脱敏密钥、Cookie、正文和 Prompt；Worker 保留任务关联字段入口。
- 非目标：业务审计事件和第三方可观察性平台。
- 验收：合法请求 ID 被保留，缺失或非法值生成 UUID；日志不含敏感字段。
- 验证：API 集成测试与日志快照检查。

### FND-07 完成证据

- 改动：API Middleware 统一解析、生成和回传 request ID，并记录安全字段白名单；API/Worker 使用 Nest 单行 JSON Logger，Worker 日志入口支持任务关联标识。
- 验证：API 集成测试验证合法、非法和缺失 request ID；API/Worker 日志结构测试共 4 项通过；前台 Worker 启动输出均可解析为单行 JSON。
- 证据：HTTP 完成日志只包含事件、request ID、方法、无查询路径、状态码和耗时；Worker 只接受事件、服务及可选 `jobId/runId/requestId`，不接受任务载荷。
- 风险：本阶段没有业务异常端点；错误响应体与响应头 request ID 一致性将在首个全局异常过滤器落地时加入集成测试。

## FND-08 建立本地依赖环境

- 状态：已完成。
- 依赖：FND-01、FND-06。
- 必读：`docs/02-architecture/system.md`、`docs/03-engineering/development.md`。
- 目标：用 Docker Compose 启动 PostgreSQL+pgvector、Redis 和 SeaweedFS S3，并提供健康检查与持久卷。
- 实施：固定兼容版本；端口只绑定 localhost；提供示例环境文件；不加入应用镜像。
- 非目标：生产 TLS、备份和容器安全加固。
- 验收：三项依赖健康；重启后测试数据保留；端口与凭据可通过环境覆盖。
- 验证：`docker compose up -d`、健康检查命令、重启持久化检查。

### FND-08 完成证据

- 改动：新增固定镜像版本的 Compose、本地环境变量示例、pgvector 初始化脚本和持久卷；补充本地启动与数据重置边界。
- 验证：`docker compose config --quiet` 通过；PostgreSQL、Redis 与 SeaweedFS 均为 `healthy`，分别通过 pgvector `0.8.2` 查询、认证 `PONG` 和 `/healthz` 检查。
- 证据：端口均只绑定 `127.0.0.1`；执行 `docker compose down` 后重建，PostgreSQL 行、Redis 键和 SeaweedFS 文件均保留，验证标记随后已清除且命名卷未删除。
- 环境说明：本机 `6379` 已被其他进程占用，本次以 `REDIS_PORT=6380` 验收；凭据仅在当前命令进程传入，没有创建或提交 `.env`。
- 风险：当前配置仅用于本地开发，不包含生产 TLS、备份、密钥托管或应用级依赖就绪探测。

## FND-09 建立测试骨架与根检查命令

- 状态：已完成。
- 依赖：FND-05、FND-08。
- 必读：`docs/03-engineering/quality-gates.md`、`docs/03-engineering/development.md`。
- 目标：建立 Vitest 单元/集成/组件入口、Supertest API 测试、Playwright E2E 和根 `pnpm check`。
- 实施：覆盖健康页与健康端点；配置 80% 全局覆盖率门槛；测试不依赖真实 Provider。
- 非目标：业务 E2E 和真实 Provider 测试。
- 验收：根测试命令齐全；失败测试和覆盖率不足会阻断；Playwright 产物可诊断。
- 验证：`pnpm check`、`pnpm test:e2e`。

### FND-09 完成证据

- 改动：建立 Vitest 单元/集成/组件 project、V8 全局覆盖率、Supertest API 集成测试、Testing Library 组件测试和 Playwright 生产构建 E2E。
- 验证：`pnpm check` 退出 0；6 个测试文件共 15 项通过，语句/函数/行覆盖率 100%，分支覆盖率 81.81%；Web、API、Worker 和共享 package 全部类型检查与构建通过。
- 阻断验证：临时以 `--coverage.thresholds.branches=101` 运行时退出 1；Playwright 失败场景生成 `trace.zip` 和错误上下文。
- E2E 证据：系统 Chrome 中首页标题与一级标题断言通过；测试使用生产构建、语义定位和标准 Playwright `webServer`，CI 负责验证完整命令生命周期。
- 环境限制：Codex 无 TTY 命令包装会在 pnpm 依赖预检阶段中止；直接运行 Playwright 时浏览器断言通过，但 Windows 子进程回收超出工具时限。未为此修改系统或增加自定义杀进程逻辑。

## FND-10 建立 GitHub Actions 门禁

- 状态：已完成。
- 依赖：FND-09。
- 必读：`docs/03-engineering/quality-gates.md`、`docs/03-engineering/development.md`。
- 目标：建立静态/单元、Docker 集成和 E2E 三类 CI Job。
- 实施：使用锁文件安装；集成 Job 启动 Compose；E2E 失败上传 Trace；不使用真实 Provider 密钥。
- 非目标：部署、发布和远程仓库配置。
- 验收：任一门禁失败阻断 CI；Job 之间职责清晰；本地命令与 CI 一致。
- 验证：Workflow 语法检查、`pnpm check`、`pnpm test:e2e`。

### FND-10 完成证据

- 改动：建立静态与单元质量、Docker 依赖、浏览器 E2E 三个独立 GitHub Actions Job；均使用冻结锁文件或固定镜像，不含部署和真实 Provider 凭据。
- 验证：Workflow 通过 Prettier YAML 解析；`pnpm install --frozen-lockfile` 与 `pnpm check` 退出 0；Compose 配置有效且 PostgreSQL、Redis、SeaweedFS 均为 `healthy`。
- E2E：已有系统 Chrome 首页断言通过；CI 使用 Playwright 官方 Chromium 安装命令，失败时上传 7 天有效的 Trace。
- 风险：当前网络访问 Playwright CDN 超时，且 Codex 无 TTY 预检会先于本地 `pnpm test:e2e` 中止；首次推送后仍需以远端 Actions 结果确认完整 E2E 生命周期。

## 检查点

FND-01..10 已完成。检查点版本为 Node 24.18.0、pnpm 11.20.0、TypeScript 5.9.3、Next.js 16.2.9、NestJS 11.1.28、Vitest 4.1.10、Playwright 1.62.1、pgvector 0.8.2/PostgreSQL 17、Redis 8.8.0 与 SeaweedFS 4.29。

`pnpm check` 退出 0；6 个测试文件共 15 项通过，语句、函数和行覆盖率 100%，分支覆盖率 81.81%；Web、API、Worker 与共享 package 全部构建通过。`docker compose up --detach --wait` 退出 0，三个依赖服务均为 `healthy`。远端 E2E 首次运行是进入 UI 里程碑前唯一待确认的外部证据。
