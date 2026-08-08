import { MINDSET_NO_CLICK_FOLLOW_UP_MESSAGE } from './mindsetFlowLogic';

export type MindsetCampaignFollowUpKey =
  | 'noClick'
  | 'downloadCheck'
  | 'useCheck'
  | 'feedbackCheck';

export interface MindsetCampaignFollowUp {
  enabled: boolean;
  delayMinutes: number;
  message: string;
}

export interface MindsetCampaignJourney {
  openingMessage: string;
  openingButtonText: string;
  linkMessage: string;
  linkButtonText: string;
  destinationUrl: string;
  followUps: Record<MindsetCampaignFollowUpKey, MindsetCampaignFollowUp>;
}

export const DEFAULT_MINDSET_CAMPAIGN_JOURNEY: MindsetCampaignJourney = {
  openingMessage: 'Click below to get the link to download Athlete Mindset!\n\nAppreciate you,\nSondre',
  openingButtonText: 'Send me the link',
  linkMessage: 'Download Athlete Mindset here:',
  linkButtonText: 'Download App',
  destinationUrl: 'https://athletemindset.app/app',
  followUps: {
    noClick: {
      enabled: true,
      delayMinutes: 30,
      message: MINDSET_NO_CLICK_FOLLOW_UP_MESSAGE,
    },
    downloadCheck: {
      enabled: true,
      delayMinutes: 30,
      message: 'Quick check, did you manage to download and open Athlete Mindset?',
    },
    useCheck: {
      enabled: true,
      delayMinutes: 45,
      message: 'hi, just curious what you think of the app so far if you’ve had a chance to try it yet',
    },
    feedbackCheck: {
      enabled: true,
      delayMinutes: 5,
      message: 'How did your first mental rep feel?',
    },
  },
};

const FOLLOW_UP_KEYS: MindsetCampaignFollowUpKey[] = [
  'noClick',
  'downloadCheck',
  'useCheck',
  'feedbackCheck',
];

function textValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function delayValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(value)
    : fallback;
}

export function normalizeMindsetCampaignJourney(value: unknown): MindsetCampaignJourney {
  const input = value && typeof value === 'object'
    ? value as Partial<MindsetCampaignJourney>
    : {};
  const inputFollowUps = input.followUps && typeof input.followUps === 'object'
    ? input.followUps as Partial<Record<MindsetCampaignFollowUpKey, Partial<MindsetCampaignFollowUp>>>
    : {};
  const followUps = {} as Record<MindsetCampaignFollowUpKey, MindsetCampaignFollowUp>;

  for (const key of FOLLOW_UP_KEYS) {
    const defaults = DEFAULT_MINDSET_CAMPAIGN_JOURNEY.followUps[key];
    const candidate = inputFollowUps[key] || {};
    followUps[key] = {
      enabled: candidate.enabled !== false,
      delayMinutes: delayValue(candidate.delayMinutes, defaults.delayMinutes),
      message: textValue(candidate.message, defaults.message),
    };
  }

  return {
    openingMessage: textValue(input.openingMessage, DEFAULT_MINDSET_CAMPAIGN_JOURNEY.openingMessage),
    openingButtonText: textValue(input.openingButtonText, DEFAULT_MINDSET_CAMPAIGN_JOURNEY.openingButtonText),
    linkMessage: textValue(input.linkMessage, DEFAULT_MINDSET_CAMPAIGN_JOURNEY.linkMessage),
    linkButtonText: textValue(input.linkButtonText, DEFAULT_MINDSET_CAMPAIGN_JOURNEY.linkButtonText),
    destinationUrl: textValue(input.destinationUrl, DEFAULT_MINDSET_CAMPAIGN_JOURNEY.destinationUrl),
    followUps,
  };
}

export function validateMindsetCampaignJourney(value: unknown): string[] {
  const journey = normalizeMindsetCampaignJourney(value);
  const errors: string[] = [];

  if (journey.openingMessage.length < 2 || journey.openingMessage.length > 500) {
    errors.push('Opening DM must be between 2 and 500 characters');
  }
  if (journey.openingButtonText.length < 2 || journey.openingButtonText.length > 20) {
    errors.push('Opening DM button must be between 2 and 20 characters');
  }
  if (journey.linkMessage.length < 2 || journey.linkMessage.length > 80) {
    errors.push('Download-link message must be between 2 and 80 characters');
  }
  if (journey.linkButtonText.length < 2 || journey.linkButtonText.length > 20) {
    errors.push('Download button must be between 2 and 20 characters');
  }

  try {
    const destination = new URL(journey.destinationUrl);
    if (destination.protocol !== 'https:' || destination.username || destination.password) {
      errors.push('App destination must be a secure HTTPS link');
    }
  } catch {
    errors.push('App destination must be a valid HTTPS link');
  }

  const editableMessages = [
    journey.openingMessage,
    journey.linkMessage,
    ...FOLLOW_UP_KEYS.map((key) => journey.followUps[key].message),
  ];
  if (editableMessages.some((message) => message.includes('—'))) {
    errors.push('Automation messages cannot contain em dashes');
  }

  for (const key of FOLLOW_UP_KEYS) {
    const followUp = journey.followUps[key];
    if (!followUp.enabled) continue;
    if (followUp.delayMinutes < 2 || followUp.delayMinutes > 1320) {
      errors.push('Follow-up timing must be between 2 minutes and 22 hours');
    }
    if (followUp.message.length < 2 || followUp.message.length > 500) {
      errors.push('Each enabled follow-up message must be between 2 and 500 characters');
    }
  }

  return Array.from(new Set(errors));
}

export function mindsetCampaignFollowUpDelayMs(followUp: MindsetCampaignFollowUp): number {
  return Math.max(2, Math.min(1320, Math.round(followUp.delayMinutes))) * 60 * 1000;
}
