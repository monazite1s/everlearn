/**
 * @fileoverview 定义教程对话会话与消息的公开数据形态。
 */

import type { ComposeProposal } from './compose/compose-agent';
import type { TutorialDetail } from './tutorial.dto';

/** 对话消息的公开视图。 */
export interface TutorialMessageView {
  readonly content: string;
  readonly createdAt: string;
  readonly id: string;
  readonly proposal: ComposeProposal | null;
  readonly proposalStatus: string | null;
  readonly role: 'agent' | 'system' | 'user';
}

/** 对话会话的公开视图。 */
export interface TutorialConversationView {
  readonly createdAt: string;
  readonly id: string;
  readonly messages: readonly TutorialMessageView[];
  readonly status: string;
  readonly title: string;
}

/** 提案接受后的统一响应。 */
export interface TutorialProposalAcceptView {
  readonly proposalStatus: 'accepted';
  readonly tutorial: TutorialDetail;
}

/** 章节差异接受后的响应。 */
export interface TutorialChapterDiffView {
  readonly chapterId: string;
  readonly documentId: string;
  readonly revisionNumber: number;
}

/** compose 确认卡投影：闸门、提案与差异共用一种呈现。 */
export interface ComposeCardView {
  readonly body: string;
  readonly gate: 'outline' | 'scope' | null;
  readonly proposalId: string | null;
  readonly state: 'accepted' | 'pending' | 'rejected';
  readonly title: string;
  readonly variant: 'diff' | 'gate' | 'proposal';
}

/** compose 对话消息投影。 */
export interface ComposeMessageView {
  readonly card: ComposeCardView | null;
  readonly createdAt: string;
  readonly id: string;
  readonly role: 'agent' | 'user';
  readonly text: string;
}

/** compose 会话快照投影，字段以页面规格为准。 */
export interface ComposeSnapshotView {
  readonly chapters: TutorialDetail['chapters'];
  readonly hasEarlierMessages: boolean;
  readonly knowledgeBase: TutorialDetail['knowledgeBase'];
  readonly messages: readonly ComposeMessageView[];
  readonly stage: TutorialDetail['stage'];
  readonly status: string;
  readonly tutorialId: string;
  readonly topic: string;
}
