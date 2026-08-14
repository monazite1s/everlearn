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

const everlearnTheme = createTheme({
  colors: { everlearn: colorsTuple('var(--accent)') },
  cursorType: 'pointer',
  defaultRadius: 'md',
  focusRing: 'always',
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
