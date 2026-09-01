/** @fileoverview 为浏览器验收拉起真实 API/Worker 构建产物、可控 mock LLM 并管理其生命周期。 */

import { spawn, type ChildProcess } from 'node:child_process';
import type http from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';

/** mock LLM 固定端口。 */
export const E2E_LLM_PORT = 3202;
export const E2E_LLM_BASE_URL = `http://127.0.0.1:${E2E_LLM_PORT}/v1`;

/** 用于读取 web 构建产物中固化的同源代理目标，API 必须监听同一端口。 */
function resolveBakedApiOrigin(): string {
  try {
    const manifestPath = path.resolve('apps/web/.next/routes-manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      rewrites?: Record<string, { destination?: string }[]> | { destination?: string }[];
    };
    const groups = Array.isArray(manifest.rewrites)
      ? [manifest.rewrites]
      : Object.values(manifest.rewrites ?? {});
    for (const group of groups) {
      for (const rewrite of group ?? []) {
        const match = /^https?:\/\/[^/]+/.exec(rewrite.destination ?? '');
        if (match) return match[0];
      }
    }
  } catch {
    // 产物缺失时退回 Next 默认 API Origin。
  }
  return 'http://127.0.0.1:3001';
}

/** API 与 mock LLM 端口：API 端口跟随 web 构建产物固化的代理目标。 */
export const E2E_API_ORIGIN = resolveBakedApiOrigin();
export const E2E_API_PORT = new URL(E2E_API_ORIGIN).port;

/** API 与 Worker 共享的内部密钥，测试用它直触内部投影端点。 */
export const E2E_INTERNAL_SECRET = 'everlearn-e2e-internal-secret';

/** mock LLM 返回的固定草稿文本。 */
export const MOCK_DRAFT_TEXT = '这是由 mock LLM 生成的草稿正文，用于浏览器验收。';

/** mock 问答答案的固定前缀。 */
export const MOCK_QA_ANSWER = '知识库答案：needle 位于正文定位验收文档中。';

/** 当前 mock 问答允许返回的引用，由种子流程按真实文档改写。 */
let mockQaCitations: { blockId: string; documentId: string }[] = [];

/** 用于把问答引用指向本次种子出的真实文档与块。 */
export function setMockQaCitations(citations: { blockId: string; documentId: string }[]): void {
  mockQaCitations = citations;
}

/** 用于按提示词区分问答（要求严格 JSON）与草稿请求。 */
function isQaRequest(messages: { content?: string; role?: string }[]): boolean {
  return messages.some(
    (message) => typeof message.content === 'string' && message.content.includes('严格 JSON'),
  );
}

/** 用于生成 mock 问答的非流式 JSON 内容。 */
function qaContent(): string {
  return JSON.stringify({ answer: MOCK_QA_ANSWER, citations: mockQaCitations });
}

/** 用于生成 mock 草稿的非流式内容。 */
function draftContent(): string {
  return `## AI 草稿摘要\n\n${MOCK_DRAFT_TEXT}`;
}

/** 用于把文本切成固定大小的流式增量。 */
function toChunks(text: string): string[] {
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += 12) chunks.push(text.slice(index, index + 12));
  return chunks;
}

/** 用于处理 mock LLM 的 chat/completions 与 embeddings 请求。 */
async function handleLlmRequest(
  request: IncomingMessageLike,
  response: ServerResponseLike,
): Promise<void> {
  const rawBody = await readBody(request);
  if (request.url?.includes('/embeddings')) {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(
      JSON.stringify({
        data: [
          { embedding: Array.from({ length: 1536 }, () => 0.01), index: 0, object: 'embedding' },
        ],
        model: 'mock',
        object: 'list',
      }),
    );
    return;
  }
  if (!request.url?.includes('/chat/completions')) {
    response.writeHead(404);
    response.end();
    return;
  }
  const body = JSON.parse(rawBody) as {
    messages?: { content?: string; role?: string }[];
    stream?: boolean;
  };
  const messages = body.messages ?? [];
  const content = isQaRequest(messages) ? qaContent() : draftContent();
  if (body.stream !== true) {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(
      JSON.stringify({
        choices: [{ finish_reason: 'stop', message: { content, role: 'assistant' } }],
      }),
    );
    return;
  }
  response.writeHead(200, { 'Content-Type': 'text/event-stream' });
  for (const chunk of toChunks(content)) {
    response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  response.end('data: [DONE]\n\n');
}

interface IncomingMessageLike {
  on(event: 'data', listener: (chunk: Buffer) => void): void;
  on(event: 'end', listener: () => void): void;
  url?: string | undefined;
}

interface ServerResponseLike {
  end(chunk?: string): void;
  write(chunk: string): void;
  writeHead(status: number, headers?: Record<string, string>): void;
}

/** 用于读取请求体文本。 */
function readBody(request: IncomingMessageLike): Promise<string> {
  return new Promise((resolve) => {
    let text = '';
    request.on('data', (chunk) => {
      text += chunk.toString();
    });
    request.on('end', () => resolve(text));
  });
}

/** e2e 运行时的进程句柄集合。 */
interface E2eRuntime {
  readonly killMockLlm: () => Promise<void>;
  readonly release: () => Promise<void>;
}

let refCount = 0;
let runtimePromise: Promise<E2eRuntime> | undefined;
const trackedChildren = new Set<ChildProcess>();
let exitHookInstalled = false;

/** 用于兜底在进程退出瞬间强杀全部子进程，防止优雅关闭挂起留下残留。 */
function installExitHook(): void {
  if (exitHookInstalled) return;
  exitHookInstalled = true;
  process.once('exit', () => {
    for (const child of trackedChildren) child.kill('SIGKILL');
  });
}

/** 用于用 SIGTERM 优雅终止子进程，超时后升级 SIGKILL。 */
async function terminate(child: ChildProcess | undefined): Promise<void> {
  if (child?.exitCode !== null || child?.killed) return;
  child?.kill('SIGTERM');
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      child?.kill('SIGKILL');
      resolve();
    }, 3_000);
    child?.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/** 用于探测端口上已有服务是否可复用。 */
async function isReusable(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
    return response.status < 500;
  } catch {
    return false;
  }
}

/** 用于等待 API 构建产物就绪并可响应。 */
async function waitForApi(deadlineMs: number): Promise<void> {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    if (await isReusable(`${E2E_API_ORIGIN}/api/v1/knowledge-bases`)) return;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`API did not become ready on ${E2E_API_ORIGIN} within ${deadlineMs}ms`);
}

/** 用于构造 API/Worker 共享的运行时环境变量。 */
function childEnv(overrides: Record<string, string>): NodeJS.ProcessEnv {
  const fallbackS3 = {
    S3_ACCESS_KEY: 'e2e',
    S3_BUCKET: 'e2e-bucket',
    S3_ENDPOINT: 'http://127.0.0.1:19999',
    S3_FORCE_PATH_STYLE: 'true',
    S3_REGION: 'e2e-region',
    S3_SECRET_KEY: 'e2e-secret',
  };
  return {
    ...process.env,
    ...fallbackS3,
    HOST: '127.0.0.1',
    PURGE_TRIGGER_SECRET: E2E_INTERNAL_SECRET,
    ...overrides,
  };
}

/** 用于校验构建产物存在，缺失时直接失败并提示构建命令。 */
function assertBuildArtifacts(): void {
  for (const dist of ['apps/api/dist/main.js', 'apps/worker/dist/main.js']) {
    if (!existsSync(path.resolve(dist))) {
      throw new Error(
        `Missing build artifact ${dist}; run pnpm --filter @everlearn/api build && pnpm --filter @everlearn/worker build`,
      );
    }
  }
}

/** 用于拉起 mock LLM 并返回其服务句柄。 */
async function startMockLlm(): Promise<http.Server> {
  const llmServer = createServer((request, response) => {
    void handleLlmRequest(request, response).catch(() => {
      response.writeHead(500);
      response.end();
    });
  });
  await new Promise<void>((resolve) => llmServer.listen(E2E_LLM_PORT, '127.0.0.1', resolve));
  return llmServer;
}

/** API 运行句柄：进程与是否由本运行时持有。 */
interface ApiHandle {
  readonly apiProcess: ChildProcess | undefined;
  readonly ownsApi: boolean;
}

/** 用于复用或拉起 API 进程并等待就绪。 */
async function ensureApiProcess(): Promise<ApiHandle> {
  installExitHook();
  const ownsApi = !(await isReusable(`${E2E_API_ORIGIN}/api/v1/knowledge-bases`));
  process.stdout.write(`[e2e] api origin=${E2E_API_ORIGIN} owns=${String(ownsApi)}\n`);
  const apiProcess = ownsApi
    ? spawn('node', ['apps/api/dist/main.js'], {
        env: childEnv({
          LLM_API_KEY: 'e2e-key',
          LLM_BASE_URL: E2E_LLM_BASE_URL,
          LLM_MODEL: 'mock-model',
          PORT: String(E2E_API_PORT),
        }),
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    : undefined;
  if (apiProcess) trackedChildren.add(apiProcess);
  apiProcess?.stdout.on('data', (chunk) => process.stdout.write(`[api] ${chunk}`));
  apiProcess?.stderr.on('data', (chunk) => process.stderr.write(`[api] ${chunk}`));
  await waitForApi(30_000);
  return { apiProcess, ownsApi };
}

/** 用于拉起 Worker 进程。 */
function startWorkerProcess(): ChildProcess {
  const workerProcess = spawn('node', ['apps/worker/dist/main.js'], {
    env: childEnv({ API_INTERNAL_URL: E2E_API_ORIGIN }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  trackedChildren.add(workerProcess);
  workerProcess.stdout.on('data', (chunk) => process.stdout.write(`[worker] ${chunk}`));
  workerProcess.stderr.on('data', (chunk) => process.stderr.write(`[worker] ${chunk}`));
  return workerProcess;
}

/** 用于拉起 mock LLM、API 与 Worker 并等待就绪。 */
async function bootstrap(): Promise<E2eRuntime> {
  assertBuildArtifacts();
  const llmServer = await startMockLlm();
  const { apiProcess, ownsApi } = await ensureApiProcess();
  const workerProcess = startWorkerProcess();

  let llmKilled = false;
  /** 用于关闭 mock LLM 并容忍 keep-alive 连接。 */
  const closeLlm = async (): Promise<void> => {
    llmServer.closeAllConnections();
    await new Promise<void>((resolve) => llmServer.close(() => resolve()));
  };
  return {
    killMockLlm: /** 用于主动终止 mock LLM 以验收模型不可用场景。 */ async () => {
      llmKilled = true;
      // 直连 keep-alive 连接会阻塞 close 回调，先强制断开再关闭监听。
      await closeLlm();
    },
    release: /** 用于终止本运行时拉起的全部子进程。 */ async () => {
      if (!llmKilled) await closeLlm();
      // ponytail: 复用外部已有 API 时不越权终止；仅清理本进程拉起的子进程。
      if (ownsApi) await terminate(apiProcess);
      await terminate(workerProcess);
    },
  };
}

/** 用于在多 spec 共享下幂等获取运行时，引用计数归零时释放。 */
export function startE2eEnvironment(): Promise<E2eRuntime> {
  refCount += 1;
  runtimePromise ??= bootstrap();
  return runtimePromise;
}

/** 用于释放运行时：仅当最后一个持有者退出时才终止进程。 */
export async function releaseE2eEnvironment(): Promise<void> {
  refCount = Math.max(0, refCount - 1);
  if (refCount > 0 || runtimePromise === undefined) return;
  const runtime = await runtimePromise;
  runtimePromise = undefined;
  await runtime.release();
}
