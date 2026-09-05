/**
 * @fileoverview 订阅创建与编辑弹窗：表单、主题色槽展示与提交状态。
 */

'use client';

import { useState } from 'react';
import { AlertCircleIcon } from 'lucide-react';

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@everlearn/ui';

import type { NewsColorSlot } from './news-api';
import type { NewsSubscription, NewsSubscriptionPayload } from './news-subscriptions-api';
import {
  INITIAL_NEWS_FORM,
  SubscriptionForm,
  formFromSubscription,
  toSubscriptionPayload,
} from './news-subscription-form';
import type { NewsFormState } from './news-subscription-form';
import { TopicDot } from './news-item-marks';

/** 弹窗目标：新建或编辑指定订阅。 */
export type SubscriptionDialogMode =
  { readonly kind: 'create' } | { readonly kind: 'edit'; readonly subscription: NewsSubscription };

/** 用于生成随弹窗目标变化的挂载 key 以重置表单。 */
function panelKey(mode: SubscriptionDialogMode): string {
  return mode.kind === 'edit'
    ? `edit-${mode.subscription.id}-${mode.subscription.version}`
    : 'create';
}

/** 用于渲染 1..5 主题色槽预览与分配说明。 */
function ColorSlotPreview() {
  const slots: NewsColorSlot[] = [1, 2, 3, 4, 5];
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="flex items-center gap-1">
        {slots.map((slot) => (
          <TopicDot key={slot} slot={slot} />
        ))}
      </span>
      主题色槽由系统在 1–5 间自动分配
    </div>
  );
}

/** 用于渲染弹窗标题与主题色槽状态区。 */
function PanelIntro(props: { editTarget: NewsSubscription | undefined }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {props.editTarget !== undefined ? '编辑资讯订阅' : '创建资讯订阅'}
        </DialogTitle>
        <DialogDescription>
          订阅按计划采集来源并判定重要性与相关性，条目与简报沉淀到资讯知识库。
        </DialogDescription>
      </DialogHeader>
      {props.editTarget !== undefined ? (
        <p className="m-0 flex items-center gap-2 text-xs text-muted-foreground">
          <TopicDot slot={props.editTarget.colorSlot} />
          当前主题色槽 {props.editTarget.colorSlot} ·{' '}
          {props.editTarget.enabled ? '已启用' : '已停用'}
        </p>
      ) : (
        <ColorSlotPreview />
      )}
    </>
  );
}

/** 用于承载一次弹窗目标的表单状态与提交。 */
function SubscriptionPanel(props: {
  mode: SubscriptionDialogMode;
  onClose: () => void;
  onSubmit: (
    payload: NewsSubscriptionPayload,
    target: { id?: string; version?: number },
  ) => Promise<boolean>;
  pending: boolean;
  submitError?: string | undefined;
}) {
  const [form, setForm] = useState<NewsFormState>(() =>
    props.mode.kind === 'edit' ? formFromSubscription(props.mode.subscription) : INITIAL_NEWS_FORM,
  );
  const editTarget = props.mode.kind === 'edit' ? props.mode.subscription : undefined;
  return (
    <>
      <PanelIntro editTarget={editTarget} />
      {props.submitError !== undefined && (
        <Alert variant="destructive">
          <AlertCircleIcon aria-hidden="true" />
          <AlertTitle>保存失败</AlertTitle>
          <AlertDescription>
            <p className="m-0">{props.submitError}</p>
          </AlertDescription>
        </Alert>
      )}
      <SubscriptionForm
        form={form}
        onChange={setForm}
        /** 用于提交表单并在成功后关闭弹窗。 */
        onSubmit={(event) => {
          event.preventDefault();
          const payload = toSubscriptionPayload(form);
          const target =
            props.mode.kind === 'edit'
              ? { id: props.mode.subscription.id, version: props.mode.subscription.version }
              : {};
          void props.onSubmit(payload, target).then((success) => {
            if (success) props.onClose();
          });
        }}
        pending={props.pending}
      />
    </>
  );
}

/** 用于在订阅创建与编辑弹窗内承载表单并回传载荷。 */
export function SubscriptionDialog(props: {
  mode: SubscriptionDialogMode | null;
  onClose: () => void;
  onSubmit: (
    payload: NewsSubscriptionPayload,
    target: { id?: string; version?: number },
  ) => Promise<boolean>;
  pending: boolean;
  submitError?: string | undefined;
}) {
  const open = props.mode !== null;
  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next) props.onClose();
      }}
      open={open}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto md:max-w-2xl motion-reduce:animate-none">
        {props.mode !== null && (
          <SubscriptionPanel
            key={panelKey(props.mode)}
            mode={props.mode}
            onClose={props.onClose}
            onSubmit={props.onSubmit}
            pending={props.pending}
            submitError={props.submitError}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
