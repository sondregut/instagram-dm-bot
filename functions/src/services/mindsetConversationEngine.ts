export type MindsetStage =
  | 'awaiting_link_request'
  | 'link_sent'
  | 'link_clicked'
  | 'awaiting_download_status'
  | 'awaiting_activation'
  | 'awaiting_use_status'
  | 'awaiting_feedback'
  | 'awaiting_offer_status'
  | 'awaiting_subscription_status'
  | 'trial_claimed'
  | 'subscription_claimed'
  | 'trial_started'
  | 'subscribed'
  | 'ai_follow_up'
  | 'human_handoff'
  | 'completed';

export interface MindsetQuickReply {
  title: string;
  payload: string;
}

export interface MindsetButton {
  title: string;
  url: string;
}

export interface MindsetActionPlan {
  message: string;
  nextStage: MindsetStage;
  quickReplies?: MindsetQuickReply[];
  buttons?: MindsetButton[];
  feedbackReason?: string;
  createsHandoff?: boolean;
}

const repStages = new Set<MindsetStage>([
  'awaiting_activation',
  'awaiting_use_status',
]);

const subscriptionStages = new Set<MindsetStage>([
  'awaiting_offer_status',
  'awaiting_subscription_status',
]);

export function buildMindsetActionPlan(
  action: string,
  stage: MindsetStage,
  _activationUrl: string
): MindsetActionPlan | null {
  switch (action) {
    case 'downloaded':
      return {
        message: 'Great! The setup personalizes a short mental-rep preview before the offer. Did you make it to the preview?',
        nextStage: 'awaiting_use_status',
      };

    case 'used':
      return {
        message: 'Nice! How did that first mental rep feel?',
        nextStage: 'awaiting_feedback',
      };

    case 'rep_not_yet':
      return firstRepBlockerPlan();

    case 'feedback_positive':
      return {
        message: 'Love that. Keep going, and let me know how the next few sessions feel.',
        nextStage: 'completed',
      };

    case 'feedback_unsure':
      return {
        message: 'That is fair. What would you need to experience to know whether it is useful?',
        nextStage: 'ai_follow_up',
      };

    case 'feedback_negative':
      return {
        message: 'Thanks for being honest. What felt wrong or unhelpful?',
        nextStage: 'ai_follow_up',
      };

    case 'offer_not_started':
      return subscriptionBlockerPlan();

    case 'offer_question':
      return {
        message: 'Of course. What would you like to know before deciding?',
        nextStage: 'ai_follow_up',
      };

    case 'objection_price':
    case 'price_objection':
      return {
        message: 'That makes sense. Price matters. The App Store shows the current offer. What would Athlete Mindset need to help with for it to feel worthwhile?',
        nextStage: 'ai_follow_up',
        feedbackReason: 'Price',
      };

    case 'price_question':
      return {
        message: 'The App Store shows the exact current price and any trial terms inside the app.',
        nextStage: 'ai_follow_up',
      };

    case 'trial_claimed':
    case 'trial_started':
      return {
        message: 'You are set. Want help getting the most value from your first week?',
        nextStage: 'trial_claimed',
      };

    case 'subscribed':
      return {
        message: "Awesome! Excited to hear how you like it. Let me know what you think after you've used it a bit.",
        nextStage: 'subscription_claimed',
      };

    case 'onboarding_help':
      return {
        message: 'What would help most: building a routine, choosing a training session, or using Aomi?',
        nextStage: 'ai_follow_up',
      };

    case 'complete':
      return {
        message: 'Perfect. Enjoy the app, and message anytime if you get stuck.',
        nextStage: 'completed',
      };

    case 'not_yet':
      if (repStages.has(stage)) return firstRepBlockerPlan();
      if (subscriptionStages.has(stage)) return subscriptionBlockerPlan();
      return {
        message: 'What stopped you from downloading or opening the app?',
        nextStage: 'ai_follow_up',
      };

    case 'problem':
      return {
        message: 'I can help. What happened when you tried the link or opened the app?',
        nextStage: 'ai_follow_up',
      };

    case 'gratitude':
      return {
        message: 'No problem! Let me know what you think.',
        nextStage: stage,
      };

    case 'reason_navigation':
      return {
        message: "During setup, keep going until the mental-rep preview. If you already have access, open Home and tap Today's Mental Rep. What screen are you on?",
        nextStage: 'awaiting_use_status',
        feedbackReason: 'Could not find the first rep',
      };

    case 'reason_link':
      return {
        message: 'Thanks for telling me. What exactly happened when you tapped the link?',
        nextStage: 'ai_follow_up',
        feedbackReason: 'Link did not work',
      };

    case 'reason_unsure':
      return {
        message: 'That makes sense. What would you need to know before deciding whether it is useful for you?',
        nextStage: 'ai_follow_up',
        feedbackReason: 'Not sure it is for me',
      };

    case 'reason_no_time':
      return {
        message: 'Understood. When would be a realistic time for you to try the first rep?',
        nextStage: 'ai_follow_up',
        feedbackReason: 'No time yet',
      };

    case 'human':
      return {
        message: '',
        nextStage: 'human_handoff',
        createsHandoff: true,
      };

    default:
      return null;
  }
}

function firstRepBlockerPlan(): MindsetActionPlan {
  return {
    message: 'What got in the way of trying your first mental rep?',
    nextStage: 'ai_follow_up',
  };
}

function subscriptionBlockerPlan(): MindsetActionPlan {
  return {
    message: 'What is the main thing holding you back from starting?',
    nextStage: 'awaiting_subscription_status',
  };
}
