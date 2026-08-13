import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMindsetActivationUrl,
  buildMindsetAISystemPrompt,
  buildMindsetAppOpenUrl,
  buildMindsetDirectAppUrl,
  buildMindsetDownloadDestination,
  buildMindsetScopeClassifierPrompt,
  chooseMindsetPublicReply,
  classifyMindsetReply,
  classifyMindsetReplyForStage,
  containsConfiguredMindsetKeyword,
  DEFAULT_TEST_KEYWORD,
  DOWNLOAD_CHECK_DELAY_MS,
  getDownloadCheckDelayMs,
  getMindsetMilestoneFollowUpDelayMs,
  getMindsetNoClickFollowUpMessage,
  hasMindsetFollowUpCapacity,
  isMindsetAppLinkRequest,
  isMindsetConversationSessionRecent,
  isWithinMessagingWindow,
  MAX_UNANSWERED_MINDSET_FOLLOW_UPS,
  MESSAGING_WINDOW_MS,
  MINDSET_CONVERSATION_SESSION_MS,
  mindsetAIControlAction,
  MINDSET_NO_CLICK_FOLLOW_UP_MESSAGE,
  MINDSET_DIRECT_APP_URL,
  MINDSET_PUBLIC_REPLY_VARIANTS,
  parseMindsetPublicReplyVariants,
  parseMindsetScopeDecision,
  precheckMindsetAutomationScope,
  requiresMindsetHumanHandoff,
  shouldUseMindsetAIForReplyIntent,
  shouldSuppressMindsetAutomatedReply,
  TEST_DOWNLOAD_CHECK_DELAY_MS,
  validateMindsetTestConfiguration,
} from './mindsetFlowLogic';

test('rotates natural public replies deterministically per comment', () => {
  const replies = new Set(
    Array.from({ length: 5 }, (_, index) =>
      chooseMindsetPublicReply(String.fromCharCode(65 + index)))
  );
  assert.deepEqual(replies, new Set(MINDSET_PUBLIC_REPLY_VARIANTS));
  assert.equal(chooseMindsetPublicReply('same-comment'), chooseMindsetPublicReply('same-comment'));
  MINDSET_PUBLIC_REPLY_VARIANTS.forEach((reply) => {
    assert.match(reply, /DMs/i);
    assert.doesNotMatch(reply, /—/);
    assert.ok(reply.length <= 180);
  });
});

test('uses newline-separated campaign replies when configured', () => {
  const configured = 'First reply\nSecond reply\nFirst reply\n  Third reply  ';
  assert.deepEqual(
    parseMindsetPublicReplyVariants(configured),
    ['First reply', 'Second reply', 'Third reply']
  );
  assert.equal(chooseMindsetPublicReply('a', 'Reply one\nReply two'), 'Reply two');
  assert.equal(chooseMindsetPublicReply('b', 'Reply one\nReply two'), 'Reply one');
});

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
  assert.equal(classifyMindsetReply('Send it again'), 'app_link_request');
  assert.equal(classifyMindsetReply('Can you send me the app link?'), 'app_link_request');
  assert.equal(classifyMindsetReply('Where is the download link?'), 'app_link_request');
  assert.equal(classifyMindsetReply('Yes, I downloaded it'), 'downloaded');
  assert.equal(classifyMindsetReply('I tried my first rep'), 'used');
  assert.equal(classifyMindsetReply('I started the trial'), 'trial_started');
  assert.equal(classifyMindsetReply('I paid for it'), 'subscribed');
  assert.equal(classifyMindsetReply("I haven't started the trial"), 'not_yet');
  assert.equal(classifyMindsetReply('Do I need to be subscribed?'), 'other');
  assert.equal(classifyMindsetReply('Was this built by Sondre?'), 'other');
  assert.equal(classifyMindsetReply('Can you help me use Aomi?'), 'other');
  assert.equal(classifyMindsetReply('It helped'), 'feedback_positive');
  assert.equal(classifyMindsetReply('I like it'), 'feedback_positive');
  assert.equal(classifyMindsetReply('I love the app'), 'feedback_positive');
  assert.equal(classifyMindsetReply('I hate the app'), 'feedback_negative');
  assert.equal(classifyMindsetReply('I hate you'), 'other');
  assert.equal(classifyMindsetReplyForStage('Good', 'awaiting_feedback'), 'feedback_positive');
  assert.equal(classifyMindsetReply("I didn't like it"), 'feedback_negative');
  assert.equal(classifyMindsetReply('It is too early to tell'), 'feedback_unsure');
  assert.equal(classifyMindsetReply("I can't find the first rep"), 'reason_navigation');
  assert.equal(classifyMindsetReply("The link didn't work"), 'problem');
  assert.equal(classifyMindsetReply("Haven't had time yet"), 'not_yet');
  assert.equal(classifyMindsetReply("I didn't use it"), 'not_yet');
  assert.equal(classifyMindsetReply("No, I didn't download it"), 'not_yet');
  assert.equal(classifyMindsetReply("Just didn't want to"), 'not_interested');
  assert.equal(classifyMindsetReply("Didn't want to"), 'not_interested');
  assert.equal(classifyMindsetReply("I don't want the app"), 'not_interested');
  assert.equal(classifyMindsetReply("I don't want it"), 'not_interested');
  assert.equal(classifyMindsetReply("I'm not interested"), 'not_interested');
  assert.equal(classifyMindsetReply('No thanks'), 'not_interested');
  assert.equal(classifyMindsetReply('Stop messaging me'), 'not_interested');
  assert.equal(classifyMindsetReply("Don't send it again"), 'not_interested');
  assert.equal(classifyMindsetReply('Leave me alone'), 'not_interested');
  assert.equal(classifyMindsetReply('Unsubscribe'), 'not_interested');
  assert.equal(classifyMindsetReply('Thanks'), 'gratitude');
  assert.equal(classifyMindsetReply('Thank you so much!'), 'gratitude');
  assert.equal(classifyMindsetReply('Thanks for your help'), 'gratitude');
  assert.equal(classifyMindsetReply('Got it, thanks'), 'gratitude');
  assert.equal(classifyMindsetReply('I got it'), 'downloaded');
  assert.equal(classifyMindsetReply('Can I talk to Sondre?'), 'human');
});

test('recognizes app-link requests without overriding opt-outs', () => {
  for (const message of [
    'Send it again',
    'Please resend the link',
    'Can I get the app link?',
    'Send me the app link again',
    'link please',
    'I need the download link again',
  ]) {
    assert.equal(isMindsetAppLinkRequest(message), true, message);
  }
  assert.equal(isMindsetAppLinkRequest("Don't send it again"), false);
  assert.equal(MINDSET_DIRECT_APP_URL, 'https://athletemindset.app/app');
  assert.equal(buildMindsetDirectAppUrl(), 'https://athletemindset.app/app');
  assert.equal(
    buildMindsetDirectAppUrl('https://athletemindset.app/app?source=reel'),
    'https://athletemindset.app/app?source=reel'
  );
  assert.equal(buildMindsetDirectAppUrl('http://example.com'), MINDSET_DIRECT_APP_URL);
});

test('uses Claude for natural conversation while keeping control outcomes deterministic', () => {
  assert.equal(shouldUseMindsetAIForReplyIntent('not_yet'), true);
  assert.equal(shouldUseMindsetAIForReplyIntent('problem'), true);
  assert.equal(shouldUseMindsetAIForReplyIntent('feedback_negative'), false);
  assert.equal(shouldUseMindsetAIForReplyIntent('feedback_unsure'), false);
  assert.equal(shouldUseMindsetAIForReplyIntent('other'), true);
  assert.equal(shouldUseMindsetAIForReplyIntent('downloaded'), false);
  assert.equal(shouldUseMindsetAIForReplyIntent('app_link_request'), false);
  assert.equal(shouldUseMindsetAIForReplyIntent('subscribed'), false);
  assert.equal(shouldUseMindsetAIForReplyIntent('price_question'), false);
  assert.equal(shouldUseMindsetAIForReplyIntent('not_interested'), false);
  assert.equal(shouldUseMindsetAIForReplyIntent('human'), false);
});

test('allows only unambiguous messages to bypass the scope classifier', () => {
  assert.equal(
    precheckMindsetAutomationScope('gratitude', 'Thanks', 'link_sent', true),
    'in_scope'
  );
  assert.equal(
    precheckMindsetAutomationScope('downloaded', 'Yes', 'awaiting_download_status', true),
    'in_scope'
  );
  assert.equal(
    precheckMindsetAutomationScope('feedback_positive', 'I like it', 'awaiting_use_status', true),
    'in_scope'
  );
  assert.equal(
    precheckMindsetAutomationScope('feedback_negative', 'bad', 'awaiting_feedback', true),
    'classify'
  );
  assert.equal(
    precheckMindsetAutomationScope('not_interested', 'Stop messaging me', 'ai_follow_up', false),
    'in_scope'
  );
  assert.equal(
    precheckMindsetAutomationScope('human', 'Can I talk to Sondre?', 'ai_follow_up', true),
    'human_required'
  );
  assert.equal(
    precheckMindsetAutomationScope('other', 'What poles do you use?', 'ai_follow_up', true),
    'classify'
  );
  assert.equal(
    precheckMindsetAutomationScope('gratitude', 'Thanks', 'link_sent', false),
    'classify'
  );
});

test('builds and strictly parses the no-reply scope classifier', () => {
  const prompt = buildMindsetScopeClassifierPrompt(
    'awaiting_use_status',
    'Did you get a chance to try Athlete Mindset?',
    true
  );
  assert.match(prompt, /do not write replies/i);
  assert.match(prompt, /both an app-related part and an unrelated request is OFF_TOPIC/i);
  assert.match(prompt, /When in doubt, choose UNCERTAIN/i);
  assert.match(prompt, /asks about Sondre personally/i);
  assert.match(prompt, /whether the assistant is Sondre or automated/i);
  assert.match(prompt, /frustration with repeated automated questions/i);
  assert.match(prompt, /within seven days/i);
  assert.match(prompt, /Did you get a chance to try Athlete Mindset\?/);

  assert.equal(parseMindsetScopeDecision('IN_SCOPE'), 'in_scope');
  assert.equal(parseMindsetScopeDecision('off_topic.'), 'off_topic');
  assert.equal(parseMindsetScopeDecision('HUMAN_REQUIRED'), 'human_required');
  assert.equal(parseMindsetScopeDecision('UNCERTAIN'), 'uncertain');
  assert.equal(parseMindsetScopeDecision('IN_SCOPE\nHere is a reply'), 'uncertain');
  assert.equal(parseMindsetScopeDecision('I think this is in scope'), 'uncertain');
});

test('expires short-term conversation context after seven days', () => {
  const now = 1_000_000_000;
  assert.equal(
    isMindsetConversationSessionRecent(now - MINDSET_CONVERSATION_SESSION_MS + 1, now),
    true
  );
  assert.equal(
    isMindsetConversationSessionRecent(now - MINDSET_CONVERSATION_SESSION_MS, now),
    false
  );
  assert.equal(isMindsetConversationSessionRecent(undefined, now), false);
  assert.equal(isMindsetConversationSessionRecent(now + 1, now), false);
});

test('interprets short confirmations only in an unambiguous stage', () => {
  for (const reply of ['Yes', 'Yep', 'Yeah', 'Yes I did', 'I did', 'Sure did']) {
    assert.equal(classifyMindsetReplyForStage(reply, 'awaiting_download_status'), 'downloaded');
    assert.equal(classifyMindsetReplyForStage(reply, 'awaiting_use_status'), 'used');
    assert.equal(classifyMindsetReplyForStage(reply, 'ai_follow_up'), 'other');
  }
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

test('uses a casual feedback check only before the tracked app link is clicked', () => {
  assert.equal(
    getMindsetNoClickFollowUpMessage(false),
    'hi, just curious what you think of the app so far if you’ve had a chance to try it yet'
  );
  assert.equal(getMindsetNoClickFollowUpMessage(true), null);
  assert.equal(getMindsetNoClickFollowUpMessage(false), MINDSET_NO_CLICK_FOLLOW_UP_MESSAGE);
  assert.doesNotMatch(MINDSET_NO_CLICK_FOLLOW_UP_MESSAGE, /—|subscrib|paid/i);
});

test('adds conversation attribution to a campaign-specific HTTPS destination', () => {
  const destination = new URL(buildMindsetDownloadDestination(
    'lead-token',
    'https://athletemindset.app/app?source=campaign'
  ));
  assert.equal(destination.origin + destination.pathname, 'https://athletemindset.app/app');
  assert.equal(destination.searchParams.get('source'), 'campaign');
  assert.equal(destination.searchParams.get('utm_source'), 'instagram');
  assert.equal(destination.searchParams.get('utm_medium'), 'dm');
  assert.equal(destination.searchParams.get('ig_lead'), 'lead-token');
});

test('silently suppresses handoff fallback copy', () => {
  assert.equal(shouldSuppressMindsetAutomatedReply(''), true);
  assert.equal(
    shouldSuppressMindsetAutomatedReply("I don't want to guess, so I will get Sondre to answer."),
    true
  );
  assert.equal(shouldSuppressMindsetAutomatedReply('I will flag this for Sondre.'), true);
  assert.equal(
    shouldSuppressMindsetAutomatedReply("I'm just an automated assistant for Athlete Mindset."),
    true
  );
  assert.equal(
    shouldSuppressMindsetAutomatedReply('I can only help answer questions about Athlete Mindset.'),
    true
  );
  assert.equal(shouldSuppressMindsetAutomatedReply('Have you started the trial yet?'), true);
  assert.equal(shouldSuppressMindsetAutomatedReply('Did you subscribe to the offer?'), true);
  assert.equal(shouldSuppressMindsetAutomatedReply('Yes, it works for athletes across sports.'), false);
  assert.equal(shouldSuppressMindsetAutomatedReply('Have you downloaded the app yet?'), false);
  assert.equal(shouldSuppressMindsetAutomatedReply("Thanks for the feedback, I'll"), true);
  assert.equal(shouldSuppressMindsetAutomatedReply('Here is what I would try next,'), true);
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
  assert.match(onboardingPrompt, /only thank you or acknowledge/i);
  assert.match(onboardingPrompt, /unrelated, mixed-topic, ambiguous/i);
  assert.match(onboardingPrompt, /Never answer it or steer it back to the funnel/i);
  assert.match(onboardingPrompt, /whether you are Sondre, whether you are automated/i);
  assert.doesNotMatch(onboardingPrompt, /say you are his automated assistant/i);
  assert.match(onboardingPrompt, /Never repeat a question/i);
  assert.match(onboardingPrompt, /do not want the app/i);
  assert.match(onboardingPrompt, /This Instagram assistant is not Aomi/i);
  assert.match(onboardingPrompt, /current Instagram conversation as a sealed conversation/i);
  assert.match(onboardingPrompt, /another Instagram user's conversation/i);
  assert.match(onboardingPrompt, /original language/i);
  assert.match(onboardingPrompt, /\[\[HANDOFF\]\]/);
  assert.match(onboardingPrompt, /\[\[SEND_APP_LINK\]\]/);
  assert.match(onboardingPrompt, /never claim a link was sent/i);

  const subscribedPrompt = buildMindsetAISystemPrompt('subscribed');
  assert.match(subscribedPrompt, /app has verified the subscription/i);
  assert.match(subscribedPrompt, /Home for Today's Mental Rep/i);
  assert.match(subscribedPrompt, /never ask whether they subscribed/i);
});

test('recognizes Claude multilingual handoff controls without exposing them', () => {
  assert.equal(mindsetAIControlAction('[[HANDOFF]]'), 'handoff');
  assert.equal(mindsetAIControlAction(' [[ handoff ]]\nDo not send this text'), 'handoff');
  assert.equal(mindsetAIControlAction('[[SEND_APP_LINK]]'), 'send_app_link');
  assert.equal(mindsetAIControlAction(' [[ send_app_link ]]\nDo not send this text'), 'send_app_link');
  assert.equal(
    mindsetAIControlAction("Sure! Here it is: [Download App] Let me know once you've got it opened."),
    'send_app_link'
  );
  assert.equal(mindsetAIControlAction('I can help with that.'), null);
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
