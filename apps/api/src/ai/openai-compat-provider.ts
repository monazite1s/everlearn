/**
 * @fileoverview 实现 OpenAI 兼容 Chat Completions 的流式与非流式 Provider。
 */

import { HttpStatus } from '@nestjs/common';

import { llmError, toLlmException, type LlmMessage, type LlmProvider } from './llm-provider';

/** 用于承载已校验的 LLM 端点配置。 */
export interface LlmEndpointConfig {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly model: string;
}

/** 用于构造 OpenAI 兼容端点的请求头与请求体。 */
function buildRequest(
  config: LlmEndpointConfig,
  messages: readonly LlmMessage[],
  stream: boolean,
  signal: AbortSignal,
): {
  readonly body: string;
  readonly headers: Record<string, string>;
  readonly signal: AbortSignal;
  readonly url: string;
} {
  return {
    body: JSON.stringify({ messages, model: config.model, stream }),
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    signal,
    url: `${config.baseUrl.replace(/\/+$/u, '')}/chat/completions`,
  };
}

/** 用于解析上游非流式响应并拒绝空补全。 */
async function parseCompletion(response: Response): Promise<string> {
  if (!response.ok)
    throw llmError('LLM_UPSTREAM_ERROR', '模型服务返回错误。', HttpStatus.BAD_GATEWAY);
  const payload = (await response.json()) as {
    choices?: readonly { message?: { content?: string } }[];
  };
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.length === 0)
    throw llmError('LLM_UPSTREAM_ERROR', '模型服务返回了空补全。', HttpStatus.BAD_GATEWAY);
  return content;
}

/** 用于从单条 SSE 数据帧抽取非空增量文本。 */
function deltaFromLine(line: string): string {
  const data = line.startsWith('data:') ? line.slice(5).trim() : '';
  if (data === '' || data === '[DONE]') return '';
  const delta = (
    JSON.parse(data) as {
      choices?: readonly { delta?: { content?: string } }[];
    }
  ).choices?.[0]?.delta?.content;
  return typeof delta === 'string' ? delta : '';
}

/** 用于桥接 Node ReadableStream 的类型声明与运行时已支持的异步迭代。 */
function toAsyncIterable(stream: ReadableStream<Uint8Array>): AsyncIterable<Uint8Array> {
  return stream;
}

/** 用于逐行解析 SSE 数据帧并抽取增量文本。 */
async function* parseSseDeltas(body: AsyncIterable<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const delta = deltaFromLine(line);
      if (delta !== '') yield delta;
    }
  }
}

/** ponytail: 未实现用量统计、重试与多模型路由；AI-04 引入混合检索时再按需扩展。 */
export class OpenAiCompatProvider implements LlmProvider {
  /** 用于保存只读端点配置并固定超时上限。 */
  constructor(
    private readonly config: LlmEndpointConfig,
    private readonly timeoutMs = 60_000,
  ) {}

  /** 用于执行非流式补全并归类上游失败。 */
  async complete(messages: readonly LlmMessage[]): Promise<string> {
    try {
      const signal = AbortSignal.timeout(this.timeoutMs);
      const request = buildRequest(this.config, messages, false, signal);
      return await parseCompletion(
        await fetch(request.url, {
          body: request.body,
          headers: request.headers,
          method: 'POST',
          signal,
        }),
      );
    } catch (error) {
      throw toLlmException(error);
    }
  }

  /** 用于流式补全并逐段产出增量文本。 */
  async *stream(messages: readonly LlmMessage[]): AsyncGenerator<string> {
    try {
      const signal = AbortSignal.timeout(this.timeoutMs);
      const request = buildRequest(this.config, messages, true, signal);
      const response = await fetch(request.url, {
        body: request.body,
        headers: request.headers,
        method: 'POST',
        signal,
      });
      if (!response.ok || response.body === null)
        throw llmError('LLM_UPSTREAM_ERROR', '模型服务返回错误。', HttpStatus.BAD_GATEWAY);
      yield* parseSseDeltas(toAsyncIterable(response.body));
    } catch (error) {
      throw toLlmException(error);
    }
  }
}
