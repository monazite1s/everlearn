/** @fileoverview 提供浏览器端文件下载的共享助手。 */

/** 用于以临时对象地址触发浏览器下载并立即回收。 */
export function downloadFile(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** 用于把标题转成安全的文件名片段。 */
export function toSafeFileName(title: string): string {
  const cleaned = title.replace(/[/\\:*?"<>|]/g, '_').trim();
  return cleaned.length > 0 ? cleaned : 'untitled';
}
