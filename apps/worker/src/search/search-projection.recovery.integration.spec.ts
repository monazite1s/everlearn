/** @fileoverview 以真实 API、PostgreSQL 与 Redis 验证周期扫描和重启恢复闭环。 */

import { Queue } from 'bullmq';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { DocumentsTestEnvironment } from '../../../api/tests/documents-integration.support';
import { startSearchProjectionRuntime } from './search-projection.runtime';
import type { SearchProjectionRuntime } from './search-projection.runtime';

const databaseUrl = process.env.DATABASE_URL;
const redisUrl = process.env.REDIS_URL ?? '';
const secret = 'search-recovery-integration-secret';
const queueName = `search-projection-recovery-${process.pid}`;
const environment = new DocumentsTestEnvironment(
  `search_worker_recovery_${process.pid}`,
  databaseUrl ?? '',
);
const knowledgeBaseId = '2f000000-0000-4000-8000-000000000001';
const documentId = '2f000000-0000-4000-8000-000000000002';
let apiInternalUrl = '';
let runtime: SearchProjectionRuntime | undefined;

/** 用于限制队列清理只命中 Vitest 的本机 Redis。 */
function hasSafeInfrastructure(): boolean {
  if (databaseUrl === undefined || process.env.NODE_ENV !== 'test' || redisUrl === '') return false;
  try {
    return ['127.0.0.1', '::1', '[::1]', 'localhost'].includes(new URL(redisUrl).hostname);
  } catch {
    return false;
  }
}

/** 用于删除本测试专属队列的全部状态。 */
async function clearSearchQueue(): Promise<void> {
  if (!hasSafeInfrastructure()) throw new Error('Unsafe Redis cleanup target');
  const queue = new Queue(queueName, { connection: { url: redisUrl } });
  await queue.obliterate({ force: true });
  await queue.close();
}

/** 用于启动连接真实内部 API 的 Search Worker 运行时。 */
async function startRuntime(): Promise<SearchProjectionRuntime> {
  return startSearchProjectionRuntime(
    { apiInternalUrl, intervalMs: 100, queueName, redisUrl, secret },
    {
      /** 用于静默成功回调。 */
      onCompleted: () => undefined,
      /** 用于静默失败回调。 */
      onFailed: () => undefined,
    },
  );
}

/** 用于轮询真实投影直到成功或在明确期限后失败。 */
async function waitForProjection(): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const row = await environment
      .getDatabase()
      .selectFrom('search_document_projections')
      .select('indexed_document_version')
      .where('document_id', '=', documentId)
      .executeTakeFirst();
    if (row?.indexed_document_version === 1) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('Search projection did not converge');
}

/** 用于删除投影并保留 Knowledge 当前正文作为补偿事实源。 */
async function removeProjection(): Promise<void> {
  await environment
    .getDatabase()
    .deleteFrom('search_document_projections')
    .where('document_id', '=', documentId)
    .execute();
}

/** 用于验证周期任务及 Redis 丢失后的启动任务均会重新收敛。 */
async function recoversThroughPeriodicAndStartupScans(): Promise<void> {
  runtime = await startRuntime();
  await waitForProjection();
  await removeProjection();
  await waitForProjection();

  await runtime.close();
  runtime = undefined;
  await clearSearchQueue();
  await removeProjection();
  runtime = await startRuntime();
  await waitForProjection();

  const block = await environment
    .getDatabase()
    .selectFrom('search_blocks')
    .select(['document_id', 'text'])
    .where('document_id', '=', documentId)
    .executeTakeFirstOrThrow();
  expect(block).toEqual({ document_id: documentId, text: 'Redis 恢复正文' });
}

/** 用于准备隔离 API、有效正文与空 Redis 队列。 */
async function prepareRecoveryFixture(): Promise<void> {
  process.env.PURGE_TRIGGER_SECRET = secret;
  await clearSearchQueue();
  await environment.prepareApplication();
  apiInternalUrl = await environment.listenForInternalWorker();
  await environment.insertKnowledgeBases([{ id: knowledgeBaseId, name: '恢复库' }]);
  await environment.insertDocuments([{ id: documentId, knowledgeBaseId, position: 0 }]);
  const content = {
    content: [
      {
        attrs: { blockId: '2f000000-0000-4000-8000-000000000003' },
        content: [{ text: 'Redis 恢复正文', type: 'text' }],
        type: 'paragraph',
      },
    ],
    type: 'doc',
  };
  await environment
    .getDatabase()
    .updateTable('documents')
    .set({ content_json: content as never, plain_text: 'Redis 恢复正文' })
    .where('id', '=', documentId)
    .execute();
}

/** 用于释放运行时、队列和隔离数据库。 */
async function releaseRecoveryFixture(): Promise<void> {
  await runtime?.close();
  await clearSearchQueue();
  await environment.releaseApplication();
}

/** 用于仅在真实本机基础设施可用时注册恢复闭环。 */
function defineSearchProjectionRecoveryTests(): void {
  beforeAll(prepareRecoveryFixture, 30_000);
  afterAll(releaseRecoveryFixture);
  test('recovers through periodic and startup scans', recoversThroughPeriodicAndStartupScans);
}

describe.skipIf(!hasSafeInfrastructure())(
  'search projection Worker recovery',
  defineSearchProjectionRecoveryTests,
);
