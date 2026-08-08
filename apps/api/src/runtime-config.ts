/**
 * @fileoverview Validates API infrastructure and optional Provider configuration before bootstrap.
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

/** Distinguishes an omitted variable from a supplied but invalid empty value. */
function isDefined(value: string | undefined): boolean {
  return value !== undefined;
}

/** Returns whether any LLM setting was supplied and therefore requires the full group. */
function hasLlmConfiguration(environment: RuntimeEnvironment): boolean {
  return [environment.LLM_BASE_URL, environment.LLM_API_KEY, environment.LLM_MODEL].some(isDefined);
}

/** Returns whether any search setting was supplied and therefore requires the full group. */
function hasSearchConfiguration(environment: RuntimeEnvironment): boolean {
  return [environment.SEARCH_PROVIDER, environment.SEARCH_API_KEY].some(isDefined);
}

/** Defines the API process boundary without exposing secret values in validation errors. */
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
}

/** Selects only supported keys so unrelated process variables never enter application config. */
function selectRuntimeEnvironment(environment: Record<string, unknown>): Record<string, unknown> {
  return {
    DATABASE_URL: environment.DATABASE_URL,
    LLM_API_KEY: environment.LLM_API_KEY,
    LLM_BASE_URL: environment.LLM_BASE_URL,
    LLM_MODEL: environment.LLM_MODEL,
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

/** Formats field names and constraints while deliberately omitting rejected values. */
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

/** Returns frozen validated configuration or aborts bootstrap with actionable field names. */
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
