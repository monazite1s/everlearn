/**
 * @fileoverview Defines Everlearn's Mantine theme boundary over semantic design tokens.
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

/** Provides Mantine primitives while preserving Everlearn as the sole theme authority. */
export function EverlearnUiProvider({ children, colorMode }: EverlearnUiProviderProps) {
  return (
    <MantineProvider forceColorScheme={colorMode} theme={everlearnTheme}>
      {children}
    </MantineProvider>
  );
}
