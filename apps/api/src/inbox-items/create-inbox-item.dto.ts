/** @fileoverview 校验 Inbox 记录创建的纯文本或 URL 二选一载荷。 */

import type { CreateInboxItemRequest } from '@everlearn/contracts' with {
  'resolution-mode': 'import',
};
import { Transform } from 'class-transformer';
import { ValidateBy } from 'class-validator';

/** 与契约常量 INBOX_ITEM_CONTENT_MAX_LENGTH 保持一致的载荷长度上限。 */
const CONTENT_MAX_LENGTH = 10_000;

/** 用于裁剪字符串且保留其他值供类型校验。 */
function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/** 用于校验去除首尾空白后非空且不超上限的纯文本。 */
function isValidText(value: string): boolean {
  return value.length > 0 && value.length <= CONTENT_MAX_LENGTH;
}

/** 用于只接受单个可解析的 http/https 绝对 URL。 */
function isValidUrl(value: string): boolean {
  if (value.length === 0 || value.length > CONTENT_MAX_LENGTH) return false;
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/** 用于按字段键校验对应载荷自身的形状。 */
function isShapedField(key: 'text' | 'url', value: unknown): boolean {
  return typeof value === 'string' && (key === 'text' ? isValidText(value) : isValidUrl(value));
}

/** 用于校验本键是唯一载荷或让位给形状有效的另一键。 */
function isExclusiveInboxField(own: 'text' | 'url', candidate: object): boolean {
  const fields = candidate as { text?: unknown; url?: unknown };
  const other = own === 'text' ? 'url' : 'text';
  if (fields[other] !== undefined) {
    return fields[own] === undefined && isShapedField(other, fields[other]);
  }
  return isShapedField(own, fields[own]);
}

/** 用于生成绑定字段键的互斥载荷校验装饰器。 */
function IsExclusiveInboxField(own: 'text' | 'url'): PropertyDecorator {
  return ValidateBy({
    name: 'isExclusiveInboxField',
    validator: {
      /** 用于拒绝与另一载荷同时出现或同时缺失的输入。 */
      validate: (_value: unknown, args?: { object: object }): boolean =>
        isExclusiveInboxField(own, args?.object ?? {}),
    },
  });
}

/** 用于限定 Inbox 创建只接受互斥的纯文本或 http/https URL 字段。 */
export class CreateInboxItemDto implements CreateInboxItemRequest {
  @Transform(trimString)
  @IsExclusiveInboxField('text')
  text?: string;

  @Transform(trimString)
  @IsExclusiveInboxField('url')
  url?: string;
}
