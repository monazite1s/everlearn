/** @fileoverview Serves approved first-level workspace routes from one canonical definition. */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { SectionPage } from '../section-page';
import { findWorkspaceRoute, workspaceRoutes } from '../workspace-routes';

interface WorkspacePageProps {
  params: Promise<{ section: string }>;
}

/** Pre-renders every approved first-level workspace path. */
export function generateStaticParams(): { section: string }[] {
  const params: { section: string }[] = [];
  for (const route of workspaceRoutes) {
    if (route.id !== 'home') params.push({ section: route.id });
  }
  return params;
}

/** Provides a unique title for route announcements and browser history. */
export async function generateMetadata({ params }: WorkspacePageProps): Promise<Metadata> {
  const route = findWorkspaceRoute((await params).section);
  return { title: route ? `${route.label} · Everlearn` : '未找到 · Everlearn' };
}

/** Renders an approved workspace section or delegates unknown paths to the 404 boundary. */
export default async function WorkspacePage({ params }: WorkspacePageProps) {
  const route = findWorkspaceRoute((await params).section);
  if (!route || route.id === 'home') notFound();
  return <SectionPage route={route} />;
}
