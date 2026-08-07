import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMindsetActivationUrl,
  buildMindsetAISystemPrompt,
  buildMindsetAppOpenUrl,
  classifyMindsetReply,
  containsConfiguredMindsetKeyword,
  DEFAULT_TEST_KEYWORD,
  DOWNLOAD_CHECK_DELAY_MS,
  getDownloadCheckDelayMs,
  getMindsetMilestoneFollowUpDelayMs,
  hasMindsetFollowUpCapacity,
  isWithinMessagingWindow,
  MAX_UNANSWERED_MINDSET_FOLLOW_UPS,
  MESSAGING_WINDOW_MS,
  requiresMindsetHumanHandoff,
  shouldSuppressMindsetAutomatedReply,
  TEST_DOWNLOAD_CHECK_DELAY_MS,
  validateMindsetTestConfiguration,
} from './mindsetFlowLogic';

test('defaults to a unique test keyword rather than the live Manychat keyword', () => {
  assert.equal(DEFAULT_TEST_KEYWORD, 'AMDMTEST8472');
  assert.equal(containsConfiguredMindsetKeyword('AMDMTEST8472'), true);
  assert.equal(containsConfiguredMindsetKeyword('Send AMDMTEST8472 please'), true);
  assert.equal(containsConfiguredMindsetKeyword('MINDSET'), false);
  assert.equal(containsConfiguredMindsetKeyword('AMDMTEST84721'), false);
});

test('supports an explicit keyword only when supplied', () => {
  assert.equal(containsConfiguredMindsetKeyword('CUSTOMTEST', 'CUSTOMTEST'), true);
  assert.equal(containsConfiguredMindsetKeyword('AMDMTEST8472', 'CUSTOMTEST'), false);
});

test('test mode allows sondre_pv but blocks the live Manychat keyword', () => {
  assert.deepEqual(
    validateMindsetTestConfiguration('sondre_pv', 'AMDMTEST8472', 'test'),
    { allowed: true }
  );
  assert.deepEqual(
    validateMindsetTestConfiguration('sondre_pv', 'MINDSET', 'test'),
    { allowed: false, reason: 'Live Manychat keyword is blocked in test mode' }
  );
  assert.deepEqual(
    validateMindsetTestConfiguration('', 'AMDMTEST8472', 'test'),
    { allowed: false, reason: 'Target account and keyword are required' }
  );
});

test('classifies the activation replies that drive the state machine', () => {
  assert.equal(classifyMindsetReply('Yes, I downloaded it'), 'downloaded');
  assert.equal(classifyMindsetReply('I tried my first rep'), 'used');
  assert.equal(classifyMindsetReply('I started the trial'), 'trial_started');
  assert.equal(classifyMindsetReply('I paid for it'), 'subscribed');
  assert.equal(classifyMindsetReply("I haven't started the trial"), 'not_yet');
  assert.equal(classifyMindsetReply('Do I need to be subscribed?'), 'other');
  assert.equal(classifyMindsetReply('Was this built by Sondre?'), 'other');
  assert.equal(classifyMindsetReply('Can you help me use Aomi?'), 'other');
  assert.equal(classifyMindsetReply('It helped'), 'feedback_positive');
  assert.equal(classifyMindsetReply("I didn't like it"), 'feedback_negative');
  assert.equal(classifyMindsetReply('It is too early to tell'), 'feedback_unsure');
  assert.equal(classifyMindsetReply("I can't find the first rep"), 'reason_navigation');
  assert.equal(classifyMindsetReply("The link didn't work"), 'problem');
  assert.equal(classifyMindsetReply("Haven't had time yet"), 'not_yet');
  assert.equal(classifyMindsetReply("I didn't use it"), 'not_yet');
  assert.equal(classifyMindsetReply("No, I didn't download it"), 'not_yet');
  assert.equal(classifyMindsetReply('Can I talk to Sondre?'), 'human');
});

test('enforces a conservative messaging window', () => {
  const now = 1_000_000_000;
  assert.equal(isWithinMessagingWindow(now - MESSAGING_WINDOW_MS + 1, now), true);
  assert.equal(isWithinMessagingWindow(now - MESSAGING_WINDOW_MS, now), false);
  assert.equal(isWithinMessagingWindow(now + 1, now), false);
});

test('uses a fast download check only in test mode', () => {
  assert.equal(getDownloadCheckDelayMs('test'), TEST_DOWNLOAD_CHECK_DELAY_MS);
  assert.equal(getDownloadCheckDelayMs('full'), DOWNLOAD_CHECK_DELAY_MS);
  assert.equal(getDownloadCheckDelayMs('disabled'), DOWNLOAD_CHECK_DELAY_MS);
});

test('uses short milestone follow-ups in test mode and conservative live delays', () => {
  assert.equal(getMindsetMilestoneFollowUpDelayMs('use_check', 'test'), 2 * 60 * 1000);
  assert.equal(getMindsetMilestoneFollowUpDelayMs('use_check', 'mindset'), 45 * 60 * 1000);
  assert.equal(getMindsetMilestoneFollowUpDelayMs('feedback_check', 'mindset'), 5 * 60 * 1000);
});

test('allows at most two automated follow-ups without an athlete reply', () => {
  assert.equal(MAX_UNANSWERED_MINDSET_FOLLOW_UPS, 2);
  assert.equal(hasMindsetFollowUpCapacity(undefined), true);
  assert.equal(hasMindsetFollowUpCapacity(0), true);
  assert.equal(hasMindsetFollowUpCapacity(1), true);
  assert.equal(hasMindsetFollowUpCapacity(2), false);
  assert.equal(hasMindsetFollowUpCapacity(20), false);
});

test('silently suppresses handoff fallback copy', () => {
  assert.equal(shouldSuppressMindsetAutomatedReply(''), true);
  assert.equal(
    shouldSuppressMindsetAutomatedReply("I don't want to guess, so I will get Sondre to answer."),
    true
  );
  assert.equal(shouldSuppressMindsetAutomatedReply('I will flag this for Sondre.'), true);
  assert.equal(shouldSuppressMindsetAutomatedReply('Have you started the trial yet?'), true);
  assert.equal(shouldSuppressMindsetAutomatedReply('Did you subscribe to the offer?'), true);
  assert.equal(shouldSuppressMindsetAutomatedReply('Yes, it works for athletes across sports.'), false);
  assert.equal(shouldSuppressMindsetAutomatedReply('Have you downloaded the app yet?'), false);
});

test('routes sensitive and account-specific requests to a human', () => {
  assert.equal(requiresMindsetHumanHandoff('I was charged and need a refund'), true);
  assert.equal(requiresMindsetHumanHandoff('Can I talk to a real person?'), true);
  assert.equal(requiresMindsetHumanHandoff('Can I speak to Sondre?'), true);
  assert.equal(requiresMindsetHumanHandoff('I think I am depressed'), true);
  assert.equal(requiresMindsetHumanHandoff('I have an eating disorder'), true);
  assert.equal(requiresMindsetHumanHandoff('This brought up trauma for me'), true);
  assert.equal(requiresMindsetHumanHandoff('I need medical advice'), true);
  assert.equal(requiresMindsetHumanHandoff('What sports does the app support?'), false);
  assert.equal(requiresMindsetHumanHandoff('Is this therapy or medical care?'), false);
  assert.equal(requiresMindsetHumanHandoff('I get performance anxiety before games'), false);
  assert.equal(requiresMindsetHumanHandoff('I need more time before trying it'), false);
});

test('feeds the canonical app journey and navigation rules to Claude', () => {
  const onboardingPrompt = buildMindsetAISystemPrompt('awaiting_use_status');
  assert.match(onboardingPrompt, /Home, Training, Progress, and Profile/);
  assert.match(onboardingPrompt, /guided mental-rep preview/i);
  assert.match(onboardingPrompt, /personalized result and then the current App Store subscription offer/i);
  assert.match(onboardingPrompt, /ask what they see before giving one navigation step/i);
  assert.match(onboardingPrompt, /This Instagram assistant is not Aomi/i);
  assert.match(onboardingPrompt, /current Instagram conversation as a sealed conversation/i);
  assert.match(onboardingPrompt, /another Instagram user's conversation/i);

  const subscribedPrompt = buildMindsetAISystemPrompt('subscribed');
  assert.match(subscribedPrompt, /app has verified the subscription/i);
  assert.match(subscribedPrompt, /Home for Today's Mental Rep/i);
  assert.match(subscribedPrompt, /never ask whether they subscribed/i);
});

test('builds an activation link with an opaque lead token and attribution', () => {
  const url = new URL(buildMindsetActivationUrl('lead-token'));
  assert.equal(url.pathname, '/mindsetOpen');
  assert.equal(url.searchParams.get('token'), 'lead-token');

  const appUrl = new URL(buildMindsetAppOpenUrl('lead-token'));
  assert.equal(appUrl.protocol, 'athletemindset:');
  assert.equal(appUrl.host, 'open');
  assert.equal(appUrl.pathname, '/mental-rep');
  assert.equal(appUrl.searchParams.get('ig_lead'), 'lead-token');
  assert.equal(appUrl.searchParams.get('utm_campaign'), 'mindset_activation');
});
