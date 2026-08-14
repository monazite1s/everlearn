/** @fileoverview 在路由加载期间保持中央工作区结构。 */

import styles from './section-page.module.css';

/** 用于在工作区路由解析期间渲染匹配布局的骨架。 */
export default function WorkspaceLoading() {
  return (
    <div className={styles.page} aria-busy="true" aria-label="正在加载页面">
      <div className={styles['skeleton-title']} />
      <div className={styles['skeleton-lead']} />
      <div className={styles['skeleton-body']} />
    </div>
  );
}
