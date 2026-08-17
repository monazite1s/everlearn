/** @fileoverview 导出 Everlearn 应用共享的稳定传输契约。 */

export { DOCUMENT_TITLE_MAX_LENGTH } from './document.js';
export { INBOX_ITEM_CONTENT_MAX_LENGTH } from './inbox-item.js';
export { KNOWLEDGE_BASE_NAME_MAX_LENGTH } from './knowledge-base.js';

export type {
  CreateDocumentRequest,
  DocumentDetail,
  DocumentErrorCode,
  DocumentListResponse,
  DocumentTreeItem,
  RenameDocumentRequest,
} from './document.js';

export type {
  CreateInboxItemRequest,
  InboxItemErrorCode,
  InboxItemKind,
  InboxItemListResponse,
  InboxItemSummary,
} from './inbox-item.js';

export type {
  CreateKnowledgeBaseRequest,
  KnowledgeBaseErrorCode,
  KnowledgeBaseKind,
  KnowledgeBaseListResponse,
  KnowledgeBaseSummary,
  KnowledgeBaseVersionRequest,
  UpdateKnowledgeBaseRequest,
} from './knowledge-base.js';
