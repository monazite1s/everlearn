/**
 * @fileoverview 用真实 GLM 模型验证问答提示词输出可被健壮提取解析，未配置模型时跳过。
 */

import { describe, expect, it } from 'vitest';

import { buildQaMessages } from './ai-qa.service';
import { extractJsonObject } from './json-extraction';
import { OpenAiCompatProvider } from './openai-compat-provider';

const llmBaseUrl = process.env.LLM_BASE_URL;
const llmApiKey = process.env.LLM_API_KEY;
const llmModel = process.env.LLM_MODEL;
const llmReady = Boolean(llmBaseUrl && llmApiKey && llmModel);

/** 用于按需构造真实模型 Provider。 */
function createProvider(): OpenAiCompatProvider {
  return new OpenAiCompatProvider({
    apiKey: llmApiKey!,
    baseUrl: llmBaseUrl!,
    model: llmModel!,
  });
}

const candidateText = [
  '[1] 文档 部署手册(doc-1) 块 b-1：使用 Docker Compose 启动 PostgreSQL 与 Redis。',
  '[2] 文档 测试指南(doc-2) 块 b-2：集成测试连接真实数据库并使用独立 Schema 隔离。',
].join('\n');

describe.skipIf(!llmReady)('ai qa real model extraction', () => {
  it('真实模型对问答提示词输出可提取的 JSON 对象', { timeout: 60_000 }, async () => {
    const raw = await createProvider().complete(
      buildQaMessages('如何启动本地数据库？', candidateText),
    );
    const parsed = extractJsonObject(raw) as { answer?: unknown; citations?: unknown } | undefined;
    expect(parsed, `raw output: ${raw.slice(0, 200)}`).toBeDefined();
    expect(typeof parsed!.answer).toBe('string');
    expect(Array.isArray(parsed!.citations)).toBe(true);
  });
});
