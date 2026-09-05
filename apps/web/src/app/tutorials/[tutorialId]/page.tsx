/** @fileoverview 将教程详情路由参数接入三视图详情页面组件。 */

import type { Metadata } from 'next';
import { Suspense } from 'react';

import { ListSkeleton } from '../../../shared/list-skeleton';
import { PageShell } from '../../../shared/page-shell';
import { TutorialDetailPage } from '../../../features/tutorials/tutorial-detail-page';

interface TutorialDetailRouteProps {
  params: Promise<{ tutorialId: string }>;
}

/** 用于渲染指定教程的详情页面。 */
export default async function TutorialDetailRoute({ params }: TutorialDetailRouteProps) {
  const { tutorialId } = await params;
  return (
    <Suspense
      fallback={
        <PageShell title={<h1 data-page-title>教程</h1>}>
          <ListSkeleton count={1} />
        </PageShell>
      }
    >
      <TutorialDetailPage tutorialId={tutorialId} />
    </Suspense>
  );
}

/** 用于让教程详情页继承应用标题模板。 */
export const metadata: Metadata = { title: '教程详情 · Everlearn' };
