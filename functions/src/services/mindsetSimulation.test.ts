import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateMindsetTurn } from './mindsetSimulation';
import { ANDROID_AVAILABILITY_REPLY } from './mindsetProductKnowledge';

const activationUrl = 'https://example.com/open-athlete-mindset';

function isScopeClassifierPrompt(systemPrompt: string): boolean {
  return /strict routing classifier/i.test(systemPrompt);
}

function inScopeThen(
  response: { text: string; usedAI: boolean } | ((userMessage: string) => { text: string; usedAI: boolean })
) {
  return async (systemPrompt: string, _history: unknown[], userMessage: string) => {
    if (isScopeClassifierPrompt(systemPrompt)) {
      return { text: 'IN_SCOPE', usedAI: true };
    }
    return typeof response === 'function' ? response(userMessage) : response;
  };
}

const inScopeOnly = inScopeThen({
  text: 'This response path should not be needed.',
  usedAI: true,
});

test('scope-checks an app-link resend before the deterministic two-message action', async () => {
  const result = await simulateMindsetTurn(
    'ai_follow_up',
    'Send it again',
    activationUrl,
    [],
    async (systemPrompt) => {
      assert.equal(isScopeClassifierPrompt(systemPrompt), true);
      return { text: 'IN_SCOPE', usedAI: true };
    }
  );
  assert.equal(result.reply, 'here you go! hope you like it');
  assert.deepEqual(result.additionalReplies, ['https://athletemindset.app/app']);
  assert.equal(result.nextStage, 'ai_follow_up');
  assert.deepEqual(result.buttons, []);
});

test('resends the real app link when the person says it did not arrive', async () => {
  const result = await simulateMindsetTurn(
    'link_sent',
    "i didn't get it",
    activationUrl,
    [],
    async () => { throw new Error('Claude should not be called for a failed link delivery'); }
  );
  assert.equal(result.reply, 'here you go! hope you like it');
  assert.deepEqual(result.additionalReplies, ['https://athletemindset.app/app']);
  assert.equal(result.nextStage, 'link_sent');
  assert.equal(result.createsHandoff, false);
});

test('simulates Vault resends with the exact Vault URL and no Athlete Mindset copy', async () => {
  const result = await simulateMindsetTurn(
    'link_sent',
    "i didn't get it",
    activationUrl,
    [],
    async () => { throw new Error('Claude should not be called for a failed link delivery'); },
    undefined,
    { template: 'vault_tracker_download' }
  );
  assert.equal(result.reply, 'here you go! hope you like it');
  assert.deepEqual(result.additionalReplies, ['https://stavhopp.no/get?src=instagram']);
  assert.equal(result.nextStage, 'link_sent');
  assert.doesNotMatch(JSON.stringify(result), /Athlete Mindset|mental rep/i);
});

test('answers Android questions deterministically for both products, including after completion', async () => {
  const cases = [
    { template: 'athlete_mindset_download' as const, message: 'is it available on android?' },
    { template: 'vault_tracker_download' as const, message: 'does it work on samsung?' },
  ];

  for (const testCase of cases) {
    const result = await simulateMindsetTurn(
      'completed',
      testCase.message,
      activationUrl,
      [],
      async () => { throw new Error('Claude should not be called for Android availability'); },
      undefined,
      { template: testCase.template, conversationIsRecent: false }
    );
    assert.equal(result.reply, ANDROID_AVAILABILITY_REPLY);
    assert.deepEqual(result.additionalReplies, []);
    assert.equal(result.nextStage, 'completed');
    assert.equal(result.createsHandoff, false);
    assert.deepEqual(result.buttons, []);
    assert.deepEqual(result.quickReplies, []);
  }
});

test('silently hands off Vault technique questions while keeping app questions in scope', async () => {
  let classifierPrompt = '';
  const offTopic = await simulateMindsetTurn(
    'ai_follow_up',
    'What pole and grip should I use?',
    activationUrl,
    [],
    async (systemPrompt) => {
      classifierPrompt = systemPrompt;
      return { text: 'OFF_TOPIC', usedAI: true };
    },
    undefined,
    { template: 'vault_tracker_download' }
  );
  assert.equal(offTopic.reply, '');
  assert.equal(offTopic.nextStage, 'human_handoff');
  assert.equal(offTopic.handoffReason, 'off_topic');
  assert.match(classifierPrompt, /Vault/);
  assert.match(classifierPrompt, /which pole or grip to use/i);

  const inScope = await simulateMindsetTurn(
    'ai_follow_up',
    'How do I add a pole in Vault?',
    activationUrl,
    [],
    inScopeThen({ text: 'Open your pole library in Vault and add the pole there.', usedAI: true }),
    undefined,
    { template: 'vault_tracker_download' }
  );
  assert.equal(inScope.createsHandoff, false);
  assert.match(inScope.reply, /pole library/i);
});

test('turns Claude link controls into the same real two-message action', async () => {
  const result = await simulateMindsetTurn(
    'awaiting_download_status',
    'Could you drop that thing I need to install it?',
    activationUrl,
    [],
    inScopeThen({ text: '[[SEND_APP_LINK]]', usedAI: true })
  );
  assert.equal(result.reply, 'here you go! hope you like it');
  assert.deepEqual(result.additionalReplies, ['https://athletemindset.app/app']);
  assert.equal(result.nextStage, 'awaiting_download_status');
  assert.equal(result.createsHandoff, false);
});

test('replaces Claude download-button placeholders with the real two-message action', async () => {
  const result = await simulateMindsetTurn(
    'ai_follow_up',
    'Could you share that with me?',
    activationUrl,
    [],
    inScopeThen({
      text: "Sure! Here it is: [Download App] Let me know once you've got it opened.",
      usedAI: true,
    })
  );
  assert.equal(result.reply, 'here you go! hope you like it');
  assert.deepEqual(result.additionalReplies, ['https://athletemindset.app/app']);
  assert.doesNotMatch(result.reply, /\[Download App\]/i);
});

test('simulates deterministic conversion replies without sending or writing anything', async () => {
  const price = await simulateMindsetTurn(
    'awaiting_subscription_status',
    'It is too expensive for me',
    activationUrl,
    [],
    inScopeOnly
  );
  assert.match(price.reply, /price matters/i);
  assert.equal(price.nextStage, 'ai_follow_up');

  const payment = await simulateMindsetTurn(
    'awaiting_subscription_status',
    'I already paid',
    activationUrl,
    [],
    inScopeOnly
  );
  assert.equal(payment.nextStage, 'subscription_claimed');
  assert.match(payment.reply, /let me know what you think/i);
  assert.equal(payment.createsHandoff, false);

  const positiveFeedback = await simulateMindsetTurn(
    'awaiting_feedback',
    'It helped a lot',
    activationUrl,
    [],
    inScopeOnly
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
    inScopeThen({
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
  const provider = async (systemPrompt: string) => {
    aiCalls++;
    if (isScopeClassifierPrompt(systemPrompt)) {
      return { text: 'IN_SCOPE', usedAI: true };
    }
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
  assert.equal(aiCalls, 2);
  assert.equal(blocker.reply, 'No worries. Was there anything specific that put you off?');
  assert.equal(blocker.nextStage, 'ai_follow_up');

  const decline = await simulateMindsetTurn(
    'ai_follow_up',
    "Just didn't want to",
    activationUrl,
    [],
    provider
  );
  assert.equal(aiCalls, 3);
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
        if (isScopeClassifierPrompt(systemPrompt)) {
          return { text: 'IN_SCOPE', usedAI: true };
        }
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
  const missingButtonFallback = await simulateMindsetTurn(
    'awaiting_link_request',
    'link',
    activationUrl,
    [],
    async () => { throw new Error('Claude should not be called when the person replies link'); }
  );
  assert.equal(missingButtonFallback.reply, 'here you go! hope you like it');
  assert.deepEqual(missingButtonFallback.additionalReplies, ['https://athletemindset.app/app']);
  assert.equal(missingButtonFallback.nextStage, 'link_sent');

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
  assert.equal(used.reply, 'nice, glad you gave it a try!');
  assert.equal(used.nextStage, 'completed');
  assert.doesNotMatch(used.reply, /\?/);
});

test('ends the screenshot conversation instead of asking repeated feedback questions', async () => {
  const gotIt = await simulateMindsetTurn(
    'awaiting_download_status',
    'I got it',
    activationUrl
  );
  assert.equal(gotIt.reply, 'Awesome, excited to hear what you think about it.');
  assert.equal(gotIt.nextStage, 'awaiting_use_status');

  const likedIt = await simulateMindsetTurn(
    gotIt.nextStage,
    'I like it',
    activationUrl,
    [],
    async () => { throw new Error('Claude should not be called for clear positive feedback'); }
  );
  assert.equal(likedIt.reply, 'love to hear that!');
  assert.equal(likedIt.nextStage, 'completed');
  assert.doesNotMatch(likedIt.reply, /\?/);

  for (const laterMessage of ['I tried a rep', 'Good']) {
    const terminal = await simulateMindsetTurn(
      'completed',
      laterMessage,
      activationUrl,
      [],
      async () => { throw new Error('Claude should not be called after the funnel is complete'); }
    );
    assert.equal(terminal.reply, '', laterMessage);
    assert.equal(terminal.nextStage, 'completed', laterMessage);
    assert.equal(terminal.createsHandoff, false, laterMessage);
  }
});

test('still resends the real app link after the conversation is complete', async () => {
  const result = await simulateMindsetTurn(
    'completed',
    'Send me the app link again',
    activationUrl,
    [],
    async (systemPrompt) => {
      assert.equal(isScopeClassifierPrompt(systemPrompt), true);
      return { text: 'IN_SCOPE', usedAI: true };
    }
  );
  assert.equal(result.reply, 'here you go! hope you like it');
  assert.deepEqual(result.additionalReplies, ['https://athletemindset.app/app']);
  assert.equal(result.nextStage, 'completed');
});

test('never restarts a human-owned conversation', async () => {
  const result = await simulateMindsetTurn(
    'human_handoff',
    'Send me the app link again',
    activationUrl,
    [],
    async () => { throw new Error('Claude should not be called for a human-owned conversation'); }
  );
  assert.equal(result.reply, '');
  assert.equal(result.nextStage, 'human_handoff');
  assert.equal(result.createsHandoff, false);
});

test('silently hands off off-topic, mixed-topic, uncertain, and stale messages', async () => {
  const cases = [
    {
      message: 'What poles and spikes do you use?',
      classifier: 'OFF_TOPIC',
      reason: 'off_topic',
      recent: true,
    },
    {
      message: 'Thanks for the app link. What poles do you use?',
      classifier: 'OFF_TOPIC',
      reason: 'off_topic',
      recent: true,
    },
    {
      message: 'Send me the link to your pole vault video again',
      classifier: 'OFF_TOPIC',
      reason: 'off_topic',
      recent: true,
    },
    {
      message: 'What about that thing?',
      classifier: 'UNCERTAIN',
      reason: 'scope_uncertain',
      recent: true,
    },
    {
      message: 'I already said I have exams and no time.',
      classifier: 'HUMAN_REQUIRED',
      reason: 'scope_human_required',
      recent: true,
    },
    {
      message: 'Thanks',
      classifier: 'UNCERTAIN',
      reason: 'scope_uncertain',
      recent: false,
    },
    {
      message: 'Send it again',
      classifier: 'UNCERTAIN',
      reason: 'scope_uncertain',
      recent: false,
    },
  ];

  for (const item of cases) {
    let calls = 0;
    const result = await simulateMindsetTurn(
      'ai_follow_up',
      item.message,
      activationUrl,
      [],
      async (systemPrompt) => {
        calls++;
        assert.equal(isScopeClassifierPrompt(systemPrompt), true);
        return { text: item.classifier, usedAI: true };
      },
      undefined,
      { conversationIsRecent: item.recent }
    );
    assert.equal(calls, 1, item.message);
    assert.equal(result.reply, '', item.message);
    assert.equal(result.createsHandoff, true, item.message);
    assert.equal(result.nextStage, 'human_handoff', item.message);
    assert.equal(result.handoffReason, item.reason, item.message);
  }
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
  assert.equal(unavailable.handoffReason, 'scope_classifier_unavailable');

  const multilingualSensitive = await simulateMindsetTurn(
    'ai_follow_up',
    'Jeg ble belastet to ganger og vil ha refusjon.',
    activationUrl,
    [],
    async (systemPrompt) => {
      assert.equal(isScopeClassifierPrompt(systemPrompt), true);
      return { text: 'HUMAN_REQUIRED', usedAI: true };
    }
  );
  assert.equal(multilingualSensitive.reply, '');
  assert.equal(multilingualSensitive.nextStage, 'human_handoff');
  assert.equal(multilingualSensitive.createsHandoff, true);
  assert.equal(multilingualSensitive.handoffReason, 'scope_human_required');

  const forbiddenCopy = await simulateMindsetTurn(
    'ai_follow_up',
    'Tell me something very specific',
    activationUrl,
    [],
    inScopeThen({
      text: "I don't want to guess. I will get Sondre to answer.",
      usedAI: true,
    })
  );
  assert.equal(forbiddenCopy.reply, '');
  assert.equal(forbiddenCopy.nextStage, 'human_handoff');
  assert.equal(forbiddenCopy.createsHandoff, true);

  const forbiddenAssistantIdentity = await simulateMindsetTurn(
    'ai_follow_up',
    'What spikes do you use?',
    activationUrl,
    [],
    inScopeThen({
      text: "I'm just an automated assistant for Athlete Mindset, so I can't help with that.",
      usedAI: true,
    })
  );
  assert.equal(forbiddenAssistantIdentity.reply, '');
  assert.equal(forbiddenAssistantIdentity.nextStage, 'human_handoff');
  assert.equal(forbiddenAssistantIdentity.createsHandoff, true);

  const forbiddenSubscriptionQuestion = await simulateMindsetTurn(
    'awaiting_feedback',
    'Tell me what comes next',
    activationUrl,
    [],
    inScopeThen({
      text: 'Glad it helped. Have you started the trial yet?',
      usedAI: true,
    })
  );
  assert.equal(forbiddenSubscriptionQuestion.reply, '');
  assert.equal(forbiddenSubscriptionQuestion.nextStage, 'human_handoff');
  assert.equal(forbiddenSubscriptionQuestion.createsHandoff, true);
});
