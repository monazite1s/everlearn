/**
 * @fileoverview Defines the document shell for the Everlearn web application.
 */

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = {
  description: '面向个人学习的知识库、资讯、教程与工作流平台。',
  title: 'Everlearn',
};

interface RootLayoutProps {
  children: ReactNode;
}

/** Provides the Chinese-language HTML document shared by every route. */
export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
