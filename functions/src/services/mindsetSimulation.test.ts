import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateMindsetTurn } from './mindsetSimulation';

const activationUrl = 'https://example.com/open-athlete-mindset';

test('simulates an app-link resend as two separate messages without Claude', async () => {
  const result = await simulateMindsetTurn(
    'ai_follow_up',
    'Send it again',
    activationUrl,
    [],
    async () => { throw new Error('Claude should not be called for an explicit link request'); }
  );
  assert.equal(result.reply, 'here you go');
  assert.deepEqual(result.additionalReplies, ['https://www.athletemindset.app/app']);
  assert.equal(result.nextStage, 'ai_follow_up');
  assert.deepEqual(result.buttons, []);
});

test('turns Claude link controls into the same real two-message action', async () => {
  const result = await simulateMindsetTurn(
    'awaiting_download_status',
    'Could you drop that thing I need to install it?',
    activationUrl,
    [],
    async () => ({ text: '[[SEND_APP_LINK]]', usedAI: true })
  );
  assert.equal(result.reply, 'here you go');
  assert.deepEqual(result.additionalReplies, ['https://www.athletemindset.app/app']);
  assert.equal(result.nextStage, 'awaiting_download_status');
  assert.equal(result.createsHandoff, false);
});

test('replaces Claude download-button placeholders with the real two-message action', async () => {
  const result = await simulateMindsetTurn(
    'ai_follow_up',
    'Could you share that with me?',
    activationUrl,
    [],
    async () => ({
      text: "Sure! Here it is: [Download App] Let me know once you've got it opened.",
      usedAI: true,
    })
  );
  assert.equal(result.reply, 'here you go');
  assert.deepEqual(result.additionalReplies, ['https://www.athletemindset.app/app']);
  assert.doesNotMatch(result.reply, /\[Download App\]/i);
});

test('simulates deterministic conversion replies without sending or writing anything', async () => {
  const price = await simulateMindsetTurn(
    'awaiting_subscription_status',
    'It is too expensive for me',
    activationUrl
  );
  assert.match(price.reply, /price matters/i);
  assert.equal(price.nextStage, 'ai_follow_up');

  const payment = await simulateMindsetTurn(
    'awaiting_subscription_status',
    'I already paid',
    activationUrl
  );
  assert.equal(payment.nextStage, 'subscription_claimed');
  assert.match(payment.reply, /let me know what you think/i);
  assert.equal(payment.createsHandoff, false);

  const positiveFeedback = await simulateMindsetTurn(
    'awaiting_feedback',
    'It helped a lot',
    activationUrl
  );
  assert.equal(positiveFeedback.nextStage, 'completed');
  assert.doesNotMatch(positiveFeedback.reply, /subscrib|trial|paid|purchase|\?/i);
  assert.deepEqual(positiveFeedback.quickReplies, []);
});

test('uses the same human-safety routing as live conversations', async () => {
  const result = await simulateMindsetTurn(
    'awaiting_subscription_status',
    'I was charged twice and need a refund',
    activationUrl
  );
  assert.equal(result.nextStage, 'human_handoff');
  assert.equal(result.createsHandoff, true);
  assert.equal(result.reply, '');
  assert.deepEqual(result.quickReplies, []);
});

test('can exercise the adaptive reply path through an injected provider', async () => {
  const result = await simulateMindsetTurn(
    'awaiting_use_status',
    'Does this work for pole vaulters?',
    activationUrl,
    [],
    async () => ({
      text: 'Yes, it is designed for athletes across sports. What mental skill would you most like to train?',
      usedAI: true,
    })
  );
  assert.match(result.reply, /athletes across sports/i);
  assert.equal(result.nextStage, 'ai_follow_up');
  assert.equal(result.createsHandoff, false);
  assert.deepEqual(result.quickReplies, []);
});

test('uses Claude for a natural blocker but closes a clear decline deterministically', async () => {
  let aiCalls = 0;
  const provider = async () => {
    aiCalls++;
    return {
      text: 'No worries. Was there anything specific that put you off?',
      usedAI: true,
    };
  };
  const blocker = await simulateMindsetTurn(
    'awaiting_download_status',
    'No, I did not',
    activationUrl,
    [],
    provider
  );
  assert.equal(aiCalls, 1);
  assert.equal(blocker.reply, 'No worries. Was there anything specific that put you off?');
  assert.equal(blocker.nextStage, 'ai_follow_up');

  const decline = await simulateMindsetTurn(
    'ai_follow_up',
    "Just didn't want to",
    activationUrl,
    [],
    provider
  );
  assert.equal(aiCalls, 1);
  assert.equal(decline.reply, 'No worries, thanks for letting me know.');
  assert.equal(decline.nextStage, 'completed');
  assert.equal(decline.createsHandoff, false);
});

test('passes verified product knowledge into adaptive product-question turns', async () => {
  const questions = [
    'How does the app work?',
    'What is Aomi?',
    'Where do I find training?',
    'Is this therapy?',
  ];
  const capturedPrompts: string[] = [];

  for (const question of questions) {
    const result = await simulateMindsetTurn(
      'ai_follow_up',
      question,
      activationUrl,
      [],
      async (systemPrompt, _history, userMessage) => {
        capturedPrompts.push(systemPrompt);
        const replies: Record<string, string> = {
          'How does the app work?': 'It personalizes a short mental-rep preview during setup, then shows your result and the current App Store offer.',
          'What is Aomi?': 'Aomi is the in-app AI mental coach for voice or chat conversations about nerves, focus, confidence, and competition prep.',
          'Where do I find training?': 'After you have access, open the Training tab for guided visualization, breathwork, meditation, recovery, and resilience sessions.',
          'Is this therapy?': 'No. Athlete Mindset is a sports mental skills tool, not therapy or medical care.',
        };
        return { text: replies[userMessage], usedAI: true };
      }
    );

    assert.equal(result.createsHandoff, false);
    assert.ok(result.reply.length > 0);
    assert.doesNotMatch(result.reply, /—/);
  }

  assert.equal(capturedPrompts.length, questions.length);
  capturedPrompts.forEach((prompt) => {
    assert.match(prompt, /Home, Training, Progress, and Profile/);
    assert.match(prompt, /Instagram assistant is not Aomi/i);
    assert.match(prompt, /Do not ask whether they subscribed, paid, or started a trial/i);
  });
});

test('accepts legacy quick-reply payloads without returning suggested replies', async () => {
  const noTime = await simulateMindsetTurn(
    'awaiting_use_status',
    'Need more time',
    activationUrl,
    [],
    undefined,
    'mindset:reason_no_time'
  );
  assert.match(noTime.reply, /realistic time/i);
  assert.equal(noTime.nextStage, 'ai_follow_up');
  assert.deepEqual(noTime.quickReplies, []);

  const problem = await simulateMindsetTurn(
    'awaiting_use_status',
    'I need help',
    activationUrl,
    [],
    undefined,
    'mindset:problem'
  );
  assert.match(problem.reply, /what happened/i);
  assert.equal(problem.nextStage, 'ai_follow_up');
  assert.deepEqual(problem.quickReplies, []);
});

test('responds naturally when the person only says thanks', async () => {
  for (const message of ['Thanks', 'Thank you so much!', 'Thanks for your help', 'Got it, thanks']) {
    const result = await simulateMindsetTurn(
      'link_sent',
      message,
      activationUrl
    );
    assert.equal(result.reply, 'No problem! Let me know what you think.');
    assert.equal(result.nextStage, 'link_sent');
    assert.equal(result.createsHandoff, false);
    assert.deepEqual(result.quickReplies, []);
    assert.deepEqual(result.buttons, []);
  }
});

test('uses the approved replies for stage-aware yes answers', async () => {
  const downloaded = await simulateMindsetTurn(
    'awaiting_download_status',
    'Yes',
    activationUrl,
    [],
    async () => { throw new Error('Claude should not be called for an unambiguous yes'); }
  );
  assert.equal(downloaded.reply, 'Awesome, excited to hear what you think about it.');
  assert.equal(downloaded.nextStage, 'awaiting_use_status');

  const used = await simulateMindsetTurn(
    'awaiting_use_status',
    'Yep',
    activationUrl,
    [],
    async () => { throw new Error('Claude should not be called for an unambiguous yes'); }
  );
  assert.equal(used.reply, 'Nice! How did that first mental rep feel?');
  assert.equal(used.nextStage, 'awaiting_feedback');
});

test('silently hands off provider fallbacks and forbidden handoff copy', async () => {
  const unavailable = await simulateMindsetTurn(
    'ai_follow_up',
    'Tell me something very specific',
    activationUrl
  );
  assert.equal(unavailable.reply, '');
  assert.equal(unavailable.nextStage, 'human_handoff');
  assert.equal(unavailable.createsHandoff, true);

  const multilingualSensitive = await simulateMindsetTurn(
    'ai_follow_up',
    'Jeg ble belastet to ganger og vil ha refusjon.',
    activationUrl,
    [],
    async () => ({ text: '[[HANDOFF]]', usedAI: true })
  );
  assert.equal(multilingualSensitive.reply, '');
  assert.equal(multilingualSensitive.nextStage, 'human_handoff');
  assert.equal(multilingualSensitive.createsHandoff, true);

  const forbiddenCopy = await simulateMindsetTurn(
    'ai_follow_up',
    'Tell me something very specific',
    activationUrl,
    [],
    async () => ({
      text: "I don't want to guess. I will get Sondre to answer.",
      usedAI: true,
    })
  );
  assert.equal(forbiddenCopy.reply, '');
  assert.equal(forbiddenCopy.nextStage, 'human_handoff');
  assert.equal(forbiddenCopy.createsHandoff, true);

  const forbiddenSubscriptionQuestion = await simulateMindsetTurn(
    'awaiting_feedback',
    'Tell me what comes next',
    activationUrl,
    [],
    async () => ({
      text: 'Glad it helped. Have you started the trial yet?',
      usedAI: true,
    })
  );
  assert.equal(forbiddenSubscriptionQuestion.reply, '');
  assert.equal(forbiddenSubscriptionQuestion.nextStage, 'human_handoff');
  assert.equal(forbiddenSubscriptionQuestion.createsHandoff, true);
});
