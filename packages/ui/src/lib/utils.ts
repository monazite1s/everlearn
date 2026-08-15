/** @fileoverview 提供 shadcn 组件体系的条件类名合并工具。 */

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** 用于按 Tailwind 语义合并条件类名并消除冲突 utility。 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
