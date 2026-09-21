import assert from 'node:assert/strict';
import test from 'node:test';
import { SensitiveDataRedactor } from '../../src/infrastructure/observability/sensitive-data-redactor.js';

test('SensitiveDataRedactor', async (t) => {
  const redactor = new SensitiveDataRedactor();

  await t.test('redacts API keys', () => {
    const input = 'Here is my api_key: "abc123DEF456ghi789jkl0" for the service.';
    const result = redactor.redact(input);
    assert.match(result, /\[REDACTED\]/);
    assert.doesNotMatch(result, /abc123DEF456ghi789jkl0/);
  });

  await t.test('redacts bearer tokens', () => {
    const input = 'Authorization: Bearer some-long-token.value.here';
    const result = redactor.redact(input);
    assert.match(result, /\[REDACTED\]/);
    assert.doesNotMatch(result, /some-long-token\.value\.here/);
  });

  await t.test('redacts passwords', () => {
    const input = 'My password="superSecretPassword123"';
    const result = redactor.redact(input);
    assert.match(result, /\[REDACTED\]/);
    assert.doesNotMatch(result, /superSecretPassword123/);
  });

  await t.test('redacts JWTs', () => {
    const input = 'Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const result = redactor.redact(input);
    assert.match(result, /\[REDACTED\]/);
    assert.doesNotMatch(result, /eyJhbGciOi/);
  });

  await t.test('redacts email addresses (PII)', () => {
    const input = 'Contact me at user.name+tag@example.com for info.';
    const result = redactor.redact(input);
    assert.match(result, /\[REDACTED\]/);
    assert.doesNotMatch(result, /user\.name\+tag@example\.com/);
  });

  await t.test('deeply redacts objects exactly', () => {
    const input = {
      email: 'john@example.com',
      nested: {
        token: 'Bearer mytoken12345'
      }
    };
    const result = redactor.redactObject(input);
    assert.equal(result.email, '[REDACTED]');
    assert.equal((result.nested as any).token, '[REDACTED]');
  });

  await t.test('leaves non-sensitive strings unchanged', () => {
    const input = 'This is a normal log message with numbers 12345 and normal text.';
    const result = redactor.redact(input);
    assert.equal(result, input);
  });
});
