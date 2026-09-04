/** @fileoverview 将教程路由接入教程列表管理页。 */

import type { Metadata } from 'next';

import { TutorialsPage } from '../../features/tutorials/tutorials-page';

export const metadata: Metadata = { title: '教程 · Everlearn' };

/** 用于渲染教程入口页。 */
export default function TutorialsRoutePage() {
  return <TutorialsPage />;
}
