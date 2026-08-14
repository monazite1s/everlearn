# 开发规范

## 开始任务

1. 从 `docs/tasks/README.md` 选择首个依赖已完成的任务。
2. 只读取任务列出的最多三份上下文文档和将修改的现有实现。
3. 确认任务目标、非目标、接口、状态和验收；缺失时先修正规格，不在代码中猜测。
4. 用 `rg` 搜索已有模块、类型、组件和依赖；禁止重复实现。
5. 涉及复杂模块或新增依赖时，先按研究规则记录证据和选择。

## Monorepo 边界

```text
apps/web            Next.js 页面与 feature
apps/api            NestJS HTTP/SSE 与应用服务
apps/worker         队列消费者、LangGraph 和后台维护
packages/contracts  共享枚举、事件与安全传输类型
packages/ui         Design Tokens 与稳定通用 UI
packages/agent-runtime  Agent 专用状态、Schema 和工具协议
```

- Nest 模块先以 `controller / application / domain / infrastructure` 的实际需要组织；没有第二个实现时不创建空接口或抽象工厂。
- Next 页面只负责路由组合；业务状态、组件和 CSS 放在 `features/<feature>`。通用组件必须语义稳定且至少复用两次。
- 禁止跨应用源码相对导入；共享内容只能经明确 package 出口。
- 禁止 `common`、`shared`、`utils` 成为无所有权目录；通用函数按领域命名并放在最窄作用域。

## 编码原则

- 先写最小正确实现。第三个真实用例出现前不建设通用框架。
- 函数单一职责，使用早返回控制嵌套；不可变更新，不修改传入对象。
- 每层显式处理错误：基础设施映射外部错误，应用层决定业务结果，UI 展示可行动信息。
- 数据库查询参数化；跨实体不变量在应用服务或领域对象中校验，不能只依赖 Controller DTO。
- 队列任务按至少一次交付设计；外部写入和文档创建必须有业务幂等约束。
- 正式日志使用结构化 logger；禁止生产 `console.log` 和记录正文、Prompt、密钥或外部全文。

## JSDoc

```ts
/**
 * @fileoverview 将已确认的 AI 修改写入带版本的文档。
 */

/** 用于原子接受已审核补丁并记录对应修订。 */
async function acceptGeneration(input: AcceptGenerationInput): Promise<DocumentRevision> {
  // 写入与修订记录必须在同一事务中提交。
}
```

- 所有自然语言注释使用中文；代码标识符、协议名、库名、JSDoc 标签和工具指令不翻译。
- 文件说明用一句话界定职责；函数说明用一句话说明存在目的或关键约束。
- 只有参数单位、抛错、副作用或不变量无法由签名表达时才增加 JSDoc 标签。
- 内联注释只解释非显然约束；不记录历史、排障过程、方案争论，不复述下一行代码。
- 禁止教程式长文、正反例凑数、TODO 堆积和注释掉的代码。

## 数据库与依赖变更

- 新迁移、依赖、Provider、CI 或部署变更必须先获得用户确认并绑定独立任务。
- 迁移必须有前向与回退/恢复策略；生产数据转换不得和无关 Schema 修改混在同一迁移。
- 新依赖必须记录解决的问题、版本/许可、维护状态、替代方案和移除成本。
- 依赖锁定使用 workspace 统一策略；应用不得各自引入不同主版本。

## 服务端运行时配置

API 与 Worker 在 Nest 应用创建前校验同一基础契约，缺少、空值或格式错误均阻止启动。错误只允许返回字段名与约束，不得回显配置值。

| 分组       | 环境变量                                                                                         | 规则                                                      |
| ---------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| PostgreSQL | `DATABASE_URL`                                                                                   | 必填，协议为 `postgres` 或 `postgresql`。                 |
| Redis      | `REDIS_URL`                                                                                      | 必填，协议为 `redis` 或 `rediss`。                        |
| S3         | `S3_ENDPOINT`、`S3_REGION`、`S3_BUCKET`、`S3_ACCESS_KEY`、`S3_SECRET_KEY`、`S3_FORCE_PATH_STYLE` | 全部必填；path style 只接受字符串 `true` 或 `false`。     |
| LLM        | `LLM_BASE_URL`、`LLM_API_KEY`、`LLM_MODEL`                                                       | 可省略；提供任一字段时必须提供完整组合。                  |
| Search     | `SEARCH_PROVIDER`、`SEARCH_API_KEY`                                                              | 可省略；提供任一字段时必须完整，首个 Provider 为 Tavily。 |

API 与 Worker 只选择上述白名单字段；其他进程环境变量不得进入应用配置对象。这些变量不得进入 Web 客户端 Bundle。

Web 构建和服务端运行只额外读取 `API_INTERNAL_URL`，值为 Nest API Origin，例如本地 `http://127.0.0.1:3001` 或 Compose 内 `http://api:3001`。浏览器不接触该值，只使用同源 `/api/v1`；该转发不得承载业务校验、DTO 映射或错误改写。

## 本地依赖环境

1. 复制 `.env.example` 为 `.env`，替换所有本地占位凭据；不得提交 `.env`。
2. 执行 `docker compose up -d --wait`，再用 `docker compose ps` 确认三项依赖为 `healthy`。
3. 自定义端口或凭据时，同步修改连接 URL，确保应用配置与 Compose 配置一致。
4. `docker compose down` 会保留命名卷；只有明确重置本地数据时才允许执行 `docker compose down -v`。

Compose 仅提供 PostgreSQL+pgvector、Redis 和 SeaweedFS S3，不构建或启动应用服务。所有端口只绑定 `127.0.0.1`。

## 必备命令

根 `package.json` 建立后必须提供：

```text
pnpm dev
pnpm build
pnpm typecheck
pnpm lint
pnpm lint:comments
pnpm lint:js
pnpm lint:css
pnpm format
pnpm format:check
pnpm check:file-size
pnpm test
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm check
```

## 测试反馈顺序

任务开发期间只运行与改动直接相关的检查，按失败成本从低到高执行：

1. `pnpm format:files -- <文件>` 与对应的 `lint:js:files` 或 `lint:css:files`。
2. `pnpm test:component -- <测试文件>`、`test:unit` 或 `test:integration` 的聚焦文件。
3. 受影响应用的 `typecheck`，例如 `pnpm --filter @everlearn/web typecheck`。
4. 页面或路由变更运行受影响应用的生产构建，并人工检查关键交互。
5. 核心业务流程稳定后才启用 `pnpm check:full` 与 E2E。

项目前期不运行 E2E、覆盖率或复杂跨服务测试。`pnpm check` 执行规模、格式、Lint、类型、轻量测试与构建；任务中优先按文件运行必要的单元或组件测试。`pnpm check:full` 才增加覆盖率门禁，Playwright 保留给后续稳定阶段。

任务先运行聚焦测试；里程碑检查点运行 `pnpm check`。不得因当前无代码而伪造成功命令。

## 完成任务

- 行为符合页面和架构规格，非目标没有被顺带实现。
- 正常、空、失败、取消、冲突和恢复路径按任务要求覆盖。
- 聚焦测试、类型检查和相关 Lint 通过；达到检查点时完整构建通过。
- 自审文件/函数大小、循环依赖、重复组件、无用抽象、日志和注释质量。
- 在任务文件填写实际改动、命令与结果；不得开始下一任务。
