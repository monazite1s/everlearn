# shadcn CLI 治理

依据官方 CLI 文档与官方 skill（skills/shadcn/cli.md）。所有命令经项目包运行器调用：`pnpm dlx shadcn@latest <command>`。只使用文档列出的 flag。

## 检查项目上下文（每次工作第一步）

```bash
pnpm dlx shadcn@latest info          # framework、Tailwind 版本、aliases、base、iconLibrary、已装组件
pnpm dlx shadcn@latest info --json   # 机器可读，供脚本/agent 消费
```

## 安装组件

```bash
pnpm dlx shadcn@latest add button card dialog --yes     # 非交互安装到 aliases 指向目录
pnpm dlx shadcn@latest add sidebar --dry-run            # 预览将写入的文件
pnpm dlx shadcn@latest add sidebar --diff           # 预览差异（含 globals.css 变更）
```

- 安装后必须检查写入文件：组合违规、图标库不匹配、第三方 registry 的 import 路径需修正为项目别名。
- `--overwrite` 会覆盖本地改动，**必须先获用户明确批准**。
- 禁止手工从 GitHub 拷贝 registry 文件；CLI 负责路径解析与 CSS diff。

## 升级/合并上游

```bash
pnpm dlx shadcn@latest add button --diff      # 看上游变化
pnpm dlx shadcn@latest add button --dry-run   # 确认将改动的文件
```

本地有定制时逐文件 smart-merge，保留本地修改；禁止盲目覆盖。

## 搜索与文档（写 UI 前必做）

```bash
pnpm dlx shadcn@latest search "empty state"   # 跨已配置 registry 搜索
pnpm dlx shadcn@latest docs empty             # 返回官方文档/示例链接，取内容阅读
pnpm dlx shadcn@latest view @shadcn/empty     # 查看组件源码与元数据
```

## monorepo 边界（Everlearn 布局）

- 组件源码统一落在 `packages/ui/src/components`（components.json aliases 指向）；`apps/web` 的 `components.json` 以 `tailwind.css` 指回 packages/ui 的主题入口。
- 多 workspace 的 components.json 必须保持 `style`/`baseColor`/`iconLibrary`/`base` 一致。
- 共享包以源码 exports 被 app 消费（transpilePackages），Tailwind 在 app 构建时扫描（`@source` 注册，见 tailwind-standards.md）。

## 禁止事项

- 未列出的 flag 不存在，不要发明。
- 不手工 decode/resolve preset code；preset 切换（nova/vega 等）属于重大视觉决策，需用户批准并走 ADR。
- `shadcn diff`（独立命令）已废弃，用 `add --diff`。
