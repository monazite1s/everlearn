/** @fileoverview 为尚未接入完整能力的产品模块渲染稳定页面框架。 */

import type { WorkspaceRoute } from './workspace-routes';
import styles from './section-page.module.css';
import { PageShell } from '../../shared/page-shell';

interface SectionPageProps {
  route: WorkspaceRoute;
}

/** 用于渲染带可聚焦标题和保形占位的工作区页面。 */
export function SectionPage({ route }: SectionPageProps) {
  return (
    <PageShell
      eyebrow={`Everlearn · ${route.label}`}
      lead={route.description}
      title={
        <h1 data-page-title tabIndex={-1}>
          {route.label}
        </h1>
      }
    >
      <section aria-labelledby="workspace-preview-title" className={styles.placeholder}>
        <h2 id="workspace-preview-title">工作区已就绪</h2>
        <p>当前阶段仅建立导航与页面结构，业务数据将在对应施工任务中接入。</p>
      </section>
    </PageShell>
  );
}
