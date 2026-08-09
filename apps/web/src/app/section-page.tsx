/** @fileoverview Renders a stable page frame while each product module is implemented later. */

import type { WorkspaceRoute } from './workspace-routes';
import styles from './section-page.module.css';

interface SectionPageProps {
  route: WorkspaceRoute;
}

/** Renders one workspace page with a focusable title and layout-preserving placeholders. */
export function SectionPage({ route }: SectionPageProps) {
  return (
    <article className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Everlearn · {route.label}</p>
        <h1 data-page-title tabIndex={-1}>
          {route.label}
        </h1>
        <p>{route.description}</p>
      </header>
      <section className={styles.placeholder} aria-labelledby="workspace-preview-title">
        <h2 id="workspace-preview-title">工作区已就绪</h2>
        <p>当前阶段仅建立导航与页面结构，业务数据将在对应施工任务中接入。</p>
        <div className={styles.lines} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </section>
    </article>
  );
}
