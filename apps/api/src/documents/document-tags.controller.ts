/** @fileoverview 将标签与反向链接资源的 HTTP 输入映射到应用服务。 */

import { Controller, Get, Put, Body, Param } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import { UuidParamDto } from '../http-boundary/uuid-param.dto';
import { LocalIdentityContext } from '../identity/local-identity.context';

import { readBacklinks, type BacklinkRow } from './document-backlinks.query';
import { DocumentTagsService, type TagItem } from './document-tags.service';
import { SetDocumentTagsDto } from './set-document-tags.dto';

/** 标签列表的公开响应投影。 */
export interface TagListResponse {
  readonly items: readonly TagItem[];
}

/** 反向链接来源列表的公开响应投影。 */
export interface BacklinkListResponse {
  readonly items: readonly BacklinkRow[];
}

/** 用于路由所有者标签与文档标签、反向链接的读取和整体设置请求。 */
@Controller()
export class DocumentTagsController {
  /** 用于注入标签服务、共享数据库客户端与可信本地身份。 */
  constructor(
    private readonly documentTagsService: DocumentTagsService,
    private readonly databaseService: DatabaseService,
    private readonly identityContext: LocalIdentityContext,
  ) {}

  /** 用于列出当前所有者的全部标签。 */
  @Get('tags')
  listOwnerTags(): Promise<TagListResponse> {
    return this.documentTagsService.listOwnerTags().then((items) => ({ items }));
  }

  /** 用于读取单个有效文档的标签。 */
  @Get('documents/:id/tags')
  listDocumentTags(@Param() params: UuidParamDto): Promise<TagListResponse> {
    return this.documentTagsService.listDocumentTags(params.id).then((items) => ({ items }));
  }

  /** 用于整体设置文档标签并返回设置后的标签投影。 */
  @Put('documents/:id/tags')
  setDocumentTags(
    @Param() params: UuidParamDto,
    @Body() input: SetDocumentTagsDto,
  ): Promise<TagListResponse> {
    return this.documentTagsService.setDocumentTags(params.id, input.names).then((items) => ({
      items,
    }));
  }

  /** 用于读取指向当前文档的反向链接来源列表。 */
  @Get('documents/:id/backlinks')
  async listBacklinks(@Param() params: UuidParamDto): Promise<BacklinkListResponse> {
    const { ownerId } = this.identityContext.getActor();
    const items = await readBacklinks(this.databaseService.client, ownerId, params.id);
    return { items };
  }
}
