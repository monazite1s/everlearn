/**
 * @fileoverview 定义 Everlearn Web 应用的文档外壳。
 */

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';
import { AppShell } from './shell/app-shell';
import { ThemeProvider, ThemeScript } from './theme-provider';

export const metadata: Metadata = {
  description: '面向个人学习的知识库、资讯、教程与工作流平台。',
  title: 'Everlearn',
};

interface RootLayoutProps {
  children: ReactNode;
}

/** 用于提供所有路由共享的中文 HTML 文档。 */
export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>
        <ThemeProvider>
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
