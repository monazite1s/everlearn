# 质量门禁

## 规模限制

- 手写 TypeScript、TSX、JavaScript、CSS、测试和配置文件硬上限 400 行，目标 80–250 行。
- 函数、方法、React 组件和测试回调硬上限 50 行；圈复杂度最多 10；嵌套最多 4 层；参数最多 4 个。
- 每个文件最多一个 class。生成文件、锁文件、数据库迁移生成物和第三方快照豁免，且不得手工修改。
- `scripts/check-file-size.mjs` 覆盖所有手写文件；ESLint 对 JS/TS 执行函数与复杂度限制。

## 格式与静态检查

Prettier 独立运行，不使用 `eslint-plugin-prettier`：

```json
{
  "printWidth": 100,
  "tabWidth": 2,
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "arrowParens": "always",
  "endOfLine": "lf",
  "proseWrap": "preserve"
}
```

ESLint 使用 flat config、TypeScript type-aware、Next/Nest 推荐规则、`eslint-plugin-import` 和 `eslint-plugin-jsdoc`。以下为 error：

- `max-lines`、`max-lines-per-function`、`complexity`、`max-depth`、`max-params`、`max-classes-per-file`。
- `no-console`、`import/no-cycle`、`@typescript-eslint/no-explicit-any`、`no-floating-promises`、`no-misused-promises`、`consistent-type-imports`。
- JS/TS/TSX 文件 `@fileoverview` 和所有函数、方法、React 组件 JSDoc 缺失。
- 手写源码的自然语言注释缺少中文，或支持注释的手写文件缺少中文文件说明。

Stylelint 使用 standard config；禁止 `!important`，选择器嵌套不超过 3 层，颜色、间距、圆角、阴影和动效时长必须引用 Design Tokens。

## 测试分层

| 层级 | 责任                                                                   |
| ---- | ---------------------------------------------------------------------- |
| 单元 | 领域规则、状态机、Schema、排序、引用和序列化。                         |
| 集成 | PostgreSQL 仓储、Nest API、BullMQ Worker、SeaweedFS S3 和伪 Provider。 |
| 组件 | 编辑器扩展、shadcn 产品组合、表单状态、键盘和 reduced motion。         |
| E2E  | 用户可见核心闭环和跨服务恢复。                                         |

- 全局行、函数和分支覆盖率不低于 80%。
- Agent Runtime、状态机、工具授权、检索引用、幂等写入和 M7 分享授权分支覆盖率不低于 90%。
- 覆盖率不允许用无断言测试、排除核心文件或重复机械用例凑数。
- 缺陷修复必须包含可证明先失败后通过的回归测试。
- CI 不依赖真实付费 Provider；使用契约一致的伪实现。真实 Provider 测试由显式命令运行。

## 必需 E2E

1. 创建知识库、嵌套文档、自动保存、刷新和修订恢复。
2. AI 修改接受/拒绝/取消和块级引用跳转。
3. 计划简报发布、部分失败质量警告和幂等重试。
4. 教程两次确认、立即建库、章节独立完成和单章重试。
5. Workflow 草稿校验、发布、人工确认、失败和检查点恢复。
6. M7 分享撤销/过期、私有隔离和独立克隆。

## UI 与可访问性

- 键盘可完成主流程；焦点可见且 Dialog/Popover 焦点恢复正确。
- 状态不可只依靠颜色；动态更新使用适度的 `aria-live`，流式 token 不逐字播报。
- 桌面断点和移动只读断点均有视觉回归；主题浅色、深色和 reduced motion 各覆盖关键页面。
- 页面不得出现水平整体滚动；表格、代码和画布在自身容器处理溢出。

## 性能与安全预算

- 知识库树按展开加载；列表接口不得无界返回。
- 编辑输入不等待网络；自动保存与索引异步，失败可恢复。
- API 日志不得包含密钥、完整正文、Prompt、外部全文或 Cookie。
- 所有公开端点限流；所有私有查询验证所有权；SQL 参数化；HTML 和 URL 采用允许列表。
- 依赖和容器镜像在交付前执行漏洞扫描；Critical 必须修复，High 必须有明确处置记录。

## `pnpm check`

前期门禁 `pnpm check` 依次执行：文件规模 → 格式检查 → JS/CSS Lint → 类型检查 → 轻量测试 → 构建。任务优先运行与当前行为直接相关的聚焦测试。

核心流程稳定后启用 `pnpm check:full` 的 80% 覆盖率，并在独立 CI Job 恢复 E2E 发布门禁。Playwright 单场景上限 15 秒、单次运行上限 120 秒；超时视为失败。
