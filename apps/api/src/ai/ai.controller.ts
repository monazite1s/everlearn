/**
 * @fileoverview 暴露 AI 问答与草稿生成的 SSE 流式端点。
 */

import { Controller, Post, Body, Res } from '@nestjs/common';
import type { Response } from 'express';

import { AiDraftService } from './ai-draft.service';
import { AiQaService } from './ai-qa.service';
import { AiDraftRequestDto } from './ai-draft.dto';
import { AiQaRequestDto } from './ai-query.dto';

/** SSE 事件信封，按序号携带增量文本。 */
interface DraftSseEvent {
  readonly delta: string;
  readonly done: boolean;
  readonly error?: string;
  readonly seq: number;
}

/** 用于写入单个 SSE 数据帧并返回追加后的序号。 */
function writeSseEvent(res: Response, event: DraftSseEvent): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

/** 用于把 AI 服务能力挂载到公开契约端点。 */
@Controller('ai')
export class AiController {
  /** 用于注入问答与草稿生成服务。 */
  constructor(
    private readonly aiQaService: AiQaService,
    private readonly aiDraftService: AiDraftService,
  ) {}

  /** 用于同步返回带引用校验的问答结果。 */
  @Post('qa')
  qa(@Body() body: AiQaRequestDto) {
    return this.aiQaService.answer(body);
  }

  /** 用于以 SSE 流式转发建议草稿增量并在结束时发送完成帧。 */
  @Post('generate-draft')
  async generateDraft(@Body() body: AiDraftRequestDto, @Res() res: Response): Promise<void> {
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    let seq = 0;
    try {
      for await (const delta of this.aiDraftService.streamDraft(body)) {
        writeSseEvent(res, { delta, done: false, seq });
        seq += 1;
      }
      writeSseEvent(res, { delta: '', done: true, seq });
    } catch (error) {
      const code =
        typeof (error as { problem?: { code?: unknown } }).problem?.code === 'string'
          ? (error as { problem: { code: string } }).problem.code
          : 'LLM_NETWORK_ERROR';
      writeSseEvent(res, { delta: '', done: true, error: code, seq });
    } finally {
      res.end();
    }
  }
}
