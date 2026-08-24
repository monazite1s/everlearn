/** @fileoverview 定义 Search 投影消费与补偿扫描共享的内部模型。 */

import type { JsonValue } from '../database/database.types';

/** Search 消费者领取后用于判定版本与生命周期的事件行。 */
export interface ClaimedSearchEvent {
  readonly aggregateId: string;
  readonly aggregateVersion: number;
  readonly eventType: string;
  readonly id: string;
  readonly ownerId: string;
  readonly payload: JsonValue;
  readonly schemaVersion: number;
}

/** 补偿扫描定位到的当前文档。 */
export interface SearchScanCandidate {
  readonly documentId: string;
  readonly ownerId: string;
}

/** 用于标记内容或事件无法由当前消费者安全解释。 */
export class SearchProjectionPermanentError extends Error {
  /** 用于保留可持久化的安全错误码而不泄露原始正文。 */
  constructor(readonly code: string) {
    super(code);
  }
}
