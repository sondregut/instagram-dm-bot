import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMindsetActionPlan,
  MindsetStage,
} from './mindsetConversationEngine';
import { ANDROID_AVAILABILITY_REPLY } from './mindsetProductKnowledge';
import {
  classifyMindsetReply,
  classifyMindsetReplyForStage,
  constrainMindsetAIReply,
  normalizeMindsetText,
  requiresMindsetHumanHandoff,
} from './mindsetFlowLogic';

const activationUrl = 'https://example.com/mindset-open?token=test';

test('sends a requested app link as its own real message', () => {
  const plan = buildMindsetActionPlan('app_link_request', 'ai_follow_up', activationUrl);
  assert.ok(plan);
  assert.equal(plan.message, 'here you go! hope you like it');
  assert.deepEqual(plan.additionalMessages, ['https://athletemindset.app/app']);
  assert.equal(plan.nextStage, 'ai_follow_up');
  assert.equal(plan.buttons, undefined);
});

test('keeps Vault link delivery and replies product-specific', () => {
  const context = { template: 'vault_tracker_download' as const };
  const linkPlan = buildMindsetActionPlan(
    'app_link_request',
    'awaiting_link_request',
    activationUrl,
    context
  );
  assert.ok(linkPlan);
  assert.equal(linkPlan.message, 'here you go! hope you like it');
  assert.deepEqual(linkPlan.additionalMessages, ['https://stavhopp.no/get?src=instagram']);
  assert.equal(linkPlan.nextStage, 'link_sent');

  const downloadedPlan = buildMindsetActionPlan(
    'downloaded',
    'awaiting_download_status',
    activationUrl,
    context
  );
  assert.ok(downloadedPlan);
  assert.equal(downloadedPlan.message, 'awesome, excited to hear what you think about Vault');
  assert.doesNotMatch(downloadedPlan.message, /Athlete Mindset|mental rep/i);

  const usedPlan = buildMindsetActionPlan('used', 'awaiting_use_status', activationUrl, context);
  assert.ok(usedPlan);
  assert.equal(usedPlan.nextStage, 'completed');
  assert.doesNotMatch(usedPlan.message, /\?/);
});

const intentCases: Array<[string, ReturnType<typeof classifyMindsetReply>]> = [
  ["I didn't use it", 'not_yet'],
  ['I didn’t use it', 'not_yet'],
  ['I downloaded it but haven’t opened it', 'not_yet'],
  ['No, it was too expensive', 'price_objection'],
  ['It costs too much for me', 'price_objection'],
  ['How much does it cost?', 'price_question'],
  ['What is the price?', 'price_question'],
  ['It helped a lot', 'feedback_positive'],
  ['I like it', 'feedback_positive'],
  ['I love the app', 'feedback_positive'],
  ['I hate the app', 'feedback_negative'],
  ['I hate you', 'other'],
  ["I didn't like it", 'feedback_negative'],
  ['It is too early to tell', 'feedback_unsure'],
  ["I can't find the first rep", 'reason_navigation'],
  ['The link is broken', 'problem'],
  ['No, the link is broken', 'problem'],
  ["Just didn't want to", 'not_interested'],
  ["Didn't want to", 'not_interested'],
  ["I don't want the app", 'not_interested'],
  ["I don't want it", 'not_interested'],
  ["I'm not interested", 'not_interested'],
  ['No thanks', 'not_interested'],
  ['I changed my mind', 'not_interested'],
  ['Stop messaging me', 'not_interested'],
  ['Leave me alone', 'not_interested'],
  ['Unsubscribe', 'not_interested'],
  ['I downloaded and opened it', 'downloaded'],
  ['I used it but did not like it', 'feedback_negative'],
  ['I completed my first rep', 'used'],
  ['I started the trial', 'trial_started'],
  ['I already paid', 'subscribed'],
  ['Can I talk to Sondre?', 'human'],
  ['Was Athlete Mindset built by Sondre?', 'other'],
  ['Can you help me use Aomi?', 'other'],
  ['Does the app support runners?', 'other'],
  ['Do I need to be subscribed?', 'other'],
  ["I haven't started the trial", 'not_yet'],
  ['Am I subscribed?', 'other'],
  ['Yes', 'other'],
  ['Does this work for pole vaulters?', 'other'],
  ['Send me the app link again', 'app_link_request'],
  ['Is this available for Android?', 'android_availability'],
  ['Is it in the Play Store?', 'android_availability'],
  ['Does this work on a Samsung Galaxy?', 'android_availability'],
];

test('normalizes Instagram punctuation before intent matching', () => {
  assert.equal(normalizeMindsetText('  I didn’t   use it  '), "i didn't use it");
  assert.equal(normalizeMindsetText('I haven‘t opened it'), "i haven't opened it");
});

test('classifies realistic free-text replies in priority order', () => {
  intentCases.forEach(([input, expected]) => {
    assert.equal(classifyMindsetReply(input), expected, input);
  });
});

test('recognizes short feedback in the feedback stage', () => {
  assert.equal(classifyMindsetReplyForStage('Good', 'awaiting_feedback'), 'feedback_positive');
  assert.equal(classifyMindsetReplyForStage('Really good!', 'awaiting_feedback'), 'feedback_positive');
  assert.equal(classifyMindsetReplyForStage('Good', 'awaiting_download_status'), 'other');
});

test('routes billing and safety messages to a real human handoff', () => {
  [
    'I need a refund',
    'I was charged twice',
    'I want to talk to a real person',
    'This feels unsafe',
  ].forEach((input) => assert.equal(requiresMindsetHumanHandoff(input), true, input));
});

test('does not send another link after a user says they opened the app', () => {
  const plan = buildMindsetActionPlan('downloaded', 'awaiting_download_status', activationUrl);
  assert.ok(plan);
  assert.equal(plan.nextStage, 'awaiting_use_status');
  assert.equal(plan.buttons, undefined);
  assert.equal(plan.message, 'Awesome, excited to hear what you think about it.');
  assert.doesNotMatch(plan.message, /https?:\/\//i);
  assert.doesNotMatch(plan.message, /\?/);
  assert.equal(plan.quickReplies, undefined);
});

test('answers Android availability exactly without restarting either product journey', () => {
  for (const template of ['athlete_mindset_download', 'vault_tracker_download'] as const) {
    const plan = buildMindsetActionPlan(
      'android_availability',
      'completed',
      activationUrl,
      { template }
    );
    assert.ok(plan);
    assert.equal(plan.message, ANDROID_AVAILABILITY_REPLY);
    assert.equal(
      plan.message,
      'sorry, it’s not available for android yet, but if we see there’s demand for it, we might make it in the future'
    );
    assert.equal(plan.nextStage, 'completed');
    assert.equal(plan.additionalMessages, undefined);
    assert.equal(plan.buttons, undefined);
    assert.equal(plan.quickReplies, undefined);
    assert.doesNotMatch(plan.message, /[?.—]$/);
  }
});

test('responds to not using the app according to the current stage', () => {
  const repPlan = buildMindsetActionPlan('not_yet', 'awaiting_use_status', activationUrl);
  assert.ok(repPlan);
  assert.match(repPlan.message, /first mental rep/i);
  assert.equal(repPlan.quickReplies, undefined);

  const downloadPlan = buildMindsetActionPlan('not_yet', 'awaiting_download_status', activationUrl);
  assert.ok(downloadPlan);
  assert.match(downloadPlan.message, /downloading or opening/i);
  assert.equal(downloadPlan.quickReplies, undefined);
});

test('acknowledges a clear decline once and completes the funnel', () => {
  const plan = buildMindsetActionPlan('not_interested', 'ai_follow_up', activationUrl);
  assert.ok(plan);
  assert.equal(plan.message, 'No worries, thanks for letting me know.');
  assert.equal(plan.nextStage, 'completed');
  assert.doesNotMatch(plan.message, /\?|download|open|try/i);
});

test('handles price replies without irrelevant download buttons', () => {
  const objection = buildMindsetActionPlan('price_objection', 'awaiting_use_status', activationUrl);
  assert.ok(objection);
  assert.match(objection.message, /price matters/i);
  assert.equal(objection.quickReplies, undefined);
  assert.equal(objection.buttons, undefined);

  const question = buildMindsetActionPlan('price_question', 'awaiting_subscription_status', activationUrl);
  assert.ok(question);
  assert.match(question.message, /exact current price/i);
  assert.doesNotMatch(question.message, /\?/);
  assert.equal(question.quickReplies, undefined);
});

test('answers a navigation blocker without sending another app link', () => {
  const plan = buildMindsetActionPlan('reason_navigation', 'awaiting_use_status', activationUrl);
  assert.ok(plan);
  assert.match(plan.message, /during setup/i);
  assert.match(plan.message, /open Home/i);
  assert.match(plan.message, /what screen are you on/i);
  assert.equal(plan.buttons, undefined);
});

test('stops selling after a claimed conversion without marking it verified', () => {
  const plan = buildMindsetActionPlan('subscribed', 'awaiting_subscription_status', activationUrl);
  assert.ok(plan);
  assert.equal(plan.nextStage, 'subscription_claimed');
  assert.equal(plan.message, "Awesome! Excited to hear how you like it. Let me know what you think after you've used it a bit.");
  assert.doesNotMatch(plan.message, /[?—]/);
  assert.doesNotMatch(plan.message, /buy now|pay now|price|start (?:a|the) (?:trial|subscription)/i);
  assert.equal(plan.quickReplies, undefined);

  const trialPlan = buildMindsetActionPlan('trial_started', 'awaiting_subscription_status', activationUrl);
  assert.ok(trialPlan);
  assert.equal(trialPlan.nextStage, 'trial_claimed');
  assert.equal(trialPlan.quickReplies, undefined);
});

test('does not ask for subscription status after positive feedback', () => {
  const plan = buildMindsetActionPlan('feedback_positive', 'awaiting_feedback', activationUrl);
  assert.ok(plan);
  assert.equal(plan.nextStage, 'completed');
  assert.doesNotMatch(plan.message, /subscrib|trial|paid|purchase|\?/i);
  assert.equal(plan.quickReplies, undefined);
});

test('ends naturally after a rep or any feedback without another question', () => {
  for (const action of ['used', 'feedback_positive', 'feedback_unsure', 'feedback_negative']) {
    const plan = buildMindsetActionPlan(action, 'awaiting_feedback', activationUrl);
    assert.ok(plan);
    assert.equal(plan.nextStage, 'completed', action);
    assert.doesNotMatch(plan.message, /\?/, action);
    assert.doesNotMatch(plan.message, /—/, action);
  }
});

test('creates a silent handoff without an automated reply', () => {
  const plan = buildMindsetActionPlan('human', 'ai_follow_up', activationUrl);
  assert.ok(plan);
  assert.equal(plan.message, '');
  assert.equal(plan.nextStage, 'human_handoff');
  assert.equal(plan.createsHandoff, true);
});

test('all deterministic responses fit Instagram copy constraints', () => {
  const actions = [
    'downloaded', 'used', 'rep_not_yet', 'feedback_positive', 'feedback_unsure',
    'feedback_negative', 'offer_not_started', 'offer_question', 'objection_price',
    'price_objection', 'price_question', 'trial_claimed', 'trial_started', 'subscribed',
    'onboarding_help', 'complete', 'not_yet', 'not_interested', 'problem', 'reason_navigation',
    'reason_link', 'reason_unsure', 'reason_no_time', 'human',
    'gratitude',
    'app_link_request',
    'android_availability',
  ];
  const stages: MindsetStage[] = [
    'awaiting_download_status',
    'awaiting_use_status',
    'awaiting_subscription_status',
  ];

  for (const action of actions) {
    for (const stage of stages) {
      const plan = buildMindsetActionPlan(action, stage, activationUrl);
      assert.ok(plan, `${action}/${stage}`);
      assert.ok(plan.message.length <= 200, `${action} message is ${plan.message.length} characters`);
      assert.equal(plan.quickReplies, undefined, `${action} should not send suggested replies`);
      assert.doesNotMatch(plan.message, /—/, `${action} should not use an em dash`);
      plan.buttons?.forEach((button) => {
        assert.ok(button.title.length <= 20, `${action} button "${button.title}" is too long`);
      });
    }
  }
});

test('answers simple gratitude casually without restarting the funnel', () => {
  const plan = buildMindsetActionPlan('gratitude', 'link_sent', activationUrl);
  assert.ok(plan);
  assert.equal(plan.message, 'No problem! Let me know what you think.');
  assert.equal(plan.nextStage, 'link_sent');
  assert.doesNotMatch(plan.message, /[?—]/);
  assert.equal(plan.buttons, undefined);
  assert.equal(plan.quickReplies, undefined);
});

test('simulates the screenshot conversation without generic fallbacks', () => {
  let stage: MindsetStage = 'awaiting_download_status';

  const downloadedAction = classifyMindsetReply('I downloaded it');
  const downloadedPlan = buildMindsetActionPlan(downloadedAction, stage, activationUrl);
  assert.ok(downloadedPlan);
  stage = downloadedPlan.nextStage;
  assert.equal(downloadedPlan.message, 'Awesome, excited to hear what you think about it.');

  const unusedAction = classifyMindsetReply('I didn’t use it');
  const unusedPlan = buildMindsetActionPlan(unusedAction, stage, activationUrl);
  assert.ok(unusedPlan);
  assert.match(unusedPlan.message, /what got in the way/i);

  const priceAction = classifyMindsetReply('No it was too expensive');
  const pricePlan = buildMindsetActionPlan(priceAction, stage, activationUrl);
  assert.ok(pricePlan);
  assert.match(pricePlan.message, /price matters/i);
  assert.doesNotMatch(pricePlan.message, /what stopped you/i);
});

test('hard-limits AI replies without cutting a word mid-stream', () => {
  const longReply = 'This is a complete useful first sentence. '.repeat(8) + 'One final question?';
  const constrained = constrainMindsetAIReply(longReply);
  assert.ok(constrained.length <= 200);
  assert.match(constrained, /[.!?…]$/);

  const longSingleSentence = constrainMindsetAIReply(
    'Athlete Mindset helps athletes with nerves, confidence, focus, visualization, resetting after mistakes, and building a repeatable mental routine through short guided sessions that fit around training and competition.'
  );
  assert.ok(longSingleSentence.length <= 200);
  assert.match(longSingleSentence, /\.$/);
  assert.doesNotMatch(longSingleSentence, /…$/);

  const noEmDash = constrainMindsetAIReply('That makes sense — here is what to try next.');
  assert.doesNotMatch(noEmDash, /—/);
  assert.equal(noEmDash, 'That makes sense. Here is what to try next.');
});
