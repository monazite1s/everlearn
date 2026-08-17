/** @fileoverview 前端 API 请求骨架：JSON 请求执行、失败信封解析与记录收窄守卫。 */

/** 服务端失败信封的稳定投影，certainty 区分已知失败与不可识别结果。 */
export interface ApiFailureEnvelope<C extends string = string> {
  readonly certainty: 'known' | 'unknown';
  readonly code?: C;
  readonly message: string;
  readonly requestId?: string;
}

/** 请求结果判别联合：成功携带数据，失败携带稳定信封。 */
export type ApiResult<T, C extends string = string> =
  | { readonly data: T; readonly ok: true }
  | { readonly error: ApiFailureEnvelope<C>; readonly ok: false };

/** 用于将不可信 JSON 收窄为非数组记录。 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 用于验证响应对象只包含批准的公开字段。 */
export function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && expected.every((key) => actual.includes(key));
}

/** 用于只读取服务端错误信封中稳定且用户安全的部分。 */
export function parseApiFailure<C extends string>(
  value: unknown,
  certainty: ApiFailureEnvelope<C>['certainty'],
  codes: readonly C[],
): ApiFailureEnvelope<C> {
  if (!isRecord(value) || typeof value.message !== 'string') {
    return { certainty, message: '服务返回了无法识别的结果，请稍后重试。' };
  }
  const code =
    typeof value.code === 'string' && codes.includes(value.code as C)
      ? (value.code as C)
      : undefined;
  const requestId = typeof value.requestId === 'string' ? value.requestId : undefined;
  return {
    certainty,
    ...(code ? { code } : {}),
    message: value.message,
    ...(requestId ? { requestId } : {}),
  };
}

/** 用于安全解码 JSON 且不向界面暴露传输或解析错误。 */
async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

/** requestApi 的执行参数。 */
export interface ApiRequestOptions<T, C extends string> {
  /** 服务端错误码闭集，用于稳定收窄失败信封。 */
  readonly codes: readonly C[];
  readonly expectedStatus: number;
  readonly init?: RequestInit | undefined;
  /** 网络失败时展示的稳定文案。 */
  readonly networkMessage: string;
  /** 用于校验成功投影，返回 undefined 视为不可识别结果。 */
  readonly parse: (value: unknown) => T | undefined;
  readonly url: string;
}

/** 用于执行 JSON 请求并按错误码闭集校验成功投影与失败信封。 */
export async function requestApi<T, C extends string>(
  options: ApiRequestOptions<T, C>,
): Promise<ApiResult<T, C>> {
  try {
    const response = await fetch(options.url, { cache: 'no-store', ...options.init });
    const body = await readJson(response);
    if (response.status !== options.expectedStatus) {
      return { error: parseApiFailure(body, 'known', options.codes), ok: false };
    }
    const data = options.parse(body);
    if (data) return { data, ok: true };
    return { error: parseApiFailure(body, 'unknown', options.codes), ok: false };
  } catch {
    return { error: { certainty: 'unknown', message: options.networkMessage }, ok: false };
  }
}
