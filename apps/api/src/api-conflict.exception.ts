/** @fileoverview 承载可信公开冲突类型且不接受客户端消息。 */

import { ConflictException } from '@nestjs/common';

export type ApiConflictCode = 'IDEMPOTENCY_CONFLICT' | 'VERSION_CONFLICT';

/** 用于标记由服务端选择的公开冲突码。 */
export class ApiConflictException extends ConflictException {
  /** 用于只保存白名单错误码，展示文案由公开过滤器统一生成。 */
  constructor(readonly conflictCode: ApiConflictCode) {
    super();
  }
}
