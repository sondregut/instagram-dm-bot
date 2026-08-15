import {
  MindsetCampaignTemplate,
  MindsetConversationStage,
  MindsetTestTurnInput,
  MindsetTestTurnResult,
} from './firebase';

function result(
  reply: string,
  nextStage: MindsetConversationStage,
  options: Partial<Pick<
    MindsetTestTurnResult,
    'quickReplies' | 'buttons' | 'createsHandoff' | 'handoffReason'
  >> = {}
): MindsetTestTurnResult {
  return {
    reply,
    additionalReplies: [],
    nextStage,
    quickReplies: [],
    buttons: options.buttons || [],
    createsHandoff: options.createsHandoff === true,
    handoffReason: options.handoffReason,
  };
}

function normalize(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\u2018\u2019\u0060\u00b4]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function usageBlockerResult(template: MindsetCampaignTemplate): MindsetTestTurnResult {
  const vault = template === 'vault_tracker_download';
  return result(
    vault ? 'What got in the way of trying Vault?' : 'What got in the way of trying your first mental rep?',
    'ai_follow_up',
    { quickReplies: [
      { title: 'Need more time', payload: 'mindset:reason_no_time' },
      { title: 'Cannot find it', payload: 'mindset:reason_navigation' },
      { title: 'Not sure it helps', payload: 'mindset:reason_unsure' },
    ] }
  );
}

function subscriptionBlockerResult(): MindsetTestTurnResult {
  return result(
    'What is the main thing holding you back from starting?',
    'awaiting_subscription_status',
    { quickReplies: [
      { title: 'Price', payload: 'mindset:objection_price' },
      { title: 'Need more time', payload: 'mindset:reason_no_time' },
      { title: 'Not convinced yet', payload: 'mindset:reason_unsure' },
    ] }
  );
}

function simulateReviewQuickReply(
  action: string,
  stage: MindsetConversationStage,
  template: MindsetCampaignTemplate
): MindsetTestTurnResult | null {
  const vault = template === 'vault_tracker_download';
  switch (action) {
    case 'downloaded':
      return result(
        vault
          ? 'awesome, excited to hear what you think about Vault'
          : 'Awesome, excited to hear what you think about it.',
        'awaiting_use_status'
      );
    case 'used':
      return result(
        'nice, glad you gave it a try!',
        'completed'
      );
    case 'rep_not_yet':
      return usageBlockerResult(template);
    case 'feedback_positive':
      return result(
        'Love that. Keep going, and let me know how the next few sessions feel.',
        'completed'
      );
    case 'feedback_unsure':
      return result('That is fair. What would you need to experience to know whether it is useful?', 'ai_follow_up');
    case 'feedback_negative':
      return result('Thanks for being honest. What felt wrong or unhelpful?', 'ai_follow_up');
    case 'offer_not_started':
      return subscriptionBlockerResult();
    case 'offer_question':
      return result('Of course. What would you like to know before deciding?', 'ai_follow_up');
    case 'objection_price':
    case 'price_objection':
      return result(
        `That makes sense. Price matters. The App Store shows the current offer. What would ${vault ? 'Vault' : 'Athlete Mindset'} need to help with for it to feel worthwhile?`,
        'ai_follow_up'
      );
    case 'price_question':
      return result(
        'The App Store shows the exact current price and any trial terms inside the app.',
        'ai_follow_up'
      );
    case 'trial_claimed':
    case 'trial_started':
      return result(
        'You are set. Want help getting the most value from your first week?',
        'trial_claimed',
        { quickReplies: [
          { title: 'Yes, help me', payload: 'mindset:onboarding_help' },
          { title: 'No, I am good', payload: 'mindset:complete' },
        ] }
      );
    case 'subscribed':
      return result(
        "Awesome! Excited to hear how you like it. Let me know what you think after you've used it a bit.",
        'subscription_claimed'
      );
    case 'onboarding_help':
      return result(vault
        ? 'What would help most: logging a session, adding poles, attaching video, or reviewing your stats?'
        : 'What would help most: building a routine, choosing a training session, or using Aomi?', 'ai_follow_up');
    case 'complete':
      return result('Perfect. Enjoy the app, and message anytime if you get stuck.', 'completed');
    case 'not_yet':
      if (['awaiting_activation', 'awaiting_use_status'].includes(stage)) return usageBlockerResult(template);
      if (['awaiting_offer_status', 'awaiting_subscription_status'].includes(stage)) return subscriptionBlockerResult();
      return result(
        vault ? 'What stopped you from downloading or opening Vault?' : 'What stopped you from downloading or opening the app?',
        'ai_follow_up',
        { quickReplies: [
          { title: 'No time yet', payload: 'mindset:reason_no_time' },
          { title: 'Link had a problem', payload: 'mindset:reason_link' },
          { title: "Not sure it's for me", payload: 'mindset:reason_unsure' },
        ] }
      );
    case 'not_interested':
      return result('No worries, thanks for letting me know.', 'completed');
    case 'problem':
      return result('I can help. What happened when you tried the link or opened the app?', 'ai_follow_up');
    case 'reason_navigation':
      return result(
        vault
          ? 'What screen are you on, and what are you trying to log in Vault?'
          : "During setup, keep going until the mental-rep preview. If you already have access, open Home and tap Today's Mental Rep. What screen are you on?",
        'awaiting_use_status'
      );
    case 'reason_link':
      return result('Thanks for telling me. What exactly happened when you tapped the link?', 'ai_follow_up');
    case 'reason_unsure':
      return result('That makes sense. What would you need to know before deciding whether it is useful for you?', 'ai_follow_up');
    case 'reason_no_time':
      return result(vault
        ? 'Understood. When would be a realistic time for you to try Vault?'
        : 'Understood. When would be a realistic time for you to try the first rep?', 'ai_follow_up');
    case 'human':
      return result('', 'human_handoff', {
        createsHandoff: true,
        handoffReason: 'human_required',
      });
    default:
      return null;
  }
}

export async function simulateReviewMindsetTurn(
  input: MindsetTestTurnInput
): Promise<MindsetTestTurnResult> {
  const message = normalize(input.message);
  if (!message) throw new Error('Enter a test message.');
  const isQuestion = message.endsWith('?');
  const vault = input.template === 'vault_tracker_download';
  const appName = vault ? 'Vault' : 'Athlete Mindset';
  const appLink = vault
    ? 'https://stavhopp.no/get?src=instagram'
    : 'https://athletemindset.app/app';

  const affirmative = /^(?:yes|yeah|yep|yup|yes i did|i did|sure did|already did|done)[.!\s]*$/
    .test(message);
  if (affirmative && input.stage === 'awaiting_download_status') {
    return result(vault
      ? 'awesome, excited to hear what you think about Vault'
      : 'Awesome, excited to hear what you think about it.', 'awaiting_use_status');
  }
  if (affirmative && input.stage === 'awaiting_use_status') {
    return result('nice, glad you gave it a try!', 'completed');
  }

  const clearlyUnrelatedLink = /\blink\b.{0,35}\b(?:video|youtube|post|reel|pole vault|spikes?|poles?)\b/.test(message)
    || /\b(?:video|youtube|post|reel|pole vault|spikes?|poles?)\b.{0,35}\blink\b/.test(message);
  if (!clearlyUnrelatedLink && (
    /\b(?:send|share|drop|give)(?:\s+(?:me\s+)?)?(?:it|that|(?:the\s+)?(?:app\s+|download\s+)?link|(?:the\s+)?app)(?:\s+(?:over\s+)?again)?\b/.test(message)
      || /\b(?:resend|re-send)(?:\s+(?:me\s+)?)?(?:it|that|the\s+(?:app\s+|download\s+)?link)?\b/.test(message)
  )) {
    return {
      ...result('here you go! hope you like it', input.stage),
      additionalReplies: [appLink],
    };
  }

  const quickReplyAction = input.quickReplyPayload?.startsWith('mindset:')
    ? input.quickReplyPayload.split(':')[1]
    : null;
  if (quickReplyAction) {
    const quickReplyResult = simulateReviewQuickReply(quickReplyAction, input.stage, input.template);
    if (quickReplyResult) return quickReplyResult;
  }

  if (/\b(refund|charged|billing|cancel (my )?subscription|unsafe|injur(?:y|ed)|crisis|depress(?:ed|ion)|eating disorder|anorexi(?:a|c)|bulimi(?:a|c)|trauma|abuse|self[- ]?harm|suicid(?:e|al)|real person|(?:talk|speak|chat) to (?:a )?(?:human|person|sondre))\b/.test(message)
      || /\b(?:need|want|looking for|seeking|require|provide|give me) (?:medical|clinical|therapy|therapeutic)\b/.test(message)
      || /\bmedical (?:help|advice|emergency|problem|issue|condition|symptoms?|support)\b/.test(message)) {
    return result(
      '',
      'human_handoff',
      { createsHandoff: true, handoffReason: 'human_required' }
    );
  }

  if (!isQuestion && (
    /\b(?:i|we)(?:'ve| have)? (?:already )?(?:subscribed|paid(?: for it)?|bought it|purchased it)\b/.test(message)
      || /\b(?:i'm|i am|we're|we are) subscribed\b/.test(message)
      || /^(?:subscribed|paid|purchased)[.!]*$/.test(message)
  )) {
    return result(
      "Awesome! Excited to hear how you like it. Let me know what you think after you've used it a bit.",
      'subscription_claimed'
    );
  }

  if (!isQuestion && (
    /\b(?:i|we)(?:'ve| have)? (?:already )?(?:started|got) (?:the )?trial\b/.test(message)
      || /\b(?:i'm|i am|we're|we are) on (?:the )?trial\b/.test(message)
      || /^(?:started (?:the )?trial|on (?:the )?trial)[.!]*$/.test(message)
  )) {
    return result(
      'You are set. Want help getting the most value from your first week?',
      'trial_claimed',
      { quickReplies: [
        { title: 'Yes, help me', payload: 'mindset:onboarding_help' },
        { title: 'No, I am good', payload: 'mindset:complete' },
      ] }
    );
  }

  if (/\b(too expensive|expensive|overpriced|cannot afford|can't afford|costs? too much|price (is )?(too )?high)\b/.test(message)) {
    return result(
      `That makes sense. Price matters. The App Store shows the current offer. What would ${appName} need to help with for it to feel worthwhile?`,
      'ai_follow_up'
    );
  }

  if (/\b(how much|what(?:'s| is) the (?:price|cost)|price|pricing|trial terms?)\b/.test(message)) {
    return result(
      'The App Store shows the exact current price and any trial terms inside the app.',
      'ai_follow_up'
    );
  }

  if (/\b(did not|didn't|was not|wasn't) (?:like|help)|\bnot (?:helpful|useful)|\b(?:bad|unhelpful)\b/.test(message)) {
    return result('Thanks for being honest. What felt wrong or unhelpful?', 'ai_follow_up');
  }

  if (/\b(?:it )?(?:helped|was helpful|was useful|felt good)|\b(?:liked|loved) it\b/.test(message)) {
    return result(
      'Love that. Keep going, and let me know how the next few sessions feel.',
      'completed'
    );
  }

  if (/\b(?:not sure|hard to tell|too early to tell|need more time to tell)\b/.test(message)) {
    return result('That is fair. What would you need to experience to know whether it is useful?', 'ai_follow_up');
  }

  if (/\b(can't|cannot|could not|couldn't) find\b|\bwhere (?:is|do i find) (?:the )?(?:first )?(?:rep|session)\b/.test(message)) {
    return result(
      vault
        ? 'What screen are you on, and what are you trying to log in Vault?'
        : "During setup, keep going until the mental-rep preview. If you already have access, open Home and tap Today's Mental Rep. What screen are you on?",
      'awaiting_use_status'
    );
  }

  if (/\b(problem|issue|error|broken|doesn't work|didn't work|can't open|cannot open|stuck)\b/.test(message)) {
    return result(
      'I can help. What happened when you tried the link or opened the app?',
      'ai_follow_up'
    );
  }

  if (/\b(?:i\s+)?(?:just\s+)?(?:did not|didn't|do not|don't|would not|wouldn't) want to\b/.test(message)
      || /\b(?:i\s+)?(?:just\s+)?(?:did not|didn't|do not|don't|would not|wouldn't) want (?:it|this|that|the app|athlete mindset)\b/.test(message)
      || /\b(?:not interested|changed my mind|not for me|no thanks|rather not|leave me alone|stop messaging me|do not message me|don't message me|unsubscribe)\b/.test(message)) {
    return result('No worries, thanks for letting me know.', 'completed');
  }

  const notYet = /\b(did not|didn't|have not|haven't|not yet|later|busy|no time|no)\b/.test(message);
  if (notYet) {
    if (['awaiting_activation', 'awaiting_use_status'].includes(input.stage)) {
      return result(
        vault ? 'What got in the way of trying Vault?' : 'What got in the way of trying your first mental rep?',
        'ai_follow_up',
        { quickReplies: [
          { title: 'Need more time', payload: 'mindset:reason_no_time' },
          { title: 'Cannot find it', payload: 'mindset:reason_navigation' },
          { title: 'Not sure it helps', payload: 'mindset:reason_unsure' },
        ] }
      );
    }
    if (['awaiting_offer_status', 'awaiting_subscription_status'].includes(input.stage)) {
      return result(
        'What is the main thing holding you back from starting?',
        'awaiting_subscription_status',
        { quickReplies: [
          { title: 'Price', payload: 'mindset:objection_price' },
          { title: 'Need more time', payload: 'mindset:reason_no_time' },
          { title: 'Not convinced yet', payload: 'mindset:reason_unsure' },
        ] }
      );
    }
    return result(
      vault ? 'What stopped you from downloading or opening Vault?' : 'What stopped you from downloading or opening the app?',
      'ai_follow_up',
      { quickReplies: [
        { title: 'No time yet', payload: 'mindset:reason_no_time' },
        { title: 'Link had a problem', payload: 'mindset:reason_link' },
        { title: "Not sure it's for me", payload: 'mindset:reason_unsure' },
      ] }
    );
  }

  if (/\b(tried|used|completed|finished|did (it|a rep)|first rep)\b/.test(message)) {
    return result(
      'nice, glad you gave it a try!',
      'completed'
    );
  }

  if (/^(?:thanks?(?:\s+(?:so much|a lot|for (?:this|that|the help|your help)))?|thank you(?:\s+(?:so much|very much|for (?:this|that|the help|your help)))?|thx|ty|cheers|appreciate it|much appreciated|got it(?:,?\s*thanks?)?)[.!\s🙏😊🙂]*$/.test(message)) {
    return result(
      'No problem! Let me know what you think.',
      input.stage
    );
  }

  if (/\b(downloaded|installed|got it|opened it)\b/.test(message)) {
    return result(
      vault
        ? 'awesome, excited to hear what you think about Vault'
        : 'Awesome, excited to hear what you think about it.',
      'awaiting_use_status'
    );
  }

  if (vault && /\b(?:what is|how does|how do i use|what does) (?:the )?(?:app|vault)(?: work| do)?\b/.test(message)) {
    return result(
      'Vault helps pole vaulters log sessions, jumps, poles, grip, steps, mid-mark, bar height, notes, and attached video, then review training trends.',
      'ai_follow_up'
    );
  }

  if (!vault && /\b(?:how does|how do i use|what does) (?:the )?(?:app|athlete mindset)(?: work| do)?\b|\bwhat is athlete mindset\b/.test(message)) {
    return result(
      'It personalizes a short mental-rep preview during setup. After access, Home has daily reps, Training has guided sessions, and Aomi offers voice or chat coaching.',
      'ai_follow_up'
    );
  }

  if (!vault && /\baomi\b/.test(message)) {
    return result(
      'Aomi is the in-app AI mental coach for voice or chat conversations about nerves, confidence, focus, goals, and competition prep. It is separate from the daily mental rep.',
      'ai_follow_up'
    );
  }

  if (!vault && /\btraining (?:tab|library)|\bguided sessions?\b|\bvisualization sessions?\b/.test(message)) {
    return result(
      'After you have access, open Training for guided visualization, resilience, recovery, breathwork, and meditation sessions with different lengths.',
      'ai_follow_up'
    );
  }

  if (!vault && /\bprogress|\bhistory|\bstreaks?|\breflections?\b/.test(message)) {
    return result(
      'Progress brings together mental reps, reflections, training sessions, Aomi conversations, streaks, goals, and competition context.',
      'ai_follow_up'
    );
  }

  if (!vault && /\btherapy|\btherapist|\bmedical care\b/.test(message)) {
    return result(
      'Athlete Mindset is a sports mental skills tool, not therapy or medical care. It focuses on performance areas like nerves, confidence, focus, and mental rehearsal.',
      'ai_follow_up'
    );
  }

  if (!vault && /\bdoes (?:this|athlete mindset|the app) (?:work|help|support)\b/.test(message)
      && /\b(?:pole vault|runner|running|football|soccer|basketball|athlete|sport)\b/.test(message)) {
    return result(
      'Athlete Mindset is designed for athletes across sports. It helps train mental skills such as nerves, confidence, focus, and preparation.',
      'ai_follow_up'
    );
  }

  return result('', 'human_handoff', {
    createsHandoff: true,
    handoffReason: 'off_topic_or_uncertain',
  });
}
