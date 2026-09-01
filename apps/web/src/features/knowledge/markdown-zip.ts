/** @fileoverview 把子树导出投影组装为按目录层级组织的 Markdown ZIP。 */

import { zipSync } from 'fflate';

import type { DocumentExportResponse } from '@everlearn/contracts';

import { downloadFile, toSafeFileName } from '../../shared/download-file';
import { docJsonToMarkdown } from '../editor/markdown-conversion';
import type { EditorDocumentJson } from '../editor/editor-schema';

/** 用于为同名兄弟文档生成不冲突的目录条目。 */
function resolveEntryNames(items: DocumentExportResponse['items']): string[] {
  const used = new Set<string>();
  return items.map((item) => {
    const segments = [...item.path.map(toSafeFileName), toSafeFileName(item.title)];
    let name = `${segments.join('/')}.md`;
    let counter = 2;
    while (used.has(name)) {
      name = `${segments.join('/')}-${counter}.md`;
      counter += 1;
    }
    used.add(name);
    return name;
  });
}

/** 用于把全部文档正文转为 Markdown 并打包下载 ZIP。 */
export function exportDocumentsAsZip(response: DocumentExportResponse, archiveName: string): void {
  const entries: Record<string, Uint8Array> = {};
  const names = resolveEntryNames(response.items);
  response.items.forEach((item, index) => {
    const name = names[index];
    if (!name) return;
    entries[name] = new TextEncoder().encode(
      docJsonToMarkdown(item.contentJson as EditorDocumentJson),
    );
  });
  const zipped = zipSync(entries);
  downloadFile(
    `${toSafeFileName(archiveName)}.zip`,
    new Blob([zipped], { type: 'application/zip' }),
  );
}
