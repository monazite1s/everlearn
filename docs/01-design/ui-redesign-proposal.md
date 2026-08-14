# UI 改版设计方案 v2（提案，待用户放行）

> 依据 8 路调研合成（Linear/Notion/Raycast/Arc 生产级实测、Geist/shadcn/Radix 组件工艺、Mantine 9.5 源码、中文排版研究、AI-UX 指南、动效规范、导航列表源码调研），经设计总监审核（有条件通过）后修订。v2 修订记录见文末。

## 一、设计原则（五条铁律）

1. **深度靠表面阶梯，不靠边框和重阴影**：每级表面明度差 2-6%；阴影单层透明度 ≤8%、无位移（浅色常态 5-8%，深色加重）。
2. **hover/选中一律中性色叠加（4-10% 前景色），绝不用品牌色做 hover**。
3. **彩色是标点不是句子**：accent 只出现在四处——主操作、当前导航项背景、链接、知识脊线（文档树/面包屑/正文标题当前位置）。Command Menu 选中条为第五处经批准例外。
4. **响应即时**：导航 hover 零延迟；按钮过渡 150ms；按压 `scale(.97)`；交互动效 ≤200ms。
5. **外壳退后，内容为纸**：浅色模式侧栏比主区**深**一档、主区最亮（Notion `#fff` 内容 / `#f7f7f5` 侧栏、shadcn 同律）；深色模式反转——侧栏比主区**亮**一档（Notion `#202020` 侧栏 / `#191919` 内容、shadcn 同律）。正文永远坐在"纸面"上。

## 二、视觉地基（token 表，paper/neutral × 浅/深四套全量）

### 2.1 表面阶梯（`--surface` 更名 `--shell`，语义=外壳面板）

| Token | paper 浅 | paper 深 | neutral 浅 | neutral 深 | 用途 |
|---|---|---|---|---|---|
| `--canvas` | `#FBF8F1`（最亮，纸面） | `#191510`（最深，纸面） | `#F9FAFB` | `#171A1E` | 主内容区 |
| `--shell` | `#F0EBE1`（深一档） | `#211C16`（亮一档） | `#EFF1F4` | `#1E2328` | 侧栏/顶栏 |
| `--surface-raised` | `#FFFDF8` | `#2A231C` | `#FFFFFF` | `#272E36` | 卡片/输入框 |
| `--surface-overlay` | `#FFFDF8`（浅色=raised 同底，靠阴影分层） | `#332B22` | `#FFFFFF` | `#2F3740` | Modal/Menu/Popover |

层级语义：**浅色** canvas 最亮 → shell 深一档 → raised 最亮白（浮起物）；**深色** canvas 最暗 → shell 亮一档 → raised/overlay 逐级更亮。侧栏与主区之间**不画分割线**（Notion：纯背景差）。

### 2.2 文字与边框（四套全量）

| Token | paper 浅 | paper 深 | neutral 浅 | neutral 深 | 实测对比度（on canvas） |
|---|---|---|---|---|---|
| `--ink` | `#37322A` | `#EDE6D8` | `#24292F` | `#E8ECEF` | ≈12:1 AAA |
| `--ink-muted` | `#6B6255` | `#AFA392` | `#5C6670` | `#A6B0BA` | 5.6:1 AA（自算） |
| `--ink-faint` | `#6F6759` | `#998F7F` | `#626C76` | `#96A0AA` | 4.6:1 AA（自算，占位符/禁用亦达标） |
| `--border` | `rgb(55 50 42 / 10%)` | `rgb(237 230 216 / 13%)` | `rgb(36 41 47 / 10%)` | `rgb(232 236 239 / 13%)` | alpha 前景轨 |
| `--border-strong` | `rgb(55 50 42 / 18%)` | `rgb(237 230 216 / 22%)` | `rgb(36 41 47 / 18%)` | `rgb(232 236 239 / 22%)` | 输入框常驻边界 |
| `--hover-overlay` | `rgb(55 50 42 / 6%)`（列表/大面可升 8% 实测定档） | `rgb(237 230 216 / 8%)` | `rgb(36 41 47 / 6%)` | `rgb(232 236 239 / 8%)` | 基础色随新 ink 更新 |

### 2.3 状态色（新增，四套同步定义，进 design-system 映射表审批）

| Token | 浅 | 深 | 用途 |
|---|---|---|---|
| `--info`（运行中） | `#2F6FA8` | `#7FB3E3` | 运行中徽章/进度，配脉冲动画（禁 spinner 叠加） |
| `--info-soft` | `rgb(47 111 168 / 12%)` | `rgb(127 179 227 / 14%)` | 运行中浅底 |
| 排队/取消 | 复用 `--ink-muted` | 同左 | 灰 |
| 超时 | 复用 `--warning` | 同左 | 橙 |
| 失败/成功 | 复用 `--danger` / `--success` | 同左 | — |

### 2.4 圆角（维持 6/10/14）

`--radius-small` 6px（按钮/输入/导航项/徽章）；`--radius-medium` 10px（卡片/下拉/命令面板）；`--radius-large` 14px（Modal/Drawer）。派生规则：内圆角 = 外圆角 − padding。

### 2.5 阴影（替代零引用的 float/drag；深色独立档）

```css
/* 浅色 */
--shadow-card:       0 1px 2px rgb(55 50 42 / 5%);
--shadow-card-hover: 0 1px 2px rgb(55 50 42 / 5%), 0 6px 14px rgb(55 50 42 / 8%);
--shadow-overlay:    0 0 0 1px var(--border), 0 4px 8px -4px rgb(55 50 42 / 7%),
                     0 16px 24px -8px rgb(55 50 42 / 6%);
--shadow-modal:      0 0 0 1px var(--border), 0 8px 16px -4px rgb(55 50 42 / 7%),
                     0 24px 32px -8px rgb(55 50 42 / 6%);
/* 深色（加重至可见；假亮边 --border 承担主要层级） */
--shadow-overlay:    0 4px 16px rgb(0 0 0 / 24%), 0 8px 24px rgb(0 0 0 / 20%);
--shadow-modal:      0 8px 24px rgb(0 0 0 / 32%), 0 16px 40px rgb(0 0 0 / 24%);
```

要点：假亮边（`0 0 0 1px var(--border)`，Geist/Raycast 手法）；卡片 hover 用阴影升档**替代现有 translateY + accent 边框**（现状方案廉价，是本次性价比最高的单项改动）；neutral 深色阴影同值。

### 2.6 字重与图标

- 字重三档 400 / 550 / 650。**前提**：Inter 非自托管时 550 由系统字体就近取整，可接受；存量 h1 的 600 迁移映射：h1→550、卡片标题 fw 650→550（视觉核对后定）。数字场景 `tabular-nums`。
- 图标两档 16/20px；行内 `1em + vertical-align: -0.125em`；成对 flex 居中 + 8px 间距。

### 2.7 动效

`--duration-micro` 150ms（hover/按钮）；`--duration-panel` 220ms（浮层/抽屉）；`--duration-scene` 320ms（预留，当前无消费方）；`--duration-cycle` 1.5s（骨架呼吸，替代 1.4s）；`--ease-in` `cubic-bezier(0.2,0,0,1)`；`--ease-out` `cubic-bezier(0.3,0,1,1)`（新增，退出）。导航 hover `transition: none`；按压 `scale(.97)`；退出 ≈ 进入 × 0.7。

## 三、外壳与导航

### 3.1 结构（定 A 案：Notion 式层次；B 案浮层弃用）

- 侧栏 264px / 折叠 56px 图标栏；背景 `--shell`（浅深一档、深亮一档），与主区无分割线；顶栏同 `--shell`，与侧栏连成同色 L。
- 主区 `--canvas` 纸面直接排版（PageShell 容器维持 76rem）。
- B 案（主区圆角浮层）弃用理由：三层嵌套圆角与长文书写冲突、强造型与"安静"气质相斥、压缩内容宽度；"全是方的"的病根（分割线+实色边框+translateY hover+accent 边框+主区发暗）在 A 案表面反转与阴影公式下全部消除。
- 侧栏拖拽调宽（240-284）与把手伸长动效：**预留数值，本期不实施**（YAGNI）。

### 3.2 导航项（现状已基本落地，剩余 delta 见 3.5）

全宽圆角背景块（6px）、无左条（**禁令适用范围：主导航**；Command Menu 选中条不受此限）；hover `--hover-overlay` 零延迟；当前态 `--accent-soft` + 字重 650 + 图标不透明度 60%→100%。高度：桌面 32px / 触控 44px，切换条件 `@media (pointer: coarse)`。字号 14px、图标 16px、间距 8px。知识脊线只用于文档树/面包屑/正文标题当前位置标记。

### 3.3 移动端（规格变更，需产品确认）

底部 tab（49px + safe-area，4 项：首页/知识库/资讯/我）替代抽屉（Readwise/微信读书/Instapaper 一致）；阅读沉浸态隐藏 tab。未确认前维持抽屉。

## 四、组件规范

| 组件 | 规格 |
|---|---|
| 卡片 | raised 背景 + 假亮边 + `--shadow-card`；hover 边框加深至 strong + `--shadow-card-hover`（**移除 translateY 与 accent 边框 hover**）；整卡可点 + `:focus-visible` |
| 按钮 | filled=accent；default=raised+border，hover 叠 overlay（表面重排后复核 `--mantine-color-default-hover` 方向）；subtle hover 同律；按压 `scale(.97)`/150ms |
| 输入框 | 36px 高、6px 圆角、`--border-strong`；聚焦=边框变 accent + 3px 50% 透明贴合光环（无 offset） |
| 状态徽章 | 列表 8px dot+文本 / 详情 20px pill；运行中 `--info`+脉冲；颜色必配文本（Geist/Temporal/Inngest 收敛） |
| 列表行 | 42px（表头 36px）；hover 叠 overlay；行内操作图标"行 hover 时 opacity 0→1 显现"（语义描述，实现用 CSS Modules `:hover`） |
| 骨架 | 300ms 延迟出现；呼吸 opacity 0.4→1.0 / 1.5s / linear；<1s 不显示指示器；2-10s 骨架；>10s 阶段文案 |
| 空态 | 视觉锚点 + 一句说明 + 主行动（已有组件维持） |
| 焦点环 | 控件=3px 50% 贴合环 + 描边变色；卡片/导航=outline 2px + offset 2px；Mantine `focusRing: 'auto'` |
| kbd | 等宽、87.5%、1px 边框 + 2px 底边、4px 圆角 |

## 五、中文排版与文案

界面正文 14px/辅助 12px/小标题 16px；阅读区 16px/1.75；**行长 760→680px（约 42 字/行），同步三份规格文档**（layout-and-navigation.md、pages/editor.md、pages/settings-and-public-view.md）。中西文间距：产品文案手写 U+0020；UGC 在** prose 阅读区**启用 `text-autospace: normal`（代码块/kbd/表格数字豁免）。引号弯引号、省略号 ……、术语 Inbox→收件箱（进 DoD 检查单执行）。相对时间阈值 <45s/45min/22h/昨天 HH:mm/本年 MM-DD/跨年 YYYY-MM-DD（注明：22h 滚动窗与自然日"昨天"在深夜边界会错位，接受该取舍）；hover 恒给绝对时间。正文 `overflow-wrap: anywhere`、禁 `break-all`。webfont（cn-font-split 分包）与阅读字体加载为独立后续任务。

## 六、交互与动效参数表

Toast 4s（带操作 6-8s、错误不自动关、上限 3、hover/focus 暂停）；撤销=软删除先执行 + 5s undo 窗口；危险确认三级 L0（直接执行+撤销）/L1（弹窗陈述后果无默认焦点）/L2（输入名称，如删知识库）；页面切换不做整页过渡、局部淡入 200ms、路由后聚焦 h1；列表删除收拢 220ms（Motion layout，随编辑器任务）；reduced-motion：位移→cross-fade、骨架→静态 0.6、流式→立即全文；`?` 快捷键面板；Cmd+K Command Menu（640px、item 48px、输入 44px/18px、选中=背景 + 左 3px accent 条[批准的例外]、kbd 12px）。

## 七、AI 场景专项（随模块施工，不提前实现）

持久"AI 生成"图标+文字标注（不裸用 sparkles）；流式五状态 + 始终可停止；滚动纪律（距底 ≤100px 才跟随，上滚/选中即解除 + "回到最新"）；引用三层（内联 chip → 悬停预览卡 → 完整来源列表）；进度不用假百分比（1-10s 不定式+真实阶段点亮，>10s 后台模式）；先确认大纲再生成、结果落可编辑画布、段落级局部再生成。

## 八、深色模式

深色表面阶梯逐级渐亮（191510→211C16→2A231C→332B22），拉大与 canvas 差值修复"糊成一团"；阴影加重档 + 假亮边承担层级；切换预注入脚本维持。

## 九、工程落地

1. **P0 前置基建**：对比度实算脚本（token 配对进 `pnpm check`，AA 硬门禁，faint 已达标）；Playwright 无头截图脚本（浅/深/390 三截图 + computed-style 抽查，替代 IAB）。
2. token 按 2.1-2.7 重构（`--surface`→`--shell` 更名涉及引用同步）；check:design-tokens 扩展覆盖新 token。
3. Mantine 映射补全：Drawer 显式 radius（默认 0 陷阱）、Modal radius=large、`--mantine-color-info` 注册；**radius 未注册 key 静默失败陷阱进规范**。

## 十、现状 → 目标 delta 表与实施分期

**P0（视觉地基 PR）真实 delta**：
1. 表面反转：侧栏/顶栏 surface→shell（浅深一档/深亮一档）、主区 canvas 提亮至 `#FBF8F1`、分割线移除（header/navbar border 删除）。
2. 卡片 hover：translateY + accent 边框 → 阴影升档 + 边框加深（knowledge-page.module.css）。
3. token 重构全量（2.1-2.7 四套）+ ink 换暖黑 + 边框 alpha 化 + 阴影四枚。
4. 导航剩余三件：桌面 44→32px、图标 60%→100% 不透明度梯度、`pointer: coarse` 切换。
5. 状态色 token + Mantine info 注册。
6. 输入框 focus 范式（3px 贴合环）。
7. 骨架呼吸参数（1.5s/0.4-1.0）+ 300ms 出现延迟。
8. 前置基建（对比度脚本 + Playwright 截图脚本）。
9. 已落地勿重复：导航全宽圆角块/hover 零延迟/focusRing auto/Card 与 Input 接管/NavLink 6px。

**P1**：状态徽章组件、列表行规范、相对时间工具（含阈值表）、页面局部淡入、PageShell 行长 680 + 三文档同步。**P2**：Command Menu、快捷键面板、Toast/撤销体系、移动端底部 tab（需产品确认）、AI 组件（随模块）。

风险：移动端 tab 与行长变更为规格变更需确认；`--shell` 更名的引用面；字重 550 的字体前提。

## v2 修订记录（响应设计总监审核）

1. 反转外壳明度（侧栏浅深一档/深亮一档，主区为纸）并修正被反向引用的 Notion/Linear 依据。
2. 全部 token 补齐 paper/neutral × 浅/深四套。
3. 阴影原则改为"单层 ≤8%、无位移"，消除与数值的矛盾；如实表述"浅色 raised=overlay 靠阴影分层"。
4. ink-faint 提值至 4.6:1 过 AA（自算标注替换 Linear 抄值）。
5. 新增现状→目标 delta 表，P0 按真实 delta 重列（导航项已落地部分标记勿重复施工）。
6. 状态色（运行蓝/灰/橙复用）四套定义进 P0，走映射表审批。
7. 对比度脚本 + Playwright 截图基建排入 P0 前置。
8. 清除 Tailwind 类名表述；左条禁令限定主导航；accent 用法对账（cmdk 例外已批准）。
9. 760→680 同步三份文档；autospace 限 prose 区豁免代码块；hover-overlay 标注基础色更新；32/44px 用 `pointer: coarse` 切换；字重前提与 600 迁移映射补充。
