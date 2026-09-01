/** @fileoverview 组装限定所有者的文档读取、创建、重命名与移动 HTTP 切片。 */

import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';

import { AttachmentsModule } from '../attachments/attachments.module';
import { requireJsonContentType } from '../http-boundary/require-json-content-type';
import { DatabaseModule } from '../database/database.module';
import { LocalIdentityContext } from '../identity/local-identity.context';
import { DocumentContentService } from './document-content.service';
import { DocumentExportService } from './document-export.service';
import { DocumentMoveService } from './document-move.service';
import { DocumentRevisionsController } from './document-revisions.controller';
import { DocumentRevisionService } from './document-revision.service';
import { DocumentTrashService } from './document-trash.service';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { KnowledgeBaseDocumentsController } from './knowledge-base-documents.controller';
import { TrashController } from './trash.controller';
import { TrashListService } from './trash-list.service';
import { TrashPurgeController } from './trash-purge.controller';
import { TrashPurgeService } from './trash-purge.service';

/** 用于持有本切片所需的最小控制器、服务、身份和数据库依赖。 */
@Module({
  controllers: [
    DocumentsController,
    DocumentRevisionsController,
    KnowledgeBaseDocumentsController,
    TrashController,
    TrashPurgeController,
  ],
  exports: [DocumentsService, TrashPurgeService],
  imports: [AttachmentsModule, DatabaseModule],
  providers: [
    DocumentsService,
    DocumentExportService,
    DocumentContentService,
    DocumentMoveService,
    DocumentRevisionService,
    DocumentTrashService,
    TrashListService,
    TrashPurgeService,
    LocalIdentityContext,
  ],
})
export class DocumentsModule implements NestModule {
  /** 用于向所有文档与回收站写入路由应用仅 JSON 规则。 */
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(requireJsonContentType)
      .forRoutes(
        DocumentsController,
        DocumentRevisionsController,
        KnowledgeBaseDocumentsController,
        TrashController,
      );
  }
}
