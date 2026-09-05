/** @fileoverview 将教程创作子路由接入 compose 对话创作页面。 */

import type { Metadata } from 'next';

import { ComposePage } from '../../../../features/tutorials/compose/compose-page';

interface TutorialComposeRouteProps {
  params: Promise<{ tutorialId: string }>;
}

/** 用于渲染指定教程的创作对话页面。 */
export default async function TutorialComposeRoute({ params }: TutorialComposeRouteProps) {
  const { tutorialId } = await params;
  return <ComposePage tutorialId={tutorialId} />;
}

/** 用于让创作页继承应用标题模板。 */
export const metadata: Metadata = { title: '教程创作 · Everlearn' };
