/** @fileoverview 导出 Everlearn 应用共享的稳定传输契约。 */

export { DOCUMENT_TITLE_MAX_LENGTH, TRASH_RETENTION_DAYS } from './document.js';
export { INBOX_ITEM_CONTENT_MAX_LENGTH } from './inbox-item.js';
export { KNOWLEDGE_BASE_NAME_MAX_LENGTH } from './knowledge-base.js';

export type {
  CreateDocumentRequest,
  DeleteDocumentRequest,
  DocumentDetail,
  DocumentErrorCode,
  DocumentListResponse,
  DocumentTreeItem,
  MoveDocumentRequest,
  RenameDocumentRequest,
  RestoreDocumentRequest,
  TrashErrorCode,
  TrashItem,
  TrashListResponse,
  TrashObjectType,
} from './document.js';

export type {
  ConvertInboxItemRequest,
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
