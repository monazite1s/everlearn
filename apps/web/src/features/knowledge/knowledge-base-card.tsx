/** @fileoverview Renders the shared knowledge-base destination card used by list surfaces. */

import { Badge, Card, Group, Text } from '@mantine/core';
import type { KnowledgeBaseSummary } from '@everlearn/contracts';
import { BookOpenIcon } from 'lucide-react';
import Link from 'next/link';

import styles from './knowledge-page.module.css';

/** Converts one UTC timestamp into concise local reading metadata. */
function formatUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

/** Presents one real knowledge base as a single accessible navigation target. */
export function KnowledgeBaseCard({ knowledgeBase }: { knowledgeBase: KnowledgeBaseSummary }) {
  return (
    <Card
      className={styles.card}
      component={Link}
      href={`/knowledge/${knowledgeBase.id}`}
      padding="lg"
      withBorder
    >
      <Group align="flex-start" justify="space-between" wrap="nowrap">
        <div className={styles['card-copy']}>
          <Text fw={650} lineClamp={1} size="lg">
            {knowledgeBase.name}
          </Text>
          <Text c="dimmed" lineClamp={2} size="sm">
            {knowledgeBase.description || '还没有说明。'}
          </Text>
        </div>
        {knowledgeBase.kind !== 'normal' && <Badge variant="light">系统</Badge>}
      </Group>
      <Group className={styles.meta} gap="xs">
        <BookOpenIcon aria-hidden="true" size={15} />
        <Text c="dimmed" size="xs">
          {knowledgeBase.documentCount} 篇文档 · 更新于 {formatUpdatedAt(knowledgeBase.updatedAt)}
        </Text>
      </Group>
    </Card>
  );
}
