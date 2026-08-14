/** @fileoverview 校验知识库元数据的乐观更新请求。 */

import type { UpdateKnowledgeBaseRequest } from '@everlearn/contracts' with {
  'resolution-mode': 'import',
};
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsString,
  Length,
  MaxLength,
  Min,
  registerDecorator,
  ValidateIf,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

/** 用于裁剪字符串且保留非字符串供显式类型校验。 */
function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/** 用于对包括 null 在内的已提供可选字段执行校验。 */
function isSupplied(_object: object, value: unknown): boolean {
  return value !== undefined;
}

/** 用于判断更新是否包含至少一个用户可编辑字段。 */
function hasEditableField(_value: unknown, args: ValidationArguments): boolean {
  const input = args.object as Partial<UpdateKnowledgeBaseRequest>;
  return input.name !== undefined || input.description !== undefined;
}

/** 用于注册禁止仅提交版本的跨字段规则。 */
function HasEditableField(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyName): void => {
    registerDecorator({
      name: 'hasEditableKnowledgeBaseField',
      ...(options === undefined ? {} : { options }),
      propertyName: propertyName.toString(),
      target: target.constructor,
      validator: { validate: hasEditableField },
    });
  };
}

/** 用于限定可编辑字段和正整数观察版本。 */
export class UpdateKnowledgeBaseDto implements UpdateKnowledgeBaseRequest {
  @Transform(trimString)
  @ValidateIf(isSupplied)
  @IsString()
  @MaxLength(2000)
  description?: string;

  @Transform(trimString)
  @ValidateIf(isSupplied)
  @IsString()
  @Length(1, 200)
  name?: string;

  @HasEditableField({ message: 'name or description must be supplied' })
  @IsInt()
  @Min(1)
  version!: number;
}
