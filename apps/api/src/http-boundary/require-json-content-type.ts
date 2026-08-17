/** @fileoverview 提供写路由仅接受 JSON 请求正文的共享中间件。 */

import type { NextFunction, Request, Response } from 'express';

import { UnsupportedMediaTypeException } from '@nestjs/common';

/** 用于在控制器校验前拒绝浏览器表单写入。 */
export function requireJsonContentType(
  request: Request,
  _response: Response,
  next: NextFunction,
): void {
  if (!['DELETE', 'PATCH', 'POST'].includes(request.method)) return next();
  const mediaType = request.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (mediaType !== 'application/json') throw new UnsupportedMediaTypeException();
  next();
}
