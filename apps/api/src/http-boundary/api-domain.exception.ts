/** @fileoverview 承载带稳定公开错误码与安全文案的领域拒绝异常。 */

import { HttpException } from '@nestjs/common';

/** 用于描述领域层选择的公开错误码、展示文案与 HTTP 状态。 */
export interface ApiDomainProblem {
  readonly code: string;
  readonly kind: 'domain';
  readonly message: string;
  readonly status: number;
}

/** 用于让公开错误过滤器按领域语义而非泛化状态码输出错误信封。 */
export class ApiDomainException extends HttpException {
  /** 用于只保存服务端白名单问题对象，不接受客户端文案。 */
  constructor(readonly problem: ApiDomainProblem) {
    super(problem, problem.status);
  }
}
