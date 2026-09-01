/**
 * @fileoverview 定义更新工作流草稿、名称与计划的请求边界。
 */

import { Type } from 'class-transformer';
import { IsObject, IsOptional, IsString, Length, ValidateNested } from 'class-validator';

import { WorkflowScheduleDto } from './workflow-schedule.dto';

/** 更新 workflow 的请求边界，草稿允许未完成结构、发布时再校验。 */
export class UpdateWorkflowDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @IsObject()
  draftDefinition?: Record<string, unknown>;

  @IsOptional()
  @ValidateNested()
  @Type(() => WorkflowScheduleDto)
  schedule?: WorkflowScheduleDto | null;
}
