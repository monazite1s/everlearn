/** @fileoverview 提供内部触发密钥的恒时比较，避免时序侧信道。 */

import { createHash, timingSafeEqual } from 'node:crypto';

/** 用于对密钥摘要做恒时比较。 */
export function secretsMatch(expected: string, provided: string): boolean {
  const expectedDigest = createHash('sha256').update(expected).digest();
  const providedDigest = createHash('sha256').update(provided).digest();
  return timingSafeEqual(expectedDigest, providedDigest);
}
