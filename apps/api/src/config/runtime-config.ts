/**
 * @fileoverview 在 API 启动前校验基础设施和可选 Provider 配置。
 */

import { plainToInstance } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsString,
  IsUrl,
  ValidateIf,
  type ValidationError,
  validateSync,
} from 'class-validator';

/** 用于区分未提供变量和已提供空值。 */
function isDefined(value: string | undefined): boolean {
  return value !== undefined;
}

/** 用于判断 LLM 配置组是否需要完整校验。 */
function hasLlmConfiguration(environment: RuntimeEnvironment): boolean {
  return [environment.LLM_BASE_URL, environment.LLM_API_KEY, environment.LLM_MODEL].some(isDefined);
}

/** 用于判断搜索配置组是否需要完整校验。 */
function hasSearchConfiguration(environment: RuntimeEnvironment): boolean {
  return [environment.SEARCH_PROVIDER, environment.SEARCH_API_KEY].some(isDefined);
}

/** 用于判断清理触发密钥是否已提供。 */
function hasPurgeSecret(environment: RuntimeEnvironment): boolean {
  return isDefined(environment.PURGE_TRIGGER_SECRET);
}

/** 用于限定 API 进程配置并避免错误回显密钥。 */
class RuntimeEnvironment {
  @IsUrl({ protocols: ['postgres', 'postgresql'], require_protocol: true, require_tld: false })
  DATABASE_URL!: string;

  @IsUrl({ protocols: ['redis', 'rediss'], require_protocol: true, require_tld: false })
  REDIS_URL!: string;

  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false })
  S3_ENDPOINT!: string;

  @IsString()
  @IsNotEmpty()
  S3_REGION!: string;

  @IsString()
  @IsNotEmpty()
  S3_BUCKET!: string;

  @IsString()
  @IsNotEmpty()
  S3_ACCESS_KEY!: string;

  @IsString()
  @IsNotEmpty()
  S3_SECRET_KEY!: string;

  @IsIn(['true', 'false'])
  S3_FORCE_PATH_STYLE!: string;

  @ValidateIf(hasLlmConfiguration)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false })
  LLM_BASE_URL?: string;

  @ValidateIf(hasLlmConfiguration)
  @IsString()
  @IsNotEmpty()
  LLM_API_KEY?: string;

  @ValidateIf(hasLlmConfiguration)
  @IsString()
  @IsNotEmpty()
  LLM_MODEL?: string;

  @ValidateIf(hasSearchConfiguration)
  @IsIn(['tavily'])
  SEARCH_PROVIDER?: string;

  @ValidateIf(hasSearchConfiguration)
  @IsString()
  @IsNotEmpty()
  SEARCH_API_KEY?: string;

  @ValidateIf(hasPurgeSecret)
  @IsString()
  @IsNotEmpty()
  PURGE_TRIGGER_SECRET?: string;
}

/** 用于只选择受支持字段，隔离无关进程变量。 */
function selectRuntimeEnvironment(environment: Record<string, unknown>): Record<string, unknown> {
  return {
    DATABASE_URL: environment.DATABASE_URL,
    LLM_API_KEY: environment.LLM_API_KEY,
    LLM_BASE_URL: environment.LLM_BASE_URL,
    LLM_MODEL: environment.LLM_MODEL,
    PURGE_TRIGGER_SECRET: environment.PURGE_TRIGGER_SECRET,
    REDIS_URL: environment.REDIS_URL,
    S3_ACCESS_KEY: environment.S3_ACCESS_KEY,
    S3_BUCKET: environment.S3_BUCKET,
    S3_ENDPOINT: environment.S3_ENDPOINT,
    S3_FORCE_PATH_STYLE: environment.S3_FORCE_PATH_STYLE,
    S3_REGION: environment.S3_REGION,
    S3_SECRET_KEY: environment.S3_SECRET_KEY,
    SEARCH_API_KEY: environment.SEARCH_API_KEY,
    SEARCH_PROVIDER: environment.SEARCH_PROVIDER,
  };
}

/** 用于格式化字段约束且不包含被拒绝的值。 */
function formatValidationErrors(errors: ValidationError[]): string {
  const messages = [];
  for (const error of errors) {
    const constraints = Object.values(error.constraints ?? {})
      .sort()
      .join(', ');
    messages.push(`${error.property}: ${constraints || 'invalid value'}`);
  }
  return messages.sort().join('; ');
}

/** 用于返回冻结的有效配置，失败时仅指出字段。 */
export function validateRuntimeEnvironment(
  environment: Record<string, unknown>,
): RuntimeEnvironment {
  const selected = selectRuntimeEnvironment(environment);
  const candidate = plainToInstance(RuntimeEnvironment, selected);
  const errors = validateSync(candidate, {
    forbidUnknownValues: true,
    skipMissingProperties: false,
    stopAtFirstError: false,
    validationError: { target: false, value: false },
  });

  if (errors.length > 0) {
    throw new Error(`Invalid runtime configuration: ${formatValidationErrors(errors)}`);
  }

  return Object.freeze(candidate);
}
