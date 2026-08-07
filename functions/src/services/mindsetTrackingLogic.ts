import { timingSafeEqual } from 'crypto';
import { MindsetStage } from './mindsetConversationEngine';

export type MindsetActivationEvent =
  | 'app_opened'
  | 'first_rep_started'
  | 'first_rep_completed'
  | 'paywall_viewed';

export type MindsetConversionEvent = 'trial_started' | 'subscribed';

export function isValidMindsetLeadToken(token: string): boolean {
  return /^[a-f0-9-]{36}$/i.test(token);
}

export function activationTimestampField(event: MindsetActivationEvent): string {
  switch (event) {
    case 'app_opened':
      return 'appOpenedAt';
    case 'first_rep_started':
      return 'firstRepStartedAt';
    case 'first_rep_completed':
      return 'firstRepCompletedAt';
    case 'paywall_viewed':
      return 'paywallViewedAt';
  }
}

export function stageAfterActivationEvent(
  currentStage: MindsetStage,
  event: MindsetActivationEvent
): MindsetStage {
  if ([
    'trial_claimed',
    'subscription_claimed',
    'trial_started',
    'subscribed',
    'completed',
    'human_handoff',
  ].includes(currentStage)) {
    return currentStage;
  }

  if (event === 'paywall_viewed') return 'awaiting_subscription_status';

  if (event === 'first_rep_completed') {
    return currentStage === 'awaiting_offer_status' || currentStage === 'awaiting_subscription_status'
      ? currentStage
      : 'awaiting_feedback';
  }

  if (['awaiting_feedback', 'awaiting_offer_status', 'awaiting_subscription_status'].includes(currentStage)) {
    return currentStage;
  }

  return 'awaiting_use_status';
}

export function conversionTimestampField(event: MindsetConversionEvent): string {
  return event === 'trial_started' ? 'trialStartedAt' : 'subscribedAt';
}

export function conversionVerificationTimestampField(event: MindsetConversionEvent): string {
  return event === 'trial_started' ? 'trialVerifiedAt' : 'subscriptionVerifiedAt';
}

export function stageAfterConversionEvent(
  currentStage: MindsetStage,
  event: MindsetConversionEvent
): MindsetStage {
  if (currentStage === 'completed' || currentStage === 'human_handoff') return currentStage;
  if (currentStage === 'subscribed') return currentStage;
  return event === 'subscribed' ? 'subscribed' : 'trial_started';
}

export function hasValidBearerAuthorization(
  authorization: string | string[] | undefined,
  expectedSecret: string
): boolean {
  if (!expectedSecret) return false;
  const header = Array.isArray(authorization) ? authorization[0] : authorization;
  if (!header?.startsWith('Bearer ')) return false;
  const supplied = header.slice('Bearer '.length);
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expectedSecret);
  return suppliedBuffer.length === expectedBuffer.length && timingSafeEqual(suppliedBuffer, expectedBuffer);
}
