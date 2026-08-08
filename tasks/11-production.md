# 里程碑 11：生产加固

完成后 Docker Compose 自托管具备备份恢复、安全、可观察性、性能预算和完整发布门禁。

## OPS-01 构建生产镜像与 Compose

- 依赖：SHARE-06。
- 必读：`docs/02-architecture/system.md`、`docs/03-engineering/development.md`、`docs/03-engineering/quality-gates.md`。
- 目标：为 Web/API/Worker 建立最小非 root 生产镜像、健康检查、资源限制和版本一致性校验。
- 实施：多阶段构建；只注入运行所需环境；启动前检查迁移和 Workflow Schema 兼容。
- 非目标：Kubernetes、多区域和自动扩缩容。
- 验收：干净主机一条 Compose 命令启动；服务健康和版本一致；镜像不含开发密钥。
- 验证：镜像构建、容器健康、镜像内容与漏洞扫描。

## OPS-02 实现备份与恢复演练

- 依赖：OPS-01。
- 必读：`docs/02-architecture/system.md`、`docs/02-architecture/data-model.md`。
- 目标：备份 PostgreSQL 与 MinIO，并提供一致性恢复步骤和校验报告。
- 实施：记录应用版本、迁移版本、对象清单和时间；恢复到隔离环境，不覆盖现有实例。
- 非目标：跨区域持续复制和无限历史保留。
- 验收：恢复后文档、附件、运行索引和分享快照一致；Redis 丢失可重建调度。
- 验证：自动备份、隔离恢复、抽样哈希和业务 E2E。

## OPS-03 完善可观察性

- 依赖：OPS-01。
- 必读：`docs/02-architecture/system.md`、`docs/02-architecture/ai-workflow-runtime.md`、`docs/03-engineering/quality-gates.md`。
- 目标：建立结构化日志、请求/运行关联、队列健康、Provider 用量、错误率和关键延迟指标。
- 实施：定义脱敏字段；健康检查区分存活/就绪；告警只覆盖用户可行动故障。
- 非目标：自建大型可观察性平台和隐含推理记录。
- 验收：一次用户操作可关联 API、Queue、Run 和文档修订；日志无正文/密钥；积压可诊断。
- 验证：日志扫描、故障注入和指标断言。

## OPS-04 执行安全加固

- 依赖：SHARE-02、SHARE-03、OPS-01。
- 必读：`AGENTS.md`、`docs/02-architecture/system.md`、`docs/03-engineering/quality-gates.md`。
- 目标：完成输入、XSS、CSRF、SSRF、SQL、附件、公开限流、密钥和依赖安全审查。
- 实施：Critical 全部修复；High 修复或记录用户接受的处置；轮换测试密钥并检查历史文件。
- 非目标：正式渗透测试认证。
- 验收：安全检查表全部有证据；错误不泄露内部信息；公开与 Provider 边界有限流。
- 验证：安全测试、依赖/镜像扫描、密钥扫描。

## OPS-05 性能与容量验证

- 依赖：OPS-01、OPS-03。
- 必读：`docs/03-engineering/quality-gates.md`、`docs/02-architecture/system.md`、`docs/01-design/layout-and-navigation.md`。
- 目标：验证大文档树、长文编辑、搜索、并发 Worker 和运行详情的既定分页/异步设计。
- 实施：建立可重复数据集与预算；只根据测量优化；记录个人单机推荐容量。
- 非目标：为未知规模引入新基础设施。
- 验收：导航不全量加载树；输入不等待索引；队列并发不造成重复副作用；页面无明显布局抖动。
- 验证：负载脚本、浏览器性能 Trace、数据库查询计划。

## OPS-06 固化发布门禁

- 依赖：OPS-02..05。
- 必读：`docs/03-engineering/quality-gates.md`、`docs/00-product/release-roadmap.md`、`tasks/README.md`。
- 目标：把所有核心 E2E、覆盖率、构建、迁移、备份恢复和安全检查纳入版本发布清单。
- 实施：失败门禁不得跳过；记录产物版本、命令、Trace 和已知风险；提供回滚步骤。
- 非目标：自动发布到公共云。
- 验收：干净环境完整执行；任何核心 E2E 或恢复演练失败阻止发布；清单可由下一位 Agent 复现。
- 验证：`pnpm check`、`pnpm test:e2e`、生产 Compose smoke、恢复与回滚演练。

## 完成检查点

只有 OPS-01..06 的证据全部存在，Everlearn 才可标记为生产可用；文档、任务状态和实际部署版本必须一致。
