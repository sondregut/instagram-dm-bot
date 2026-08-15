import { buildMindsetDirectAppUrl } from './mindsetFlowLogic';
import {
  MindsetCampaignJourney,
  normalizeMindsetCampaignJourney,
} from './mindsetCampaignJourney';
import {
  MindsetCampaignTemplate,
  mindsetCampaignProduct,
  normalizeMindsetCampaignTemplate,
} from './mindsetCampaignProduct';

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
  additionalMessages?: string[];
  quickReplies?: MindsetQuickReply[];
  buttons?: MindsetButton[];
  feedbackReason?: string;
  createsHandoff?: boolean;
}

export interface MindsetActionContext {
  template?: MindsetCampaignTemplate;
  journey?: MindsetCampaignJourney;
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
  _activationUrl: string,
  context: MindsetActionContext = {}
): MindsetActionPlan | null {
  const template = normalizeMindsetCampaignTemplate(context.template);
  const product = mindsetCampaignProduct(template);
  const journey = normalizeMindsetCampaignJourney(context.journey, template);
  switch (action) {
    case 'app_link_request':
      return {
        message: journey.linkMessage,
        additionalMessages: [buildMindsetDirectAppUrl(journey.destinationUrl)],
        nextStage: stage === 'awaiting_link_request' ? 'link_sent' : stage,
      };

    case 'downloaded':
      return {
        message: product.copy.downloaded,
        nextStage: 'awaiting_use_status',
      };

    case 'used':
      return {
        message: product.copy.used,
        nextStage: 'completed',
      };

    case 'rep_not_yet':
      return productBlockerPlan(product.name);

    case 'feedback_positive':
      return {
        message: 'love to hear that!',
        nextStage: 'completed',
      };

    case 'feedback_unsure':
      return {
        message: 'totally fair, appreciate you giving it a try',
        nextStage: 'completed',
      };

    case 'feedback_negative':
      return {
        message: 'thanks for being honest, appreciate the feedback',
        nextStage: 'completed',
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
        message: product.copy.priceObjection,
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
        message: product.copy.onboardingHelp,
        nextStage: 'ai_follow_up',
      };

    case 'complete':
      return {
        message: product.copy.complete,
        nextStage: 'completed',
      };

    case 'not_yet':
      if (repStages.has(stage)) return productBlockerPlan(product.name);
      if (subscriptionStages.has(stage)) return subscriptionBlockerPlan();
      return {
        message: product.copy.notYet,
        nextStage: 'ai_follow_up',
      };

    case 'not_interested':
      return {
        message: 'No worries, thanks for letting me know.',
        nextStage: 'completed',
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
        message: product.copy.navigation,
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
        message: product.copy.noTime,
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

function productBlockerPlan(productName: string): MindsetActionPlan {
  return {
    message: productName === 'Athlete Mindset'
      ? 'What got in the way of trying your first mental rep?'
      : `What got in the way of trying ${productName}?`,
    nextStage: 'ai_follow_up',
  };
}

function subscriptionBlockerPlan(): MindsetActionPlan {
  return {
    message: 'What is the main thing holding you back from starting?',
    nextStage: 'awaiting_subscription_status',
  };
}
