/** @fileoverview 提供限定所有者的知识库读取和生命周期写入。 */

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { KnowledgeBaseListResponse, KnowledgeBaseSummary } from '@everlearn/contracts' with {
  'resolution-mode': 'import',
};

import { UuidParamDto } from '../uuid-param.dto';
import { CreateKnowledgeBaseDto } from './create-knowledge-base.dto';
import { KnowledgeBaseLifecycleService } from './knowledge-base-lifecycle.service';
import { KnowledgeBaseVersionDto } from './knowledge-base-version.dto';
import { ListKnowledgeBasesQueryDto } from './list-knowledge-bases-query.dto';
import { KnowledgeBasesService } from './knowledge-bases.service';
import { UpdateKnowledgeBaseDto } from './update-knowledge-base.dto';

const IDEMPOTENCY_KEY_PATTERN = /^[\x21-\x7E]{1,200}$/u;

/** 用于接收有长度限制的可见 ASCII 幂等键且不记录或改写。 */
function requireIdempotencyKey(value: string | undefined): string {
  if (value === undefined || !IDEMPOTENCY_KEY_PATTERN.test(value)) {
    throw new BadRequestException();
  }
  return value;
}

/** 用于将已校验 HTTP 输入映射到知识库应用服务。 */
@Controller('knowledge-bases')
export class KnowledgeBasesController {
  /** 用于注入限定所有者的服务且不接受所有权或系统字段。 */
  constructor(
    private readonly knowledgeBasesService: KnowledgeBasesService,
    private readonly lifecycleService: KnowledgeBaseLifecycleService,
  ) {}

  /** 用于为服务端解析的操作者创建普通知识库。 */
  @Post()
  create(@Body() input: CreateKnowledgeBaseDto): Promise<KnowledgeBaseSummary> {
    return this.knowledgeBasesService.create(input);
  }

  /** 用于按已校验不透明游标列出有效知识库。 */
  @Get()
  list(@Query() query: ListKnowledgeBasesQueryDto): Promise<KnowledgeBaseListResponse> {
    return this.knowledgeBasesService.list(query);
  }

  /** 用于读取有效知识库且不暴露所有权失败。 */
  @Get(':id')
  read(@Param() params: UuidParamDto): Promise<KnowledgeBaseSummary> {
    return this.knowledgeBasesService.read(params.id);
  }

  /** 用于在提交版本有效时更新知识库元数据。 */
  @Patch(':id')
  update(
    @Param() params: UuidParamDto,
    @Body() input: UpdateKnowledgeBaseDto,
  ): Promise<KnowledgeBaseSummary> {
    return this.lifecycleService.update(params.id, input);
  }

  /** 用于将知识库移入回收站且不返回持久化状态。 */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param() params: UuidParamDto, @Body() input: KnowledgeBaseVersionDto): Promise<void> {
    return this.lifecycleService.remove(params.id, input);
  }

  /** 用于恢复已删除知识库并按相同幂等键重放首次结果。 */
  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  restore(
    @Param() params: UuidParamDto,
    @Body() input: KnowledgeBaseVersionDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ): Promise<KnowledgeBaseSummary> {
    return this.lifecycleService.restore(params.id, input, requireIdempotencyKey(idempotencyKey));
  }
}
