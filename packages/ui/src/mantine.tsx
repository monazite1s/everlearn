/**
 * @fileoverview 以语义化设计令牌定义 Everlearn 的 Mantine 主题边界。
 */

'use client';

import { colorsTuple, createTheme, MantineProvider } from '@mantine/core';
import type { ReactNode } from 'react';

export type EverlearnColorMode = 'dark' | 'light';

interface EverlearnUiProviderProps {
  children: ReactNode;
  colorMode: EverlearnColorMode;
}

/** 用于注册映射语义令牌的色阶；文字色由 globals.css 的 *-text 变量接管。 */
const semanticColors = {
  danger: colorsTuple('var(--danger)'),
  everlearn: colorsTuple('var(--accent)'),
  success: colorsTuple('var(--success)'),
  warning: colorsTuple('var(--warning)'),
} as const;

/** 用于配置浮层的淡入过渡。 */
const calmOverlayTransitions = { transition: 'fade', transitionDuration: 180 } as const;

const everlearnTheme = createTheme({
  colors: semanticColors,
  components: {
    Card: {
      styles: { root: { backgroundColor: 'var(--surface-raised)', borderColor: 'var(--border)' } },
    },
    Drawer: { defaultProps: { transitionProps: calmOverlayTransitions } },
    Input: { styles: { input: { borderColor: 'var(--border)' } } },
    Modal: { defaultProps: { transitionProps: calmOverlayTransitions } },
    NavLink: { styles: { root: { borderRadius: 'var(--radius-small)' } } },
  },
  cursorType: 'pointer',
  defaultRadius: 'md',
  /* auto = 仅键盘 :focus-visible 显示焦点环，鼠标点击不显示。 */
  focusRing: 'auto',
  fontFamily: 'var(--font-interface)',
  headings: { fontFamily: 'var(--font-reading)' },
  primaryColor: 'everlearn',
  radius: {
    lg: 'var(--radius-large)',
    md: 'var(--radius-medium)',
    sm: 'var(--radius-small)',
  },
});

/** 用于提供 Mantine 基础能力并保持唯一主题来源。 */
export function EverlearnUiProvider({ children, colorMode }: EverlearnUiProviderProps) {
  return (
    <MantineProvider forceColorScheme={colorMode} theme={everlearnTheme}>
      {children}
    </MantineProvider>
  );
}
