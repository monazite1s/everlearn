# Everlearn

面向个人长期学习的一体化知识工作台：把知识库、可信资讯简报、系统教程和可观察的 Agent/Workflow 放在同一处。

当前仓库已经包含 Next.js Web、NestJS API/Worker、PostgreSQL 知识模型、Mantine 应用壳及知识库首个纵向切片。施工进度以 [任务入口](docs/tasks/README.md) 为准。

## 本地启动

环境要求：Node.js 24、pnpm 11、Docker Desktop。

```powershell
pnpm install --frozen-lockfile
Copy-Item .env.example .env
docker compose up -d --wait
pnpm --filter @everlearn/api build
node --env-file=.env apps/api/dist/database/migrate.js up
node --env-file=.env apps/api/dist/main.js
```

另一个终端启动 Web：

```powershell
pnpm --filter @everlearn/web dev
```

浏览器访问 `http://127.0.0.1:3000`。真实密码和密钥只写入本地 `.env`，不得提交。

## 文档

- [文档事实源](docs/README.md)
- [开发交接与换机恢复](docs/99-appendix/development-handoff-spec.md)
- [Agent 强制规则](AGENTS.md)
