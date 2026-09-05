/**
 * @fileoverview 提供教程 compose 会话快照、消息发送、提案决议与差异接受端点。
 */

import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';

import { UuidParamDto } from '../http-boundary/uuid-param.dto';
import { ChapterAcceptDiffDto } from './chapter-accept-diff.dto';
import { ConversationMessageDto } from './conversation-message.dto';
import { TutorialChapterParamDto, TutorialMessageParamDto } from './tutorial-params.dto';
import type {
  ComposeSnapshotView,
  TutorialChapterDiffView,
  TutorialMessageView,
  TutorialProposalAcceptView,
} from './conversation.dto';
import { TutorialConversationsService } from './tutorial-conversations.service';
import { TutorialProposalsService } from './tutorial-proposals.service';

/** 用于把已校验 HTTP 输入映射到 compose 会话与提案服务。 */
@Controller('tutorials/:id/compose')
export class TutorialConversationsController {
  /** 用于注入 compose 会话与提案副作用服务。 */
  constructor(
    private readonly conversationsService: TutorialConversationsService,
    private readonly proposalsService: TutorialProposalsService,
  ) {}

  /** 用于返回 compose 会话快照（消息、提案、闸门卡与教程状态）。 */
  @Get()
  snapshot(@Param() params: UuidParamDto): Promise<ComposeSnapshotView> {
    return this.conversationsService.composeSnapshot(params.id);
  }

  /** 用于发送用户消息并同步生成 Agent 回复，契约形态返回 202。 */
  @Post('messages')
  @HttpCode(HttpStatus.ACCEPTED)
  sendMessage(
    @Param() params: UuidParamDto,
    @Body() input: ConversationMessageDto,
  ): Promise<TutorialMessageView[]> {
    return this.conversationsService.sendMessage(params.id, input.content);
  }

  /** 用于接受提案并执行对应副作用（幂等，重复决议返回首次结果）。 */
  @Post('proposals/:messageId/accept')
  @HttpCode(HttpStatus.OK)
  acceptProposal(@Param() params: TutorialMessageParamDto): Promise<TutorialProposalAcceptView> {
    return this.proposalsService.accept(params.id, params.messageId);
  }

  /** 用于拒绝提案（无副作用，幂等）。 */
  @Post('proposals/:messageId/reject')
  @HttpCode(HttpStatus.OK)
  rejectProposal(
    @Param() params: TutorialMessageParamDto,
  ): Promise<{ proposalStatus: 'rejected' }> {
    return this.proposalsService.reject(params.id, params.messageId);
  }

  /** 用于在用户确认差异后按确认内容覆盖写入章节。 */
  @Post('chapters/:chapterId/accept-diff')
  @HttpCode(HttpStatus.OK)
  acceptChapterDiff(
    @Param() params: TutorialChapterParamDto,
    @Body() input: ChapterAcceptDiffDto,
  ): Promise<TutorialChapterDiffView> {
    return this.proposalsService.acceptDiff(params.id, params.chapterId, input.content);
  }
}
