/** @fileoverview 按路由分段渲染模块级面包屑。 */

'use client';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@everlearn/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Fragment } from 'react';

interface Crumb {
  href: string;
  label: string;
}

const SEGMENT_LABELS: Readonly<Record<string, string>> = {
  '': '首页',
  inbox: 'Inbox',
  knowledge: '知识库',
  news: '资讯',
  tutorials: '教程',
  workflows: '工作流',
  settings: '设置',
};

/** 用于把路径分段解析为已知标签的面包屑项，未知动态段不显示。 */
function parseCrumbs(pathname: string): Crumb[] {
  const crumbs: Crumb[] = [{ href: '/', label: SEGMENT_LABELS[''] ?? '首页' }];
  let current = '';
  for (const segment of pathname.split('/').filter(Boolean)) {
    current += `/${segment}`;
    const label = SEGMENT_LABELS[segment];
    if (label) crumbs.push({ href: current, label });
  }
  return crumbs;
}

/** 用于渲染面包屑：祖先项桌面可见，末段当前页常显。 */
export function PageBreadcrumb() {
  const pathname = usePathname();
  const crumbs = parseCrumbs(pathname);
  const lastIndex = crumbs.length - 1;

  /** 用于按位置渲染单个面包屑项与分隔符。 */
  function renderCrumb(crumb: Crumb, index: number) {
    if (index === lastIndex) {
      return (
        <BreadcrumbItem key={crumb.href}>
          <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
        </BreadcrumbItem>
      );
    }
    return (
      <Fragment key={crumb.href}>
        <BreadcrumbItem className="hidden md:block">
          <BreadcrumbLink asChild>
            <Link href={crumb.href}>{crumb.label}</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator className="hidden md:block" />
      </Fragment>
    );
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>{crumbs.map(renderCrumb)}</BreadcrumbList>
    </Breadcrumb>
  );
}
