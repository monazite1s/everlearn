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
export function DialogContent({ children, description, heading, ...props }: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={styles.overlay} />
      <DialogPrimitive.Content
        {...props}
        {...(!description && { 'aria-describedby': undefined })}
        className={styles.dialogContent}
      >
        <header className={styles.dialogHeader}>
          <div>
            <DialogPrimitive.Title className={styles.dialogTitle}>{heading}</DialogPrimitive.Title>
            {description && (
              <DialogPrimitive.Description className={styles.dialogDescription}>
                {description}
              </DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close className={styles.iconButton} aria-label="关闭对话框">
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
  sideOffset = 8,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        {...props}
        className={styles.popoverContent}
        sideOffset={sideOffset}
      >
        {children}
        <PopoverPrimitive.Arrow className={styles.floatingArrow} />
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
}

/** Renders an action menu surface with keyboard navigation and typeahead. */
export function MenuContent({
  children,
  sideOffset = 6,
  ...props
}: ComponentProps<typeof MenuPrimitive.Content>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content {...props} className={styles.menuContent} sideOffset={sideOffset}>
        {children}
      </MenuPrimitive.Content>
    </MenuPrimitive.Portal>
  );
}

/** Renders one selectable menu action without changing its native semantics. */
export function MenuItem({ className, ...props }: ComponentProps<typeof MenuPrimitive.Item>) {
  const classes = `${styles.menuItem} ${className ?? ''}`.trim();
  return <MenuPrimitive.Item {...props} className={classes} />;
}

/** Separates related action groups inside a menu. */
export function MenuSeparator(props: ComponentProps<typeof MenuPrimitive.Separator>) {
  return <MenuPrimitive.Separator {...props} className={styles.menuSeparator} />;
}

/** Adds concise hover and focus help without replacing the trigger's accessible name. */
export function Tooltip({ children, content, side = 'top', ...props }: TooltipProps) {
  return (
    <TooltipPrimitive.Root {...props}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content className={styles.tooltipContent} side={side} sideOffset={6}>
          {content}
          <TooltipPrimitive.Arrow className={styles.floatingArrow} />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
