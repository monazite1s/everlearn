/**
 * @fileoverview 定义订阅来源 value 的按类型校验约束。
 */

import { ValidatorConstraint } from 'class-validator';
import type { ValidationArguments, ValidatorConstraintInterface } from 'class-validator';

/** 用于按来源类型校验 value：rss/site 须 http(s) URL，search 允许自由文本（≤200）。 */
@ValidatorConstraint({ async: false })
export class IsValidSourceValueConstraint implements ValidatorConstraintInterface {
  /** 用于执行按类型区分的 value 形态判定。 */
  validate(value: unknown, args: ValidationArguments): boolean {
    if (typeof value !== 'string') return false;
    const type = (args.object as { type?: unknown }).type;
    if (type === 'search') return value.length <= 200;
    return /^https?:\/\/\S{1,2000}$/u.test(value);
  }

  /** 用于提供稳定的中文校验失败消息。 */
  defaultMessage(): string {
    return '来源 value 须为 http(s) URL 或不超过 200 字符的搜索提示';
  }
}
