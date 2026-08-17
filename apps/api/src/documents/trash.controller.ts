/** @fileoverview 将回收站聚合列表的 HTTP 输入映射到应用服务。 */

import { Controller, Get, Query } from '@nestjs/common';
import type { TrashListResponse } from '@everlearn/contracts' with {
  'resolution-mode': 'import',
};

import { ListTrashQueryDto } from './list-trash-query.dto';
import { TrashListService } from './trash-list.service';

/** 用于路由所有者范围内已删知识库与文档的聚合读取。 */
@Controller('trash')
export class TrashController {
  /** 用于注入限定所有者的回收站列表服务。 */
  constructor(private readonly trashListService: TrashListService) {}

  /** 用于按删除时间倒序返回回收站条目分页。 */
  @Get()
  list(@Query() query: ListTrashQueryDto): Promise<TrashListResponse> {
    return this.trashListService.list(query);
  }
}
