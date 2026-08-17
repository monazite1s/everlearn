/** @fileoverview 隔离 SeaweedFS S3 兼容端点的直传签名与对象读写边界。 */

import { createHash, createHmac, randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';

import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** 用于抽象供应商命令返回的最小结构。 */
interface S3ClientLike {
  destroy: () => void;
  send: (command: unknown) => Promise<Record<string, unknown>>;
}

/** 用于承载一次直传对象读取的实测属性。 */
export interface UploadedObjectSnapshot {
  readonly mimeType: string;
  readonly sha256: string;
  readonly sizeBytes: number;
}

/** 用于承载授权下载所需的流与元数据。 */
export interface AttachmentObjectStream {
  readonly body: Readable;
  readonly mimeType: string;
}

const PRESIGN_EXPIRY_SECONDS = 900;
const SERVICE = 's3';
const ALGORITHM = 'AWS4-HMAC-SHA256';

/** 用于把时间格式化为 SigV4 规定的 AMZ 日期。 */
function formatAmzDate(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
}

/** 用于按 RFC3986 编码路径段且保留安全字符。 */
function encodePathSegment(segment: string): string {
  return encodeURIComponent(segment).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** 用于把对象键解析为 S3 请求的规范 URI。 */
function buildCanonicalUri(pathStyle: boolean, bucket: string, objectKey: string): string {
  const segments = pathStyle ? [bucket, ...objectKey.split('/')] : objectKey.split('/');
  return `/${segments.map(encodePathSegment).join('/')}`;
}

/** 用于生成 SigV4 派生签名密钥。 */
function deriveSigningKey(secretKey: string, date: string, region: string): Buffer {
  const kDate = createHmac('sha256', `AWS4${secretKey}`).update(date).digest();
  const kRegion = createHmac('sha256', kDate).update(region).digest();
  const kService = createHmac('sha256', kRegion).update(SERVICE).digest();
  return createHmac('sha256', kService).update('aws4_request').digest();
}

/** 用于隔离供应商 SDK 构造细节并保持领域模块不感知凭据。 */
@Injectable()
export class AttachmentStorageProvider implements OnModuleInit, OnModuleDestroy {
  private client: S3ClientLike | undefined;
  private readonly bucket: string;
  private readonly endpoint: string;
  private readonly region: string;
  private readonly accessKey: string;
  private readonly secretKey: string;
  private readonly pathStyle: boolean;

  /** 用于读取已校验的 S3 运行配置且不在日志中回显。 */
  constructor(config: ConfigService<Record<string, string>, false>) {
    this.bucket = config.getOrThrow<string>('S3_BUCKET');
    this.endpoint = config.getOrThrow<string>('S3_ENDPOINT').replace(/\/$/, '');
    this.region = config.getOrThrow<string>('S3_REGION');
    this.accessKey = config.getOrThrow<string>('S3_ACCESS_KEY');
    this.secretKey = config.getOrThrow<string>('S3_SECRET_KEY');
    this.pathStyle = config.getOrThrow<string>('S3_FORCE_PATH_STYLE') === 'true';
  }

  /** 用于在控制器接收请求前完成 SDK 客户端惰性装配。 */
  async onModuleInit(): Promise<void> {
    const { S3Client } = await import('@aws-sdk/client-s3');
    this.client = new S3Client({
      credentials: { accessKeyId: this.accessKey, secretAccessKey: this.secretKey },
      endpoint: this.endpoint,
      forcePathStyle: this.pathStyle,
      region: this.region,
    }) as unknown as S3ClientLike;
  }

  /** 用于停机时释放 SDK 连接池。 */
  onModuleDestroy(): void {
    this.client?.destroy();
  }

  /** 用于为单个对象生成带 Content-Type 签名约束的临时 PUT URL。 */
  // ponytail: presign 属独立包 @aws-sdk/s3-request-presigner 且未获批准，改用标准库 SigV4 查询签名；获批后替换本方法实现。
  createPresignedPut(
    objectKey: string,
    contentType: string,
  ): {
    expiresAt: Date;
    url: string;
  } {
    const now = new Date();
    const amzDate = formatAmzDate(now);
    const date = amzDate.slice(0, 8);
    const scope = `${date}/${this.region}/${SERVICE}/aws4_request`;
    const url = new URL(this.endpoint);
    const host = url.host;
    const canonicalUri = buildCanonicalUri(this.pathStyle, this.bucket, objectKey);
    const signedHeaders = 'content-type;host';
    const canonicalHeaders = `content-type:${contentType}\nhost:${host}\n`;
    const canonicalQuery = [
      `X-Amz-Algorithm=${ALGORITHM}`,
      `X-Amz-Credential=${encodeURIComponent(`${this.accessKey}/${scope}`)}`,
      `X-Amz-Date=${amzDate}`,
      `X-Amz-Expires=${PRESIGN_EXPIRY_SECONDS}`,
      `X-Amz-SignedHeaders=${encodeURIComponent(signedHeaders)}`,
    ]
      .sort()
      .join('&');
    const canonicalRequest = [
      'PUT',
      canonicalUri,
      canonicalQuery,
      canonicalHeaders,
      signedHeaders,
      'UNSIGNED-PAYLOAD',
    ].join('\n');
    const stringToSign = [
      ALGORITHM,
      amzDate,
      scope,
      createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n');
    const signature = createHmac('sha256', deriveSigningKey(this.secretKey, date, this.region))
      .update(stringToSign)
      .digest('hex');
    return {
      expiresAt: new Date(now.getTime() + PRESIGN_EXPIRY_SECONDS * 1000),
      url: `${this.endpoint}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`,
    };
  }

  /** 用于读取对象并流式计算 SHA-256，对象缺失时返回 undefined。 */
  async readUploadedObject(objectKey: string): Promise<UploadedObjectSnapshot | undefined> {
    const response = await this.sendOrUndefined(objectKey, 'getObject');
    if (response === undefined) return undefined;
    const hash = createHash('sha256');
    let sizeBytes = 0;
    for await (const chunk of response.Body as Readable) {
      hash.update(chunk as Buffer);
      sizeBytes += (chunk as Buffer).length;
    }
    return {
      mimeType: readStringHeader(response, 'ContentType', ''),
      sha256: hash.digest('hex'),
      sizeBytes,
    };
  }

  /** 用于打开授权下载流，对象缺失时返回 undefined。 */
  async openObject(objectKey: string): Promise<AttachmentObjectStream | undefined> {
    const response = await this.sendOrUndefined(objectKey, 'getObject');
    if (response === undefined) return undefined;
    return {
      body: response.Body as Readable,
      mimeType: readStringHeader(response, 'ContentType', 'application/octet-stream'),
    };
  }

  /** 用于幂等删除对象，S3 语义下缺失键同样视为成功。 */
  async deleteObject(objectKey: string): Promise<void> {
    await this.send(objectKey, 'deleteObject');
  }

  /** 用于生成新的不可猜测对象键。 */
  createObjectKey(): string {
    return `attachments/${randomUUID()}`;
  }

  /** 用于判定供应商错误是否为对象缺失。 */
  private isObjectMissing(error: unknown): boolean {
    const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    return candidate?.name === 'NoSuchKey' || candidate?.$metadata?.httpStatusCode === 404;
  }

  /** 用于派发对象命令并在对象缺失时返回 undefined。 */
  private async sendOrUndefined(
    objectKey: string,
    operation: 'deleteObject' | 'getObject',
  ): Promise<Record<string, unknown> | undefined> {
    try {
      return await this.send(objectKey, operation);
    } catch (error: unknown) {
      if (this.isObjectMissing(error)) return undefined;
      throw error;
    }
  }

  /** 用于执行单个 S3 对象命令并返回原始响应。 */
  private async send(
    objectKey: string,
    operation: 'deleteObject' | 'getObject',
  ): Promise<Record<string, unknown>> {
    if (this.client === undefined) throw new Error('S3 client is not initialized');
    const { DeleteObjectCommand, GetObjectCommand } = await import('@aws-sdk/client-s3');
    const input = { Bucket: this.bucket, Key: objectKey };
    const command =
      operation === 'getObject' ? new GetObjectCommand(input) : new DeleteObjectCommand(input);
    return this.client.send(command);
  }
}

/** 用于读取响应头并在缺失或非字符串时回退默认值。 */
function readStringHeader(
  response: Record<string, unknown>,
  key: string,
  fallback: string,
): string {
  const value = response[key];
  return typeof value === 'string' ? value : fallback;
}
