/** @fileoverview Provides accessible tabs and single-value selection controls. */

'use client';

import * as SelectPrimitive from 'radix-ui/select';
import * as TabsPrimitive from 'radix-ui/tabs';
import type { ComponentProps } from 'react';

import styles from './interactive.module.css';

export interface SelectTriggerProps extends ComponentProps<typeof SelectPrimitive.Trigger> {
  placeholder?: string;
}

export const Select = SelectPrimitive.Root;
export const SelectGroup = SelectPrimitive.Group;
export const Tabs = TabsPrimitive.Root;

/** Groups tab triggers into one keyboard-navigable list. */
export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  const classes = `${styles.tabsList} ${className ?? ''}`.trim();
  return <TabsPrimitive.List {...props} className={classes} />;
}

/** Renders one tab selector with explicit selected-state styling. */
export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  const classes = `${styles.tabsTrigger} ${className ?? ''}`.trim();
  return <TabsPrimitive.Trigger {...props} className={classes} />;
}

/** Renders the panel associated with the active tab. */
export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  const classes = `${styles.tabsContent} ${className ?? ''}`.trim();
  return <TabsPrimitive.Content {...props} className={classes} />;
}

/** Renders a select trigger with a placeholder and non-semantic disclosure icon. */
export function SelectTrigger({ className, placeholder, ...props }: SelectTriggerProps) {
  const classes = `${styles.selectTrigger} ${className ?? ''}`.trim();
  return (
    <SelectPrimitive.Trigger {...props} className={classes}>
      <SelectPrimitive.Value placeholder={placeholder} />
      <SelectPrimitive.Icon className={styles.selectIcon} aria-hidden="true">
        ▾
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

/** Renders a positioned listbox while retaining native Radix focus management. */
export function SelectContent({
  children,
  className,
  position = 'popper',
  sideOffset = 6,
  ...props
}: ComponentProps<typeof SelectPrimitive.Content>) {
  const classes = `${styles.selectContent} ${className ?? ''}`.trim();
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        {...props}
        className={classes}
        position={position}
        sideOffset={sideOffset}
      >
        <SelectPrimitive.Viewport className={styles.selectViewport}>
          {children}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

/** Renders one single-select option with a visible selected indicator. */
export function SelectItem({
  children,
  className,
  ...props
}: ComponentProps<typeof SelectPrimitive.Item>) {
  const classes = `${styles.selectItem} ${className ?? ''}`.trim();
  return (
    <SelectPrimitive.Item {...props} className={classes}>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className={styles.selectIndicator}>
        ✓
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}
