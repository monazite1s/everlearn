/** @fileoverview 将 Inbox 记录资源的 HTTP 输入映射到应用服务。 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import type { InboxItemListResponse, InboxItemSummary } from '@everlearn/contracts' with {
  'resolution-mode': 'import',
};

import { UuidParamDto } from '../http-boundary/uuid-param.dto';
import { CreateInboxItemDto } from './create-inbox-item.dto';
import { InboxItemsService } from './inbox-items.service';
import { ListInboxItemsQueryDto } from './list-inbox-items-query.dto';

/** 用于路由 Inbox 记录的创建、待处理列表与删除请求。 */
@Controller('inbox-items')
export class InboxItemsController {
  /** 用于注入限定所有者的 Inbox 记录应用服务。 */
  constructor(private readonly inboxItemsService: InboxItemsService) {}

  /** 用于为服务端解析的操作者记录一条纯文本或 URL。 */
  @Post()
  create(@Body() input: CreateInboxItemDto): Promise<InboxItemSummary> {
    return this.inboxItemsService.create(input);
  }

  /** 用于按已校验不透明游标列出当前所有者的待处理记录。 */
  @Get()
  list(@Query() query: ListInboxItemsQueryDto): Promise<InboxItemListResponse> {
    return this.inboxItemsService.list(query);
  }

  /** 用于软删除待处理记录且不返回持久化状态。 */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param() params: UuidParamDto): Promise<void> {
    return this.inboxItemsService.remove(params.id);
  }
}
