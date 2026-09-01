/**
 * @fileoverview 定义业务模块唯一依赖的 LLM 能力接口与稳定错误归类。
 */

import { HttpStatus } from '@nestjs/common';

import { ApiDomainException } from '../http-boundary/api-domain.exception';

/** 单次对话消息的最小公共形态。 */
export interface LlmMessage {
  readonly content: string;
  readonly role: 'assistant' | 'system' | 'user';
}

/** 业务模块唯一依赖的模型能力接口。 */
export interface LlmProvider {
  complete(messages: readonly LlmMessage[]): Promise<string>;
  stream(messages: readonly LlmMessage[]): AsyncIterable<string>;
}

/** 用于返回带稳定错误码与安全文案的领域拒绝。 */
export function llmError(code: string, message: string, status: HttpStatus): ApiDomainException {
  return new ApiDomainException({ code, kind: 'domain', message, status });
}

/** 用于把底层异常归类为配置缺失、超时或网络失败的稳定错误码。 */
export function toLlmException(error: unknown): ApiDomainException {
  if (error instanceof ApiDomainException) return error;
  if (error instanceof Error && error.name === 'TimeoutError')
    return llmError('LLM_TIMEOUT', '模型请求超时，请稍后重试。', HttpStatus.GATEWAY_TIMEOUT);
  return llmError('LLM_NETWORK_ERROR', '无法连接模型服务。', HttpStatus.BAD_GATEWAY);
}
