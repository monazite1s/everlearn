/**
 * @fileoverview 按运行时环境装配当前进程唯一 LLM Provider。
 */

import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { llmError, type LlmProvider } from './llm-provider';
import { OpenAiCompatProvider } from './openai-compat-provider';

/** 用于按运行时环境装配当前进程唯一 LLM Provider。 */
@Injectable()
export class LlmGateway {
  private provider: LlmProvider | undefined;

  /** 用于注入已校验的进程环境。 */
  constructor(private readonly configService: ConfigService) {}

  /** 用于返回已装配的 Provider 并在未配置时抛稳定错误。 */
  requireProvider(): LlmProvider {
    const existing = this.provider;
    if (existing !== undefined) return existing;
    const baseUrl = this.configService.get<string>('LLM_BASE_URL');
    const apiKey = this.configService.get<string>('LLM_API_KEY');
    const model = this.configService.get<string>('LLM_MODEL');
    if (baseUrl === undefined || apiKey === undefined || model === undefined)
      throw llmError('LLM_NOT_CONFIGURED', '模型服务未配置。', HttpStatus.SERVICE_UNAVAILABLE);
    this.provider = new OpenAiCompatProvider({ apiKey, baseUrl, model });
    return this.provider;
  }
}
