import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'crypto';
import { verifyMetaWebhookSignature } from './webhookSignature';

test('accepts a valid Meta SHA-256 webhook signature', () => {
  const body = Buffer.from('{"object":"instagram"}');
  const secret = 'test-secret';
  const signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
  assert.equal(verifyMetaWebhookSignature(body, signature, secret), true);
});

test('rejects missing, malformed, and mismatched webhook signatures', () => {
  const body = Buffer.from('payload');
  assert.equal(verifyMetaWebhookSignature(body, undefined, 'secret'), false);
  assert.equal(verifyMetaWebhookSignature(body, 'sha256=bad', 'secret'), false);
  assert.equal(verifyMetaWebhookSignature(body, `sha256=${'0'.repeat(64)}`, 'secret'), false);
});
