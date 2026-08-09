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
    <ToastPrimitive.Provider swipeDirection="right" {...props} label={label}>
      {children}
      <ToastPrimitive.Viewport className={styles['toast-viewport']} hotkey={['F8']} />
    </ToastPrimitive.Provider>
  );
}

/** Renders one foreground notification with optional explanatory text and recovery action. */
export function Toast({ action, className, description, title, ...props }: ToastProps) {
  const classes = `${styles.toast} ${className ?? ''}`.trim();
  return (
    <ToastPrimitive.Root {...props} className={classes} type="foreground">
      <div className={styles['toast-body']}>
        <ToastPrimitive.Title className={styles['toast-title']}>{title}</ToastPrimitive.Title>
        {description && (
          <ToastPrimitive.Description className={styles['toast-description']}>
            {description}
          </ToastPrimitive.Description>
        )}
      </div>
      {action && (
        <ToastPrimitive.Action altText={action.altText} asChild>
          <button className={styles['toast-action']} onClick={action.onClick} type="button">
            {action.label}
          </button>
        </ToastPrimitive.Action>
      )}
      <ToastPrimitive.Close className={styles['toast-close']} aria-label="关闭通知">
        ×
      </ToastPrimitive.Close>
    </ToastPrimitive.Root>
  );
}
