/** @fileoverview 在编译期验证文档传输投影。 */

import type {
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
} from './index';

type Assert<T extends true> = T;
type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? true
    : false;

type CreateKeys = Assert<Equal<keyof CreateDocumentRequest, 'parentId' | 'title'>>;
type RenameKeys = Assert<Equal<keyof RenameDocumentRequest, 'title' | 'version'>>;
type MoveKeys = Assert<
  Equal<keyof MoveDocumentRequest, 'afterId' | 'beforeId' | 'targetParentId' | 'version'>
>;
type DeleteKeys = Assert<Equal<keyof DeleteDocumentRequest, 'version'>>;
type RestoreKeys = Assert<Equal<keyof RestoreDocumentRequest, 'version'>>;
type TreeItemKeys = Assert<
  Equal<keyof DocumentTreeItem, 'childCount' | 'id' | 'title' | 'updatedAt' | 'version'>
>;
type DetailKeys = Assert<
  Equal<
    keyof DocumentDetail,
    'childCount' | 'id' | 'knowledgeBaseId' | 'parentId' | 'title' | 'updatedAt' | 'version'
  >
>;
type PageShape = Assert<
  Equal<
    DocumentListResponse,
    {
      readonly items: readonly DocumentTreeItem[];
      readonly nextCursor: string | null;
    }
  >
>;
type TrashItemShape = Assert<
  Equal<
    TrashItem,
    {
      readonly deletedAt: string;
      readonly id: string;
      readonly knowledgeBaseId: string;
      readonly knowledgeBaseName: string;
      readonly objectType: TrashObjectType;
      readonly purgeScheduledAt: string;
      readonly title: string;
      readonly version: number;
    }
  >
>;
type TrashPageShape = Assert<
  Equal<
    TrashListResponse,
    { readonly items: readonly TrashItem[]; readonly nextCursor: string | null }
  >
>;
type ErrorCodes = Assert<
  Equal<
    DocumentErrorCode,
    | 'BAD_REQUEST'
    | 'CONFLICT'
    | 'IDEMPOTENCY_CONFLICT'
    | 'INTERNAL_ERROR'
    | 'KNOWLEDGE_BASE_DELETED'
    | 'NOT_FOUND'
    | 'UNSUPPORTED_MEDIA_TYPE'
    | 'VALIDATION_FAILED'
    | 'VERSION_CONFLICT'
  >
>;
type TrashErrorCodes = Assert<
  Equal<TrashErrorCode, 'BAD_REQUEST' | 'INTERNAL_ERROR' | 'VALIDATION_FAILED'>
>;

export type DocumentContractAssertions = [
  CreateKeys,
  RenameKeys,
  MoveKeys,
  DeleteKeys,
  RestoreKeys,
  TreeItemKeys,
  DetailKeys,
  PageShape,
  TrashItemShape,
  TrashPageShape,
  ErrorCodes,
  TrashErrorCodes,
];
