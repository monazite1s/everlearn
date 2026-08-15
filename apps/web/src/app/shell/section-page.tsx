/** @fileoverview 为尚未接入完整能力的产品模块渲染稳定页面框架。 */

import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@everlearn/ui';
import { BookOpenIcon } from 'lucide-react';

import { PageShell } from '../../shared/page-shell';
import type { WorkspaceRoute } from './workspace-routes';

interface SectionPageProps {
  route: WorkspaceRoute;
}

/** 用于渲染带可聚焦标题和空态说明的工作区页面。 */
export function SectionPage({ route }: SectionPageProps) {
  return (
    <PageShell
      lead={route.description}
      title={
        <h1 data-page-title tabIndex={-1}>
          {route.label}
        </h1>
      }
    >
      <Empty className="mt-6 min-h-72">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BookOpenIcon aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>工作区已就绪</EmptyTitle>
          <EmptyDescription>
            当前阶段仅建立导航与页面结构，业务数据将在对应施工任务中接入。
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </PageShell>
  );
}
