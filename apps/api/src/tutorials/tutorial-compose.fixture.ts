/**
 * @fileoverview 提供教程对话集成测试共享的 mock LLM 服务器与进程环境夹具。
 */

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/** 测试夹具的内部密钥。 */
export const internalSecret = 'tutorial-compose-secret';

/** 用于设置连接级搜索路径且不读取或修改凭据。 */
export function scopedUrl(connectionString: string, schemaName: string): string {
  const url = new URL(connectionString);
  url.searchParams.set('options', `-csearch_path=${schemaName},public`);
  return url.toString();
}

/** 用于启动按消息角色区分 compose/大纲/正文的 mock LLM 服务器。 */
export async function startLlmServer(
  composeReplyOf: () => string,
  outlineJson: string,
): Promise<{ baseUrl: string; server: Server }> {
  const server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => {
      body += String(chunk);
    });
    request.on('end', () => {
      const messages = (JSON.parse(body) as { messages: { content: string }[] }).messages;
      const last = messages.at(-1)!.content;
      const content = messages.some((message) => message.content.includes('教程创作助手'))
        ? composeReplyOf()
        : last.includes('大纲')
          ? outlineJson
          : '# 章节正文\n\n这是生成内容 [1]。';
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ choices: [{ message: { content } }] }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${address.port}`, server };
}

/** 用于在导入 AppModule 前提供含内部密钥与测试 LLM 的非生产配置。 */
export function applyFixtureEnvironment(llmBaseUrl: string, databaseUrl: string): void {
  Object.assign(process.env, {
    DATABASE_URL: databaseUrl,
    LLM_API_KEY: 'test-llm-key',
    LLM_BASE_URL: llmBaseUrl,
    LLM_MODEL: 'test-model',
    PURGE_TRIGGER_SECRET: internalSecret,
    REDIS_URL: 'redis://127.0.0.1:6379',
    S3_ACCESS_KEY: 'integration-test-access',
    S3_BUCKET: 'integration-test',
    S3_ENDPOINT: 'http://127.0.0.1:8333',
    S3_FORCE_PATH_STYLE: 'true',
    S3_REGION: 'local',
    S3_SECRET_KEY: 'integration-test-secret',
  });
  delete process.env.SEARCH_PROVIDER;
  delete process.env.SEARCH_API_KEY;
}

/** 范围提案的标准载荷样例。 */
export const scopePayload = {
  audience: '后端工程师',
  depth: 'standard',
  excludeTopics: [] as string[],
  goals: '掌握迁移',
  includeTopics: ['migration'],
  knowledgeBaseIds: [] as string[],
  level: 60,
  topic: 'Kysely 入门（改）',
};

/** 大纲提案的标准载荷样例。 */
export const outlineProposalPayload = {
  chapters: [
    { dependsOn: [], nodeKey: 'intro', summary: '基础概念', title: '入门（对话版）' },
    { dependsOn: ['intro'], nodeKey: 'advanced', summary: '高级用法', title: '进阶（对话版）' },
  ],
};
