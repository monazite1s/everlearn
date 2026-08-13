/** @fileoverview Exposes owner-scoped knowledge-base reads and lifecycle writes. */

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

/** Accepts a bounded visible-ASCII idempotency key without logging or normalizing it. */
function requireIdempotencyKey(value: string | undefined): string {
  if (value === undefined || !IDEMPOTENCY_KEY_PATTERN.test(value)) {
    throw new BadRequestException();
  }
  return value;
}

/** Maps validated HTTP input to the knowledge-base application service. */
@Controller('knowledge-bases')
export class KnowledgeBasesController {
  /** Uses owner-scoped services without accepting ownership or system fields. */
  constructor(
    private readonly knowledgeBasesService: KnowledgeBasesService,
    private readonly lifecycleService: KnowledgeBaseLifecycleService,
  ) {}

  /** Creates one normal knowledge base for the server-resolved actor. */
  @Post()
  create(@Body() input: CreateKnowledgeBaseDto): Promise<KnowledgeBaseSummary> {
    return this.knowledgeBasesService.create(input);
  }

  /** Lists active knowledge bases using the validated opaque cursor. */
  @Get()
  list(@Query() query: ListKnowledgeBasesQueryDto): Promise<KnowledgeBaseListResponse> {
    return this.knowledgeBasesService.list(query);
  }

  /** Reads one active knowledge base without revealing ownership failures. */
  @Get(':id')
  read(@Param() params: UuidParamDto): Promise<KnowledgeBaseSummary> {
    return this.knowledgeBasesService.read(params.id);
  }

  /** Updates knowledge-base metadata when the submitted version is current. */
  @Patch(':id')
  update(
    @Param() params: UuidParamDto,
    @Body() input: UpdateKnowledgeBaseDto,
  ): Promise<KnowledgeBaseSummary> {
    return this.lifecycleService.update(params.id, input);
  }

  /** Moves one knowledge base to the recycle bin without returning persistence state. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param() params: UuidParamDto, @Body() input: KnowledgeBaseVersionDto): Promise<void> {
    return this.lifecycleService.remove(params.id, input);
  }

  /** Restores one deleted knowledge base and replays the first result for the same key. */
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
