/** @fileoverview 渲染受限上传前的文件确认对话框。 */

'use client';

import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@everlearn/ui';

import { formatBytes } from './use-attachment-upload';

/** AttachmentConfirmDialog 的 props 契约。 */
export interface AttachmentConfirmDialogProps {
  readonly file: File;
  readonly kind: 'file' | 'image';
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

/** 用于在上传前展示文件名、大小与类型并获得用户确认。 */
export function AttachmentConfirmDialog(props: AttachmentConfirmDialogProps) {
  return (
    <Dialog
      onOpenChange={
        /** 用于把关闭意图转交宿主取消。 */ (open) => {
          if (!open) props.onCancel();
        }
      }
      open
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>上传附件</DialogTitle>
          <DialogDescription>
            确认后开始上传；未引用的上传对象保留 24 小时后自动清理。
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 text-sm">
          <p className="m-0 truncate text-foreground" title={props.file.name}>
            {props.file.name}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{formatBytes(props.file.size)}</Badge>
            <Badge variant="secondary">{props.file.type || '未知类型'}</Badge>
            <Badge variant="default">{props.kind === 'image' ? '图片' : '附件'}</Badge>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={props.onCancel} type="button" variant="outline">
            取消
          </Button>
          <Button onClick={props.onConfirm} type="button">
            确认上传
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
