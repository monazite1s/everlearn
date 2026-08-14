/**
 * @fileoverview 验证 API 配置组及其密钥安全错误。
 */

import { expect, test } from 'vitest';

import { validateRuntimeEnvironment } from './runtime-config';

const requiredEnvironment = Object.freeze({
  DATABASE_URL: 'postgresql://everlearn:local@127.0.0.1:5432/everlearn',
  REDIS_URL: 'redis://127.0.0.1:6379',
  S3_ACCESS_KEY: 'fixture-access-key',
  S3_BUCKET: 'everlearn',
  S3_ENDPOINT: 'http://127.0.0.1:8333',
  S3_FORCE_PATH_STYLE: 'true',
  S3_REGION: 'local',
  S3_SECRET_KEY: 'fixture-secret-key',
});

/** 用于验证最小基础设施配置可以通过。 */
function acceptsRequiredInfrastructure(): void {
  const configuration = validateRuntimeEnvironment(requiredEnvironment);
  expect(configuration.S3_BUCKET).toBe('everlearn');
  expect(Object.isFrozen(configuration)).toBe(true);
}

/** 用于构造缺少数据库设置的配置错误。 */
function validateMissingDatabase(): void {
  validateRuntimeEnvironment({
    REDIS_URL: requiredEnvironment.REDIS_URL,
    S3_ACCESS_KEY: requiredEnvironment.S3_ACCESS_KEY,
    S3_BUCKET: requiredEnvironment.S3_BUCKET,
    S3_ENDPOINT: requiredEnvironment.S3_ENDPOINT,
    S3_FORCE_PATH_STYLE: requiredEnvironment.S3_FORCE_PATH_STYLE,
    S3_REGION: requiredEnvironment.S3_REGION,
    S3_SECRET_KEY: requiredEnvironment.S3_SECRET_KEY,
  });
}

/** 用于验证缺少必填基础设施会阻止启动。 */
function rejectsMissingInfrastructure(): void {
  expect(validateMissingDatabase).toThrow(/DATABASE_URL/u);
}

/** 用于构造不完整 LLM 配置组。 */
function validatePartialLlmGroup(): void {
  validateRuntimeEnvironment({
    ...requiredEnvironment,
    LLM_BASE_URL: 'https://llm.example.test/v1',
  });
}

/** 用于验证可选 Provider 配置组必须完整提供。 */
function rejectsPartialProviderGroup(): void {
  expect(validatePartialLlmGroup).toThrow(/LLM_API_KEY/u);
  expect(validatePartialLlmGroup).toThrow(/LLM_MODEL/u);
  expect(
    validateRuntimeEnvironment.bind(null, { ...requiredEnvironment, LLM_API_KEY: '' }),
  ).toThrow(/LLM_API_KEY/u);
}

/** 用于构造包含密钥的无效配置。 */
function validateSecretBearingFailure(): void {
  validateRuntimeEnvironment({
    ...requiredEnvironment,
    LLM_API_KEY: 'sensitive-provider-secret',
  });
}

/** 用于验证启动错误定位字段但不回显密钥。 */
function hidesSecretValues(): void {
  try {
    validateSecretBearingFailure();
    throw new Error('Expected invalid Provider configuration to throw');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/LLM_BASE_URL/u);
    expect((error as Error).message).toMatch(/LLM_MODEL/u);
    expect((error as Error).message).not.toMatch(/sensitive-provider-secret/u);
  }
}

test('accepts required API infrastructure configuration', acceptsRequiredInfrastructure);
test('rejects missing API infrastructure configuration', rejectsMissingInfrastructure);
test('rejects partial API Provider configuration', rejectsPartialProviderGroup);
test('does not expose API secrets in validation errors', hidesSecretValues);
