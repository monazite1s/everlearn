/** @fileoverview 提供工作区页面统一的容器和页头结构。 */

import type { ReactNode } from 'react';

interface PageShellProps {
  /** 页头右侧操作区。 */
  actions?: ReactNode;
  /** 页面主体。 */
  children: ReactNode;
  /** 标题下的一句说明。 */
  lead?: ReactNode;
  /** 页面主标题，须为挂 data-page-title 的可聚焦 h1。 */
  title: ReactNode;
}

/** 用于渲染工作区页面容器和页头。 */
export function PageShell({ actions, children, lead, title }: PageShellProps) {
  return (
    <article className="mx-auto w-full max-w-6xl px-4 md:px-6">
      <header className="flex flex-col gap-1.5 py-6 md:py-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="grid min-w-0 flex-1 gap-1.5 [&>h1]:font-serif [&>h1]:text-title-large md:[&>h1]:text-title-page">
            {title}
            {lead && <p className="m-0 text-sm text-muted-foreground">{lead}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      </header>
      {children}
    </article>
  );
}
