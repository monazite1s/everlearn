/** @fileoverview 校验文档移动的目标父级、相邻定位与版本输入。 */

import type { MoveDocumentRequest } from '@everlearn/contracts' with {
  'resolution-mode': 'import',
};
import { IsInt, IsOptional, IsUUID, Min, ValidateBy } from 'class-validator';

/** 用于校验相邻定位字段与另一字段互斥且至多出现一个。 */
function isExclusiveAnchorField(own: 'beforeId' | 'afterId', candidate: object): boolean {
  const fields = candidate as { afterId?: unknown; beforeId?: unknown };
  const other = own === 'beforeId' ? 'afterId' : 'beforeId';
  return fields[other] === undefined;
}

/** 用于生成绑定相邻定位互斥约束的校验装饰器。 */
function IsExclusiveAnchorField(own: 'beforeId' | 'afterId'): PropertyDecorator {
  return ValidateBy({
    name: 'isExclusiveAnchorField',
    validator: {
      /** 用于拒绝与另一相邻定位同时出现的输入。 */
      validate: (_value: unknown, args?: { object: object }): boolean =>
        isExclusiveAnchorField(own, args?.object ?? {}),
    },
  });
}

/** 用于限定移动只接受目标父级、单个相邻定位和正整数版本。 */
export class MoveDocumentDto implements MoveDocumentRequest {
  @IsOptional()
  @IsUUID()
  @IsExclusiveAnchorField('afterId')
  afterId?: string;

  @IsOptional()
  @IsUUID()
  @IsExclusiveAnchorField('beforeId')
  beforeId?: string;

  @IsOptional()
  @IsUUID()
  targetParentId?: string;

  @IsInt()
  @Min(1)
  version!: number;
}
