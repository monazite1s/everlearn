/**
 * @fileoverview SessionStart hook：向会话注入项目强制门禁提醒。
 */

/** 用于拼装注入上下文。 */
function buildContext() {
  return [
    '【Everlearn 会话门禁提醒】',
    '1. Skill 强制路由见 AGENTS.md：UI 工作必须先读 everlearn-ui-design + everlearn-reuse-first；跨前后端必须 everlearn-requirements + everlearn-api-contract。规则靠执行不靠知晓。',
    '2. 产品/需求类工作在方案定稿或验收前，用 general-purpose agent 承载 .agents/roles/pm.md 做独立产品复核。',
    '3. 注释纪律：简单功能一句话职责陈述；写完后 git diff 逐条自查，门禁脚本通过≠合规。',
    '4. UI 交付证据：浅/深/390 三张 Playwright 截图 + pnpm check:design-tokens 通过；不附截图不得声明完成。',
    '5. 单一障碍 10 分钟时间盒，到点换路径；耗时并行任务优先派 sub agent。',
  ].join('\n');
}

process.stdout.write(JSON.stringify({ additionalContext: buildContext() }));
