import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activationTimestampField,
  conversionTimestampField,
  conversionVerificationTimestampField,
  hasValidBearerAuthorization,
  isValidMindsetLeadToken,
  stageAfterActivationEvent,
  stageAfterConversionEvent,
} from './mindsetTrackingLogic';

test('validates opaque Instagram DM lead tokens', () => {
  assert.equal(isValidMindsetLeadToken('550e8400-e29b-41d4-a716-446655440000'), true);
  assert.equal(isValidMindsetLeadToken('not-a-token'), false);
});

test('maps app milestones without regressing a later funnel stage', () => {
  assert.equal(activationTimestampField('app_opened'), 'appOpenedAt');
  assert.equal(activationTimestampField('first_rep_started'), 'firstRepStartedAt');
  assert.equal(activationTimestampField('first_rep_completed'), 'firstRepCompletedAt');
  assert.equal(activationTimestampField('paywall_viewed'), 'paywallViewedAt');

  assert.equal(stageAfterActivationEvent('link_clicked', 'app_opened'), 'awaiting_use_status');
  assert.equal(stageAfterActivationEvent('awaiting_use_status', 'first_rep_completed'), 'awaiting_feedback');
  assert.equal(stageAfterActivationEvent('awaiting_subscription_status', 'app_opened'), 'awaiting_subscription_status');
  assert.equal(stageAfterActivationEvent('subscribed', 'app_opened'), 'subscribed');
});

test('keeps subscription conversion updates monotonic', () => {
  assert.equal(conversionTimestampField('trial_started'), 'trialStartedAt');
  assert.equal(conversionTimestampField('subscribed'), 'subscribedAt');
  assert.equal(conversionVerificationTimestampField('trial_started'), 'trialVerifiedAt');
  assert.equal(conversionVerificationTimestampField('subscribed'), 'subscriptionVerifiedAt');
  assert.equal(stageAfterConversionEvent('awaiting_subscription_status', 'trial_started'), 'trial_started');
  assert.equal(stageAfterConversionEvent('trial_claimed', 'trial_started'), 'trial_started');
  assert.equal(stageAfterConversionEvent('subscription_claimed', 'subscribed'), 'subscribed');
  assert.equal(stageAfterConversionEvent('trial_started', 'subscribed'), 'subscribed');
  assert.equal(stageAfterConversionEvent('subscribed', 'trial_started'), 'subscribed');
});

test('validates the server conversion bearer secret exactly', () => {
  assert.equal(hasValidBearerAuthorization('Bearer shared-secret', 'shared-secret'), true);
  assert.equal(hasValidBearerAuthorization('Bearer wrong-secret', 'shared-secret'), false);
  assert.equal(hasValidBearerAuthorization(undefined, 'shared-secret'), false);
  assert.equal(hasValidBearerAuthorization('Bearer shared-secret', ''), false);
});
