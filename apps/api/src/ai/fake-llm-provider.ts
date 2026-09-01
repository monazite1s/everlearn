/**
 * @fileoverview 提供测试与本地演示用的确定性伪 LLM Provider。
 */

import type { LlmMessage, LlmProvider } from './llm-provider';

/** 用于测试与本地演示的确定性伪 Provider，绝不访问网络。 */
export class FakeLlmProvider implements LlmProvider {
  /** 用于保存固定前缀并复用跨测试的可预测输出。 */
  constructor(private readonly marker = 'FAKE-LLM') {}

  /** 用于返回由最后一条用户消息长度决定的确定性文本。 */
  complete(messages: readonly LlmMessage[]): Promise<string> {
    const last = messages.at(-1);
    return Promise.resolve(`${this.marker}:${last?.content.length ?? 0}`);
  }

  /** 用于按固定分段逐段产出确定性增量。 */
  // eslint-disable-next-line @typescript-eslint/require-await -- 生成器形态是接口契约，本实现无需真实异步。
  async *stream(messages: readonly LlmMessage[]): AsyncGenerator<string> {
    for (const chunk of `${this.marker}:${messages.at(-1)?.content.length ?? 0}`.match(
      /.{1,4}/gs,
    ) ?? [])
      yield chunk;
  }
}
