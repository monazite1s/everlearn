/**
 * @fileoverview 校验并规范化教程创建与研究范围的 HTTP 输入。
 */

import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

/** 用于逐项裁剪字符串数组且过滤空项。 */
function trimStringList({ value }: { value: unknown }): unknown {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => item.trim())
    : value;
}

/** 用于裁剪单个字符串输入。 */
function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/** 用于统一校验主题、受众等必填短文本。 */
function RequiredText(maxLength: number) {
  return function (target: object, propertyKey: string) {
    Transform(trimString)(target, propertyKey);
    IsString()(target, propertyKey);
    Length(1, maxLength)(target, propertyKey);
  };
}

/** 教程创建与研究范围共用的范围字段集合。 */
export class TutorialScopeDto {
  /** 学习主题。 */
  @RequiredText(200)
  topic!: string;

  /** 目标受众描述。 */
  @RequiredText(200)
  audience!: string;

  /** 学习者水平 1..100。 */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  level!: number;

  /** 学习目标补充说明，可为空。 */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : ''))
  @IsString()
  @Length(0, 2000)
  goals = '';

  /** 研究深度。 */
  @IsIn(['overview', 'standard', 'deep'])
  depth!: 'deep' | 'overview' | 'standard';

  /** 希望覆盖的主题词。 */
  @Transform(trimStringList)
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @Length(1, 200, { each: true })
  includeTopics: string[] = [];

  /** 希望排除的主题词。 */
  @Transform(trimStringList)
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @Length(1, 200, { each: true })
  excludeTopics: string[] = [];

  /** 参与研究的知识库范围，至多 5 个。 */
  @IsArray()
  @ArrayMaxSize(5)
  @IsUUID(undefined, { each: true })
  knowledgeBaseIds: string[] = [];
}
