/**
 * @fileoverview Verifies Worker runtime configuration groups and secret-safe failures.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

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
  assert.equal(configuration.S3_BUCKET, 'everlearn');
  assert.ok(Object.isFrozen(configuration));
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
  assert.throws(validateMissingRedis, /REDIS_URL/u);
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
  assert.throws(validatePartialSearchGroup, /SEARCH_API_KEY/u);
  assert.throws(
    validateRuntimeEnvironment.bind(null, { ...requiredEnvironment, SEARCH_PROVIDER: '' }),
    /SEARCH_PROVIDER/u,
  );
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
    assert.fail('Expected invalid Provider configuration to throw');
  } catch (error: unknown) {
    assert.ok(error instanceof Error);
    assert.match(error.message, /SEARCH_PROVIDER/u);
    assert.doesNotMatch(error.message, /sensitive-search-secret/u);
  }
}

void test('accepts required Worker infrastructure configuration', acceptsRequiredInfrastructure);
void test('rejects missing Worker infrastructure configuration', rejectsMissingInfrastructure);
void test('rejects partial Worker Provider configuration', rejectsPartialProviderGroup);
void test('does not expose Worker secrets in validation errors', hidesSecretValues);
