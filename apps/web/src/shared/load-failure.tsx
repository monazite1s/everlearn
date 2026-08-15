/** @fileoverview 提供跨页面一致的数据读取失败提示。 */

import { AlertCircleIcon, RefreshCwIcon } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle, Button } from '@everlearn/ui';

interface LoadFailureProps {
  /** 失败原因与下一步说明。 */
  description: string;
  /** 可选的就地重试处理，缺省时不渲染重试按钮。 */
  onRetry?: () => void;
  /** 失败对象标题。 */
  title: string;
}

/** 用于渲染可就地重试的数据读取失败提示。 */
export function LoadFailure({ description, onRetry, title }: LoadFailureProps) {
  return (
    <Alert className="mt-4" variant="destructive">
      <AlertCircleIcon aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p className="m-0">{description}</p>
        {onRetry && (
          <Button className="mt-2" onClick={onRetry} size="sm" variant="outline">
            <RefreshCwIcon aria-hidden="true" />
            重新读取
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
