/**
 * @fileoverview Provides accessible floating surfaces with stable Everlearn styling.
 */

'use client';

import * as DialogPrimitive from 'radix-ui/dialog';
import * as MenuPrimitive from 'radix-ui/dropdown-menu';
import * as PopoverPrimitive from 'radix-ui/popover';
import * as TooltipPrimitive from 'radix-ui/tooltip';
import type { ComponentProps, ReactElement, ReactNode } from 'react';

import styles from './interactive.module.css';

export interface DialogContentProps extends ComponentProps<typeof DialogPrimitive.Content> {
  children: ReactNode;
  description?: string;
  heading: string;
}

export interface TooltipProps extends ComponentProps<typeof TooltipPrimitive.Root> {
  children: ReactElement;
  content: ReactNode;
  side?: ComponentProps<typeof TooltipPrimitive.Content>['side'];
}

export const Dialog = DialogPrimitive.Root;
export const DialogClose = DialogPrimitive.Close;
export const DialogTrigger = DialogPrimitive.Trigger;
export const Menu = MenuPrimitive.Root;
export const MenuTrigger = MenuPrimitive.Trigger;
export const Popover = PopoverPrimitive.Root;
export const PopoverClose = PopoverPrimitive.Close;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const TooltipProvider = TooltipPrimitive.Provider;

/** Renders a modal surface with a required accessible name and managed focus. */
export function DialogContent({
  children,
  className,
  description,
  heading,
  ...props
}: DialogContentProps) {
  const classes = `${styles['dialog-content']} ${className ?? ''}`.trim();
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={styles.overlay} />
      <DialogPrimitive.Content
        {...props}
        {...(!description && { 'aria-describedby': undefined })}
        className={classes}
      >
        <header className={styles['dialog-header']}>
          <div>
            <DialogPrimitive.Title className={styles['dialog-title']}>
              {heading}
            </DialogPrimitive.Title>
            {description && (
              <DialogPrimitive.Description className={styles['dialog-description']}>
                {description}
              </DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close className={styles['icon-button']} aria-label="关闭对话框">
            ×
          </DialogPrimitive.Close>
        </header>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/** Renders a non-modal anchored surface while preserving Radix dismissal behavior. */
export function PopoverContent({
  children,
  className,
  sideOffset = 8,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Content>) {
  const classes = `${styles['popover-content']} ${className ?? ''}`.trim();
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content {...props} className={classes} sideOffset={sideOffset}>
        {children}
        <PopoverPrimitive.Arrow className={styles['floating-arrow']} />
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
}

/** Renders an action menu surface with keyboard navigation and typeahead. */
export function MenuContent({
  children,
  className,
  sideOffset = 6,
  ...props
}: ComponentProps<typeof MenuPrimitive.Content>) {
  const classes = `${styles['menu-content']} ${className ?? ''}`.trim();
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content {...props} className={classes} sideOffset={sideOffset}>
        {children}
      </MenuPrimitive.Content>
    </MenuPrimitive.Portal>
  );
}

/** Renders one selectable menu action without changing its native semantics. */
export function MenuItem({ className, ...props }: ComponentProps<typeof MenuPrimitive.Item>) {
  const classes = `${styles['menu-item']} ${className ?? ''}`.trim();
  return <MenuPrimitive.Item {...props} className={classes} />;
}

/** Separates related action groups inside a menu. */
export function MenuSeparator(props: ComponentProps<typeof MenuPrimitive.Separator>) {
  return <MenuPrimitive.Separator {...props} className={styles['menu-separator']} />;
}

/** Adds concise hover and focus help without replacing the trigger's accessible name. */
export function Tooltip({ children, content, side = 'top', ...props }: TooltipProps) {
  return (
    <TooltipPrimitive.Root {...props}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content className={styles['tooltip-content']} side={side} sideOffset={6}>
          {content}
          <TooltipPrimitive.Arrow className={styles['floating-arrow']} />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
