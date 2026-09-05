/**
 * @fileoverview 渲染条目流中安静分隔的单行条目。
 */

'use client';

import { RssIcon, SearchIcon } from 'lucide-react';

import { Badge } from '@everlearn/ui';

import type { NewsItemSummary } from './news-api';
import { formatRelativeTime, streamSourceLabel } from './news-format';
import { ImportanceMark, TopicDot } from './news-item-marks';

/** 用于渲染标题这一整行唯一可聚焦目标。 */
function ItemTitleLink(props: {
  active: boolean;
  href: string;
  onOpen: () => void;
  title: string;
}) {
  return (
    <a
      className="min-w-0 flex-1 rounded-xs pr-2 text-foreground underline-offset-4 transition-colors duration-150 hover:text-foreground/80 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none line-clamp-1 font-medium"
      data-news-item-link
      href={props.href}
      /** 用于拦截左键导航并就地展开详情 Sheet，中键与新标签仍走深链。 */
      onClick={(event) => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey) return;
        event.preventDefault();
        props.onOpen();
      }}
      tabIndex={props.active ? 0 : -1}
    >
      {props.title}
    </a>
  );
}

/** 用于渲染行尾来源轮廓 Badge 与相对时间。 */
function ItemMeta({ item }: { item: NewsItemSummary }) {
  const SourceIcon = item.sourceType === 'rss' ? RssIcon : SearchIcon;
  return (
    <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
      <Badge className="gap-1" variant="outline">
        <SourceIcon aria-hidden="true" />
        {streamSourceLabel(item.sourceType)}
      </Badge>
      <time dateTime={item.discoveredAt}>{formatRelativeTime(item.discoveredAt)}</time>
    </span>
  );
}

/** 用于渲染一条条目行：色点、重要性形状加标题、来源与时间、两行摘要。 */
export function NewsItemRow(props: {
  active: boolean;
  href: string;
  item: NewsItemSummary;
  onOpen: (itemId: string) => void;
}) {
  const { item } = props;
  return (
    <li aria-current={props.active ? 'true' : undefined} className="list-none">
      <div className="grid gap-1 border-b border-border py-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <TopicDot slot={item.colorSlot} />
          <ImportanceMark importance={item.importance} />
          <ItemTitleLink
            active={props.active}
            href={props.href}
            onOpen={() => props.onOpen(item.id)}
            title={item.title}
          />
          <ItemMeta item={item} />
        </div>
        <p className="m-0 line-clamp-2 pl-[18px] text-sm text-muted-foreground">{item.snippet}</p>
      </div>
    </li>
  );
}
