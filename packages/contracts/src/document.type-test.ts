/** @fileoverview 在编译期验证文档传输投影。 */

import type {
  CreateDocumentRequest,
  DocumentDetail,
  DocumentErrorCode,
  DocumentListResponse,
  DocumentTreeItem,
  RenameDocumentRequest,
} from './index';

type Assert<T extends true> = T;
type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? true
    : false;

type CreateKeys = Assert<Equal<keyof CreateDocumentRequest, 'parentId' | 'title'>>;
type RenameKeys = Assert<Equal<keyof RenameDocumentRequest, 'title' | 'version'>>;
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
type ErrorCodes = Assert<
  Equal<
    DocumentErrorCode,
    | 'BAD_REQUEST'
    | 'INTERNAL_ERROR'
    | 'NOT_FOUND'
    | 'UNSUPPORTED_MEDIA_TYPE'
    | 'VALIDATION_FAILED'
    | 'VERSION_CONFLICT'
  >
>;

export type DocumentContractAssertions = [
  CreateKeys,
  RenameKeys,
  TreeItemKeys,
  DetailKeys,
  PageShape,
  ErrorCodes,
];
