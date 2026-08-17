/** @fileoverview 组装附件上传、下载、引用计数与孤儿清理的应用切片。 */

import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { requireJsonContentType } from '../http-boundary/require-json-content-type';
import { LocalIdentityContext } from '../identity/local-identity.context';
import { AttachmentOrphanPurgeController } from './attachment-orphan-purge.controller';
import { AttachmentOrphanPurgeService } from './attachment-orphan-purge.service';
import { AttachmentReferencesService } from './attachment-references.service';
import { AttachmentStorageProvider } from './attachment-storage.provider';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';

/** 用于持有附件切片的控制器、服务与存储依赖。 */
@Module({
  controllers: [AttachmentsController, AttachmentOrphanPurgeController],
  exports: [AttachmentReferencesService],
  imports: [DatabaseModule],
  providers: [
    AttachmentOrphanPurgeService,
    AttachmentReferencesService,
    AttachmentStorageProvider,
    AttachmentsService,
    LocalIdentityContext,
  ],
})
export class AttachmentsModule implements NestModule {
  /** 用于向附件写入路由应用仅 JSON 规则。 */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(requireJsonContentType).forRoutes(AttachmentsController);
  }
}
