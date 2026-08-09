/** @fileoverview Provides accessible transient notifications with mandatory action alternatives. */

'use client';

import * as ToastPrimitive from 'radix-ui/toast';
import type { ComponentProps, MouseEventHandler, ReactNode } from 'react';

import styles from './interactive.module.css';

export interface ToastActionSpec {
  altText: string;
  label: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
}

export interface ToastProps extends ComponentProps<typeof ToastPrimitive.Root> {
  action?: ToastActionSpec;
  description?: string;
  title: string;
}

export interface ToastProviderProps extends ComponentProps<typeof ToastPrimitive.Provider> {
  children: ReactNode;
}

/** Establishes the notification region and its documented F8 keyboard shortcut. */
export function ToastProvider({ children, label = '通知', ...props }: ToastProviderProps) {
  return (
    <ToastPrimitive.Provider {...props} label={label} swipeDirection="right">
      {children}
      <ToastPrimitive.Viewport className={styles.toastViewport} hotkey={['F8']} />
    </ToastPrimitive.Provider>
  );
}

/** Renders one foreground notification with optional explanatory text and recovery action. */
export function Toast({ action, description, title, ...props }: ToastProps) {
  return (
    <ToastPrimitive.Root {...props} className={styles.toast} type="foreground">
      <div className={styles.toastBody}>
        <ToastPrimitive.Title className={styles.toastTitle}>{title}</ToastPrimitive.Title>
        {description && (
          <ToastPrimitive.Description className={styles.toastDescription}>
            {description}
          </ToastPrimitive.Description>
        )}
      </div>
      {action && (
        <ToastPrimitive.Action altText={action.altText} asChild>
          <button className={styles.toastAction} onClick={action.onClick} type="button">
            {action.label}
          </button>
        </ToastPrimitive.Action>
      )}
      <ToastPrimitive.Close className={styles.toastClose} aria-label="关闭通知">
        ×
      </ToastPrimitive.Close>
    </ToastPrimitive.Root>
  );
}
