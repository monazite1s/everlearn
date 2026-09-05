/**
 * @fileoverview 校验教程最小创建输入：仅主题必填，其余字段可留待创作对话细化。
 */

import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

/** 用于裁剪单个字符串输入。 */
function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/** 用于逐项裁剪字符串数组且过滤空项。 */
function trimStringList({ value }: { value: unknown }): unknown {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => item.trim())
    : value;
}

/** 教程最小创建的请求边界：仅主题必填。 */
export class CreateTutorialDto {
  /** 学习主题。 */
  @Transform(trimString)
  @IsString()
  @Length(1, 200)
  topic!: string;

  /** 目标受众描述，缺省由服务层补默认。 */
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @Length(1, 200)
  audience?: string;

  /** 学习者水平 1..100，缺省由服务层补默认。 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  level?: number;

  /** 学习目标补充说明，可为空。 */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : ''))
  @IsString()
  @Length(0, 2000)
  goals?: string;

  /** 研究深度，缺省按标准。 */
  @IsOptional()
  @IsIn(['overview', 'standard', 'deep'])
  depth?: 'deep' | 'overview' | 'standard';

  /** 希望覆盖的主题词。 */
  @IsOptional()
  @Transform(trimStringList)
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @Length(1, 200, { each: true })
  includeTopics?: string[];

  /** 希望排除的主题词。 */
  @IsOptional()
  @Transform(trimStringList)
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @Length(1, 200, { each: true })
  excludeTopics?: string[];

  /** 参与研究的知识库范围，至多 5 个。 */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsUUID(undefined, { each: true })
  knowledgeBaseIds?: string[];
}
