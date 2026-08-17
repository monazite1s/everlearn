/** @fileoverview 导出 Everlearn 应用共享的稳定传输契约。 */

export {
  DOCUMENT_APPROVED_HEADING_LEVELS,
  DOCUMENT_APPROVED_MARK_TYPES,
  DOCUMENT_APPROVED_NODE_TYPES,
  DOCUMENT_BLOCK_ID_PATTERN,
  DOCUMENT_BLOCK_NODE_TYPES,
  DOCUMENT_JSON_MAX_DEPTH,
  DOCUMENT_REVISION_SOURCES,
  DOCUMENT_SCHEMA_VERSION,
  DOCUMENT_TITLE_MAX_LENGTH,
  TRASH_RETENTION_DAYS,
} from './document.js';
export { INBOX_ITEM_CONTENT_MAX_LENGTH } from './inbox-item.js';
export { KNOWLEDGE_BASE_NAME_MAX_LENGTH } from './knowledge-base.js';

export type {
  CreateDocumentRequest,
  CreateDocumentRevisionRequest,
  DeleteDocumentRequest,
  DocumentContentDetail,
  DocumentDetail,
  DocumentErrorCode,
  DocumentListResponse,
  DocumentRevisionDetail,
  DocumentRevisionListItem,
  DocumentRevisionListResponse,
  DocumentRevisionSource,
  DocumentSavedEventPayload,
  DocumentTreeItem,
  MoveDocumentRequest,
  RenameDocumentRequest,
  RestoreDocumentRequest,
  RestoreDocumentRevisionRequest,
  SaveDocumentContentRequest,
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
