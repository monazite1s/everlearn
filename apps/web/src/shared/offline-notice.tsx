/** @fileoverview 提供跨页面一致的离线只读状态提示。 */

'use client';

import { Alert } from '@mantine/core';
import { WifiOffIcon } from 'lucide-react';

import styles from './offline-notice.module.css';

const ICON_SIZE = 18;

/** 用于渲染离线提示。 */
export function OfflineNotice() {
  return (
    <Alert
      className={styles.offline}
      icon={<WifiOffIcon aria-hidden="true" size={ICON_SIZE} />}
      role="status"
    >
      当前离线：已加载的知识库仍可查看，新建暂不可用。
    </Alert>
  );
}
