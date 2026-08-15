/** @fileoverview 渲染知识库空态。 */

import type { ReactNode } from 'react';
import { LibraryBigIcon } from 'lucide-react';

import { EmptyState } from '../../shared/empty-state';

interface KnowledgeEmptyStateProps {
  /** 空态主行动。 */
  action?: ReactNode;
  /** 自定义标题。 */
  title?: string;
}

/** 用于渲染知识库实体的统一空态文案结构。 */
export function KnowledgeEmptyState({ action, title }: KnowledgeEmptyStateProps) {
  return (
    <EmptyState
      action={action}
      description="从一个明确主题开始，之后可继续添加嵌套文档。"
      icon={LibraryBigIcon}
      title={title ?? '建立你的第一个知识库'}
    />
  );
}
