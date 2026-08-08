import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMindsetActionPlan,
  MindsetStage,
} from './mindsetConversationEngine';
import {
  classifyMindsetReply,
  constrainMindsetAIReply,
  normalizeMindsetText,
  requiresMindsetHumanHandoff,
} from './mindsetFlowLogic';

const activationUrl = 'https://example.com/mindset-open?token=test';

const intentCases: Array<[string, ReturnType<typeof classifyMindsetReply>]> = [
  ["I didn't use it", 'not_yet'],
  ['I didn’t use it', 'not_yet'],
  ['I downloaded it but haven’t opened it', 'not_yet'],
  ['No, it was too expensive', 'price_objection'],
  ['It costs too much for me', 'price_objection'],
  ['How much does it cost?', 'price_question'],
  ['What is the price?', 'price_question'],
  ['It helped a lot', 'feedback_positive'],
  ["I didn't like it", 'feedback_negative'],
  ['It is too early to tell', 'feedback_unsure'],
  ["I can't find the first rep", 'reason_navigation'],
  ['The link is broken', 'problem'],
  ['No, the link is broken', 'problem'],
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
    'onboarding_help', 'complete', 'not_yet', 'problem', 'reason_navigation',
    'reason_link', 'reason_unsure', 'reason_no_time', 'human',
    'gratitude',
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
      assert.ok(plan.message.length <= 240, `${action} message is ${plan.message.length} characters`);
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
  assert.ok(constrained.length <= 240);
  assert.match(constrained, /[.!?…]$/);

  const noEmDash = constrainMindsetAIReply('That makes sense — here is what to try next.');
  assert.doesNotMatch(noEmDash, /—/);
  assert.equal(noEmDash, 'That makes sense. Here is what to try next.');
});
