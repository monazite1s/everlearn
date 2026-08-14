/** @fileoverview 提供工作区页面统一的容器和页头结构。 */

import type { ReactNode } from 'react';

import styles from './page-shell.module.css';

interface PageShellProps {
  /** 页头右侧操作区。 */
  actions?: ReactNode;
  /** 页面主体。 */
  children: ReactNode;
  /** 模块眉题。 */
  eyebrow: string;
  /** 标题下的一句说明。 */
  lead?: ReactNode;
  /** 页面主标题，须为挂 data-page-title 的可聚焦 h1。 */
  title: ReactNode;
}

/** 用于渲染工作区页面容器和页头。 */
export function PageShell({ actions, children, eyebrow, lead, title }: PageShellProps) {
  return (
    <article className={styles.page}>
      <header className={styles.header}>
        <div className={styles['header-copy']}>
          <p className={styles.eyebrow}>{eyebrow}</p>
          {title}
          {lead && <p className={styles.lead}>{lead}</p>}
        </div>
        {actions && <div className={styles['header-actions']}>{actions}</div>}
      </header>
      {children}
    </article>
  );
}
