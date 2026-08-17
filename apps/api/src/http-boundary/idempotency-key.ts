/** @fileoverview 定义可重用写操作幂等键头部的统一校验边界。 */

import { BadRequestException } from '@nestjs/common';

const IDEMPOTENCY_KEY_PATTERN = /^[\x21-\x7E]{1,200}$/u;

/** 用于接收有长度限制的可见 ASCII 幂等键且不记录或改写。 */
export function requireIdempotencyKey(value: string | undefined): string {
  if (value === undefined || !IDEMPOTENCY_KEY_PATTERN.test(value)) {
    throw new BadRequestException();
  }
  return value;
}
