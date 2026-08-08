import {
  MindsetConversationStage,
  MindsetTestTurnInput,
  MindsetTestTurnResult,
} from './firebase';

function result(
  reply: string,
  nextStage: MindsetConversationStage,
  options: Partial<Pick<MindsetTestTurnResult, 'quickReplies' | 'buttons' | 'createsHandoff'>> = {}
): MindsetTestTurnResult {
  return {
    reply,
    nextStage,
    quickReplies: [],
    buttons: options.buttons || [],
    createsHandoff: options.createsHandoff === true,
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

function firstRepBlockerResult(): MindsetTestTurnResult {
  return result(
    'What got in the way of trying your first mental rep?',
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
  stage: MindsetConversationStage
): MindsetTestTurnResult | null {
  switch (action) {
    case 'downloaded':
      return result(
        'Awesome, excited to hear what you think about it.',
        'awaiting_use_status'
      );
    case 'used':
      return result(
        'Nice! How did that first mental rep feel?',
        'awaiting_feedback',
        { quickReplies: [
          { title: 'It helped', payload: 'mindset:feedback_positive' },
          { title: 'Not sure yet', payload: 'mindset:feedback_unsure' },
          { title: "Didn't like it", payload: 'mindset:feedback_negative' },
        ] }
      );
    case 'rep_not_yet':
      return firstRepBlockerResult();
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
        'That makes sense. Price matters. The App Store shows the current offer. What would Athlete Mindset need to help with for it to feel worthwhile?',
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
      return result('What would help most: building a routine, choosing a training session, or using Aomi?', 'ai_follow_up');
    case 'complete':
      return result('Perfect. Enjoy the app, and message anytime if you get stuck.', 'completed');
    case 'not_yet':
      if (['awaiting_activation', 'awaiting_use_status'].includes(stage)) return firstRepBlockerResult();
      if (['awaiting_offer_status', 'awaiting_subscription_status'].includes(stage)) return subscriptionBlockerResult();
      return result(
        'What stopped you from downloading or opening the app?',
        'ai_follow_up',
        { quickReplies: [
          { title: 'No time yet', payload: 'mindset:reason_no_time' },
          { title: 'Link had a problem', payload: 'mindset:reason_link' },
          { title: "Not sure it's for me", payload: 'mindset:reason_unsure' },
        ] }
      );
    case 'problem':
      return result('I can help. What happened when you tried the link or opened the app?', 'ai_follow_up');
    case 'reason_navigation':
      return result(
        "During setup, keep going until the mental-rep preview. If you already have access, open Home and tap Today's Mental Rep. What screen are you on?",
        'awaiting_use_status'
      );
    case 'reason_link':
      return result('Thanks for telling me. What exactly happened when you tapped the link?', 'ai_follow_up');
    case 'reason_unsure':
      return result('That makes sense. What would you need to know before deciding whether it is useful for you?', 'ai_follow_up');
    case 'reason_no_time':
      return result('Understood. When would be a realistic time for you to try the first rep?', 'ai_follow_up');
    case 'human':
      return result('', 'human_handoff', { createsHandoff: true });
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

  const quickReplyAction = input.quickReplyPayload?.startsWith('mindset:')
    ? input.quickReplyPayload.split(':')[1]
    : null;
  if (quickReplyAction) {
    const quickReplyResult = simulateReviewQuickReply(quickReplyAction, input.stage);
    if (quickReplyResult) return quickReplyResult;
  }

  if (/\b(refund|charged|billing|cancel (my )?subscription|unsafe|injur(?:y|ed)|crisis|depress(?:ed|ion)|eating disorder|anorexi(?:a|c)|bulimi(?:a|c)|trauma|abuse|self[- ]?harm|suicid(?:e|al)|real person|(?:talk|speak|chat) to (?:a )?(?:human|person|sondre))\b/.test(message)
      || /\b(?:need|want|looking for|seeking|require|provide|give me) (?:medical|clinical|therapy|therapeutic)\b/.test(message)
      || /\bmedical (?:help|advice|emergency|problem|issue|condition|symptoms?|support)\b/.test(message)) {
    return result(
      '',
      'human_handoff',
      { createsHandoff: true }
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
      'That makes sense. Price matters. The App Store shows the current offer. What would Athlete Mindset need to help with for it to feel worthwhile?',
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
      "During setup, keep going until the mental-rep preview. If you already have access, open Home and tap Today's Mental Rep. What screen are you on?",
      'awaiting_use_status'
    );
  }

  if (/\b(problem|issue|error|broken|doesn't work|didn't work|can't open|cannot open|stuck)\b/.test(message)) {
    return result(
      'I can help. What happened when you tried the link or opened the app?',
      'ai_follow_up'
    );
  }

  const notYet = /\b(did not|didn't|have not|haven't|not yet|later|busy|no time|no)\b/.test(message);
  if (notYet) {
    if (['awaiting_activation', 'awaiting_use_status'].includes(input.stage)) {
      return result(
        'What got in the way of trying your first mental rep?',
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
      'What stopped you from downloading or opening the app?',
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
      'Nice! How did that first mental rep feel?',
      'awaiting_feedback',
      { quickReplies: [
        { title: 'It helped', payload: 'mindset:feedback_positive' },
        { title: 'Not sure yet', payload: 'mindset:feedback_unsure' },
        { title: "Didn't like it", payload: 'mindset:feedback_negative' },
      ] }
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
      'Awesome, excited to hear what you think about it.',
      'awaiting_use_status'
    );
  }

  if (/\b(?:how does|how do i use|what does) (?:the )?(?:app|athlete mindset)(?: work| do)?\b|\bwhat is athlete mindset\b/.test(message)) {
    return result(
      'It personalizes a short mental-rep preview during setup. After access, Home has daily reps, Training has guided sessions, and Aomi offers voice or chat coaching.',
      'ai_follow_up'
    );
  }

  if (/\baomi\b/.test(message)) {
    return result(
      'Aomi is the in-app AI mental coach for voice or chat conversations about nerves, confidence, focus, goals, and competition prep. It is separate from the daily mental rep.',
      'ai_follow_up'
    );
  }

  if (/\btraining (?:tab|library)|\bguided sessions?\b|\bvisualization sessions?\b/.test(message)) {
    return result(
      'After you have access, open Training for guided visualization, resilience, recovery, breathwork, and meditation sessions with different lengths.',
      'ai_follow_up'
    );
  }

  if (/\bprogress|\bhistory|\bstreaks?|\breflections?\b/.test(message)) {
    return result(
      'Progress brings together mental reps, reflections, training sessions, Aomi conversations, streaks, goals, and competition context.',
      'ai_follow_up'
    );
  }

  if (/\btherapy|\btherapist|\bmedical care\b/.test(message)) {
    return result(
      'Athlete Mindset is a sports mental skills tool, not therapy or medical care. It focuses on performance areas like nerves, confidence, focus, and mental rehearsal.',
      'ai_follow_up'
    );
  }

  const contextualReply = /pole vault|runner|running|football|soccer|basketball|sport/.test(message)
    ? 'Athlete Mindset is designed for athletes across sports. What mental skill would you most like help training?'
    : 'I can help with Athlete Mindset. What would you most like to improve mentally in your sport?';
  return result(contextualReply, 'ai_follow_up');
}
