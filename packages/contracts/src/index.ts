/** @fileoverview 导出 Everlearn 应用共享的稳定传输契约。 */

export {
  ATTACHMENT_ALT_MAX_LENGTH,
  ATTACHMENT_FILE_EXTENSIONS,
  ATTACHMENT_FILE_MAX_BYTES,
  ATTACHMENT_FILE_NAME_MAX_LENGTH,
  ATTACHMENT_IMAGE_MAX_BYTES,
  ATTACHMENT_IMAGE_MIME_TYPES,
  ATTACHMENT_PENDING_TTL_HOURS,
} from './attachment.js';
export type {
  AttachmentDetail,
  AttachmentErrorCode,
  AttachmentKind,
  AttachmentStatus,
  ConfirmAttachmentUploadRequest,
  CreateAttachmentUploadRequest,
  CreateAttachmentUploadResponse,
} from './attachment.js';

export {
  DOCUMENT_APPROVED_HEADING_LEVELS,
  DOCUMENT_APPROVED_MARK_TYPES,
  DOCUMENT_APPROVED_NODE_TYPES,
  DOCUMENT_ATTACHMENT_NODE_TYPES,
  DOCUMENT_BLOCK_ID_PATTERN,
  DOCUMENT_BLOCK_NODE_TYPES,
  DOCUMENT_JSON_MAX_DEPTH,
  DOCUMENT_REVISION_SOURCES,
  DOCUMENT_SCHEMA_VERSION,
  DOCUMENT_SEARCH_EVENT_TYPES,
  DOCUMENT_TITLE_MAX_LENGTH,
  TRASH_RETENTION_DAYS,
} from './document.js';
export { INBOX_ITEM_CONTENT_MAX_LENGTH } from './inbox-item.js';
export { KNOWLEDGE_BASE_NAME_MAX_LENGTH } from './knowledge-base.js';
export {
  SEARCH_CURSOR_MAX_LENGTH,
  SEARCH_DEFAULT_LIMIT,
  SEARCH_MAX_LIMIT,
  SEARCH_QUERY_MAX_LENGTH,
} from './search.js';

export type {
  CreateDocumentRequest,
  CreateDocumentRevisionRequest,
  DeleteDocumentRequest,
  DocumentContentDetail,
  DocumentDetail,
  DocumentErrorCode,
  DocumentListResponse,
  DocumentLifecycleEventPayload,
  DocumentRevisionDetail,
  DocumentRevisionListItem,
  DocumentRevisionListResponse,
  DocumentRevisionSource,
  DocumentSavedEventPayload,
  DocumentSearchEventType,
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

export type {
  SearchAncestor,
  SearchBothResult,
  SearchContentResult,
  SearchContentSnippet,
  SearchErrorCode,
  SearchField,
  SearchHighlightSegment,
  SearchIndexStatus,
  SearchMatchedField,
  SearchRequestQuery,
  SearchResponse,
  SearchResultItem,
  SearchScope,
  SearchTitleResult,
} from './search.js';
