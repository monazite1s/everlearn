/** @fileoverview Exposes owner-scoped knowledge-base creation and summary reads. */

import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import type { KnowledgeBaseListResponse, KnowledgeBaseSummary } from '@everlearn/contracts' with {
  'resolution-mode': 'import',
};

import { UuidParamDto } from '../uuid-param.dto';
import { CreateKnowledgeBaseDto } from './create-knowledge-base.dto';
import { ListKnowledgeBasesQueryDto } from './list-knowledge-bases-query.dto';
import { KnowledgeBasesService } from './knowledge-bases.service';

/** Maps validated HTTP input to the knowledge-base application service. */
@Controller('knowledge-bases')
export class KnowledgeBasesController {
  /** Uses the domain service without accepting ownership or system fields. */
  constructor(private readonly knowledgeBasesService: KnowledgeBasesService) {}

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
}
