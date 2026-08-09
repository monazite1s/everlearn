/**
 * @fileoverview Verifies Worker runtime configuration groups and secret-safe failures.
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

/** Confirms that the minimum infrastructure configuration is accepted. */
function acceptsRequiredInfrastructure(): void {
  const configuration = validateRuntimeEnvironment(requiredEnvironment);
  expect(configuration.S3_BUCKET).toBe('everlearn');
  expect(Object.isFrozen(configuration)).toBe(true);
}

/** Invokes validation without the Redis setting for the assertion below. */
function validateMissingRedis(): void {
  validateRuntimeEnvironment({
    DATABASE_URL: requiredEnvironment.DATABASE_URL,
    S3_ACCESS_KEY: requiredEnvironment.S3_ACCESS_KEY,
    S3_BUCKET: requiredEnvironment.S3_BUCKET,
    S3_ENDPOINT: requiredEnvironment.S3_ENDPOINT,
    S3_FORCE_PATH_STYLE: requiredEnvironment.S3_FORCE_PATH_STYLE,
    S3_REGION: requiredEnvironment.S3_REGION,
    S3_SECRET_KEY: requiredEnvironment.S3_SECRET_KEY,
  });
}

/** Confirms that absent required infrastructure stops startup. */
function rejectsMissingInfrastructure(): void {
  expect(validateMissingRedis).toThrow(/REDIS_URL/u);
}

/** Invokes validation with a partial search group for the assertion below. */
function validatePartialSearchGroup(): void {
  validateRuntimeEnvironment({
    ...requiredEnvironment,
    SEARCH_PROVIDER: 'tavily',
  });
}

/** Confirms that optional Provider groups are all-or-nothing. */
function rejectsPartialProviderGroup(): void {
  expect(validatePartialSearchGroup).toThrow(/SEARCH_API_KEY/u);
  expect(
    validateRuntimeEnvironment.bind(null, { ...requiredEnvironment, SEARCH_PROVIDER: '' }),
  ).toThrow(/SEARCH_PROVIDER/u);
}

/** Invokes validation with a malformed secret-bearing setting. */
function validateSecretBearingFailure(): void {
  validateRuntimeEnvironment({
    ...requiredEnvironment,
    SEARCH_API_KEY: 'sensitive-search-secret',
  });
}

/** Confirms that startup errors identify fields without echoing secret values. */
function hidesSecretValues(): void {
  try {
    validateSecretBearingFailure();
    throw new Error('Expected invalid Provider configuration to throw');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/SEARCH_PROVIDER/u);
    expect((error as Error).message).not.toMatch(/sensitive-search-secret/u);
  }
}

test('accepts required Worker infrastructure configuration', acceptsRequiredInfrastructure);
test('rejects missing Worker infrastructure configuration', rejectsMissingInfrastructure);
test('rejects partial Worker Provider configuration', rejectsPartialProviderGroup);
test('does not expose Worker secrets in validation errors', hidesSecretValues);
