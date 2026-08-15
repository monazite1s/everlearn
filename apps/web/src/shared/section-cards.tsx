/** @fileoverview 提供官方 dashboard 模式的统计卡区块。 */

import type { LucideIcon } from 'lucide-react';

import {
  Badge,
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@everlearn/ui';

export interface SectionCardItem {
  /** 可选的右上角图标。 */
  icon?: LucideIcon;
  /** 统计项说明文字。 */
  hint?: string;
  /** 统计项名称。 */
  label: string;
  /** 统计值，建议使用 tabular-nums 友好的字符串。 */
  value: string;
}

interface SectionCardsProps {
  /** 统计项集合。 */
  items: readonly SectionCardItem[];
}

/** 用于渲染页面顶部的统计卡网格。 */
export function SectionCards({ items }: SectionCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs @xl/main:grid-cols-2 @5xl/main:grid-cols-4 dark:*:data-[slot=card]:bg-card">
      {items.map((item) => (
        <Card key={item.label}>
          <CardHeader>
            <CardDescription>{item.label}</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums">{item.value}</CardTitle>
            {item.icon && (
              <CardAction>
                <Badge variant="outline">
                  <item.icon aria-hidden="true" />
                </Badge>
              </CardAction>
            )}
          </CardHeader>
          {item.hint && (
            <CardFooter className="text-sm text-muted-foreground">{item.hint}</CardFooter>
          )}
        </Card>
      ))}
    </div>
  );
}
