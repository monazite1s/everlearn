/** @fileoverview 渲染知识库空态。 */

import type { ReactNode } from 'react';
import { LibraryBigIcon } from 'lucide-react';

import styles from './knowledge-empty-state.module.css';

interface KnowledgeEmptyStateProps {
  /** 空态主行动。 */
  action?: ReactNode;
  /** 自定义标题。 */
  title?: string;
}

/** 用于渲染知识库空态。 */
export function KnowledgeEmptyState({ action, title }: KnowledgeEmptyStateProps) {
  return (
    <div className={styles['empty-state']}>
      <span className={styles['empty-anchor']} aria-hidden="true">
        <LibraryBigIcon size={28} strokeWidth={1.5} />
      </span>
      <h3 className={styles['empty-title']}>{title ?? '建立你的第一个知识库'}</h3>
      <p className={styles['empty-description']}>从一个明确主题开始，之后可继续添加嵌套文档。</p>
      {action && <div className={styles['empty-action']}>{action}</div>}
    </div>
  );
}
