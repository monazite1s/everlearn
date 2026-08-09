/** @fileoverview Preserves the central workspace geometry during route loading. */

import styles from './section-page.module.css';

/** Renders a quiet layout-matched skeleton while a workspace route resolves. */
export default function WorkspaceLoading() {
  return (
    <div className={styles.page} aria-busy="true" aria-label="正在加载页面">
      <div className={styles['skeleton-title']} />
      <div className={styles['skeleton-lead']} />
      <div className={styles['skeleton-body']} />
    </div>
  );
}
