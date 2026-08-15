import { MINDSET_NO_CLICK_FOLLOW_UP_MESSAGE } from './mindsetFlowLogic';
import {
  MindsetCampaignTemplate,
  normalizeMindsetCampaignTemplate,
} from './mindsetCampaignProduct';

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
  openingMessage: "Click below to get the link to download Athlete Mindset!\n\nIf you don't see the button, just reply link\n\nAppreciate you,\nSondre",
  openingButtonText: 'Send me the link',
  linkMessage: 'here you go! hope you like it',
  linkButtonText: 'Download App',
  destinationUrl: 'https://athletemindset.app/app',
  followUps: {
    noClick: {
      enabled: true,
      delayMinutes: 8 * 60,
      message: MINDSET_NO_CLICK_FOLLOW_UP_MESSAGE,
    },
    downloadCheck: {
      enabled: true,
      delayMinutes: 30,
      message: 'Quick check, did you manage to download and open Athlete Mindset?',
    },
    useCheck: {
      enabled: true,
      delayMinutes: 8 * 60,
      message: 'hi, just curious what you think of the app so far if you’ve had a chance to try it yet',
    },
    feedbackCheck: {
      enabled: true,
      delayMinutes: 5,
      message: 'How did your first mental rep feel?',
    },
  },
};

export const DEFAULT_VAULT_CAMPAIGN_JOURNEY: MindsetCampaignJourney = {
  openingMessage: "Click below to get the link to download Vault!\n\nIf you don't see the button, just reply link\n\nAppreciate you,\nSondre",
  openingButtonText: 'Send me the link',
  linkMessage: 'here you go! hope you like it',
  linkButtonText: 'Download App',
  destinationUrl: 'https://stavhopp.no/get?src=instagram',
  followUps: {
    noClick: {
      enabled: true,
      delayMinutes: 8 * 60,
      message: 'hi, just curious what you think of Vault so far if you’ve had a chance to try it yet',
    },
    downloadCheck: {
      enabled: true,
      delayMinutes: 30,
      message: 'Quick check, did you manage to download and open Vault?',
    },
    useCheck: {
      enabled: true,
      delayMinutes: 8 * 60,
      message: 'hi, just curious what you think of Vault so far if you’ve had a chance to try it yet',
    },
    feedbackCheck: {
      enabled: true,
      delayMinutes: 5,
      message: 'How did logging your first session in Vault feel?',
    },
  },
};

export function defaultMindsetCampaignJourney(
  template: MindsetCampaignTemplate
): MindsetCampaignJourney {
  return template === 'vault_tracker_download'
    ? DEFAULT_VAULT_CAMPAIGN_JOURNEY
    : DEFAULT_MINDSET_CAMPAIGN_JOURNEY;
}

const LEGACY_OPENING_MESSAGES = new Set([
  'Click below to get the link to download Athlete Mindset!\n\nAppreciate you,\nSondre',
]);

const LEGACY_LINK_MESSAGES = new Set([
  'Download Athlete Mindset here:',
  'Download Athlete Mindset here',
]);

const LEGACY_NO_CLICK_MESSAGES = new Set([
  'Hey! Did you get a chance to check out Athlete Mindset yet? Would love to hear what you think.',
]);

const FOLLOW_UP_KEYS: MindsetCampaignFollowUpKey[] = [
  'noClick',
  'downloadCheck',
  'useCheck',
  'feedbackCheck',
];

function textValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function openingMessageValue(value: unknown, fallback: string): string {
  const message = textValue(value, fallback);
  return fallback === DEFAULT_MINDSET_CAMPAIGN_JOURNEY.openingMessage
    && LEGACY_OPENING_MESSAGES.has(message)
    ? DEFAULT_MINDSET_CAMPAIGN_JOURNEY.openingMessage
    : message;
}

function linkMessageValue(value: unknown, fallback: string): string {
  const message = textValue(value, fallback);
  return fallback === DEFAULT_MINDSET_CAMPAIGN_JOURNEY.linkMessage
    && LEGACY_LINK_MESSAGES.has(message)
    ? DEFAULT_MINDSET_CAMPAIGN_JOURNEY.linkMessage
    : message;
}

function followUpMessageValue(
  key: MindsetCampaignFollowUpKey,
  value: unknown,
  fallback: string
): string {
  const message = textValue(value, fallback);
  return key === 'noClick' && LEGACY_NO_CLICK_MESSAGES.has(message)
    ? fallback
    : message;
}

function delayValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(value)
    : fallback;
}

export function normalizeMindsetCampaignJourney(
  value: unknown,
  templateValue: unknown = 'athlete_mindset_download'
): MindsetCampaignJourney {
  const template = normalizeMindsetCampaignTemplate(templateValue);
  const journeyDefaults = defaultMindsetCampaignJourney(template);
  const input = value && typeof value === 'object'
    ? value as Partial<MindsetCampaignJourney>
    : {};
  const inputFollowUps = input.followUps && typeof input.followUps === 'object'
    ? input.followUps as Partial<Record<MindsetCampaignFollowUpKey, Partial<MindsetCampaignFollowUp>>>
    : {};
  const followUps = {} as Record<MindsetCampaignFollowUpKey, MindsetCampaignFollowUp>;

  for (const key of FOLLOW_UP_KEYS) {
    const defaults = journeyDefaults.followUps[key];
    const candidate = inputFollowUps[key] || {};
    followUps[key] = {
      enabled: candidate.enabled !== false,
      delayMinutes: delayValue(candidate.delayMinutes, defaults.delayMinutes),
      message: followUpMessageValue(key, candidate.message, defaults.message),
    };
  }

  return {
    openingMessage: openingMessageValue(input.openingMessage, journeyDefaults.openingMessage),
    openingButtonText: textValue(input.openingButtonText, journeyDefaults.openingButtonText),
    linkMessage: linkMessageValue(input.linkMessage, journeyDefaults.linkMessage),
    linkButtonText: textValue(input.linkButtonText, journeyDefaults.linkButtonText),
    destinationUrl: textValue(input.destinationUrl, journeyDefaults.destinationUrl),
    followUps,
  };
}

export function validateMindsetCampaignJourney(
  value: unknown,
  templateValue: unknown = 'athlete_mindset_download'
): string[] {
  const journey = normalizeMindsetCampaignJourney(value, templateValue);
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
