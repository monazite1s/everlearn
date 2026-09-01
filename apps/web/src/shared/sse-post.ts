/** @fileoverview 以原生 fetch 与 ReadableStream 解析 SSE 流式 POST 响应的薄客户端。 */

/** SSE 流式 POST 的执行参数。 */
export interface SsePostOptions<E> {
  readonly body: unknown;
  /** 用于消费单个解析后的数据帧，同步返回。 */
  readonly onEvent: (event: E) => void;
  readonly signal: AbortSignal;
  readonly url: string;
}

/** 一次 SSE 读取的结束原因。 */
export type SsePostOutcome = 'aborted' | 'completed' | 'failed';

/** 用于判断异常是否为调用方主动中止。 */
function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/** 用于把已到的帧文本分发给回调并返回残留半帧。 */
function flushFrames<E>(buffer: string, onEvent: (event: E) => void): string {
  const blocks = buffer.split('\n\n');
  const rest = blocks.pop() ?? '';
  for (const block of blocks) {
    const line = block.split('\n').find((item) => item.startsWith('data:'));
    if (!line) continue;
    try {
      onEvent(JSON.parse(line.slice('data:'.length).trim()) as E);
    } catch {
      // 单帧损坏时跳过，不影响后续帧。
    }
  }
  return rest;
}

/** 用于执行 SSE POST 并逐帧回调，返回结束原因。 */
export async function ssePost<E>(options: SsePostOptions<E>): Promise<SsePostOutcome> {
  try {
    const response = await fetch(options.url, {
      body: JSON.stringify(options.body),
      cache: 'no-store',
      headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json' },
      method: 'POST',
      signal: options.signal,
    });
    if (!response.ok || !response.body) return 'failed';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer = flushFrames(buffer + decoder.decode(value, { stream: true }), options.onEvent);
    }
    flushFrames(buffer + '\n\n', options.onEvent);
    return 'completed';
  } catch (error) {
    return isAbortError(error) ? 'aborted' : 'failed';
  }
}
