/** @fileoverview 提供跨页面一致的本地化时间格式化。 */

/** 用于将 UTC 时间字符串转换为中文本地阅读格式。 */
export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
