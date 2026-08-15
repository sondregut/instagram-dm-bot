import type {
  MindsetCampaignFollowUp,
  MindsetCampaignFollowUpKey,
  MindsetCampaignJourney,
  MindsetCampaignTemplate,
} from './firebase';

export const DEFAULT_MINDSET_CAMPAIGN_JOURNEY: MindsetCampaignJourney = {
  openingMessage: "Click below to get the link to download Athlete Mindset!\n\nIf you don't see the button, just reply link\n\nAppreciate you,\nSondre",
  openingButtonText: 'Send me the link',
  linkMessage: 'here you go! hope you like it',
  linkButtonText: 'Download App',
  destinationUrl: 'https://athletemindset.app/app',
  followUps: {
    noClick: {
      enabled: true,
      delayMinutes: 30,
      message: 'hi, just curious what you think of the app so far if you’ve had a chance to try it yet',
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

export const DEFAULT_VAULT_CAMPAIGN_JOURNEY: MindsetCampaignJourney = {
  openingMessage: "Click below to get the link to download Vault!\n\nIf you don't see the button, just reply link\n\nAppreciate you,\nSondre",
  openingButtonText: 'Send me the link',
  linkMessage: 'here you go! hope you like it',
  linkButtonText: 'Download App',
  destinationUrl: 'https://stavhopp.no/get?src=instagram',
  followUps: {
    noClick: {
      enabled: true,
      delayMinutes: 30,
      message: 'hi, just curious what you think of Vault so far if you’ve had a chance to try it yet',
    },
    downloadCheck: {
      enabled: true,
      delayMinutes: 30,
      message: 'Quick check, did you manage to download and open Vault?',
    },
    useCheck: {
      enabled: true,
      delayMinutes: 45,
      message: 'hi, just curious what you think of Vault so far if you’ve had a chance to try it yet',
    },
    feedbackCheck: {
      enabled: true,
      delayMinutes: 5,
      message: 'How did logging your first session in Vault feel?',
    },
  },
};

export function normalizeMindsetCampaignTemplate(value: unknown): MindsetCampaignTemplate {
  return value === 'vault_tracker_download'
    ? 'vault_tracker_download'
    : 'athlete_mindset_download';
}

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

export const MINDSET_FOLLOW_UP_KEYS: MindsetCampaignFollowUpKey[] = [
  'noClick',
  'downloadCheck',
  'useCheck',
  'feedbackCheck',
];

function textValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function openingMessageValue(value: unknown, fallback: string): string {
  const message = textValue(value, fallback).trim();
  return fallback === DEFAULT_MINDSET_CAMPAIGN_JOURNEY.openingMessage
    && LEGACY_OPENING_MESSAGES.has(message)
    ? DEFAULT_MINDSET_CAMPAIGN_JOURNEY.openingMessage
    : message;
}

function linkMessageValue(value: unknown, fallback: string): string {
  const message = textValue(value, fallback).trim();
  return fallback === DEFAULT_MINDSET_CAMPAIGN_JOURNEY.linkMessage
    && LEGACY_LINK_MESSAGES.has(message)
    ? DEFAULT_MINDSET_CAMPAIGN_JOURNEY.linkMessage
    : message;
}

function followUpValue(
  key: MindsetCampaignFollowUpKey,
  value: Partial<MindsetCampaignFollowUp> | undefined,
  fallback: MindsetCampaignFollowUp
): MindsetCampaignFollowUp {
  const message = textValue(value?.message, fallback.message);
  return {
    enabled: value?.enabled !== false,
    delayMinutes: typeof value?.delayMinutes === 'number' && Number.isFinite(value.delayMinutes)
      ? Math.round(value.delayMinutes)
      : fallback.delayMinutes,
    message: key === 'noClick' && LEGACY_NO_CLICK_MESSAGES.has(message)
      ? fallback.message
      : message,
  };
}

export function normalizeMindsetCampaignJourney(
  value?: Partial<MindsetCampaignJourney> | null,
  templateValue: unknown = 'athlete_mindset_download'
): MindsetCampaignJourney {
  const defaults = defaultMindsetCampaignJourney(normalizeMindsetCampaignTemplate(templateValue));
  const followUps = value?.followUps || {} as MindsetCampaignJourney['followUps'];
  return {
    openingMessage: openingMessageValue(value?.openingMessage, defaults.openingMessage),
    openingButtonText: textValue(value?.openingButtonText, defaults.openingButtonText),
    linkMessage: linkMessageValue(value?.linkMessage, defaults.linkMessage),
    linkButtonText: textValue(value?.linkButtonText, defaults.linkButtonText),
    destinationUrl: textValue(value?.destinationUrl, defaults.destinationUrl),
    followUps: {
      noClick: followUpValue('noClick', followUps.noClick, defaults.followUps.noClick),
      downloadCheck: followUpValue('downloadCheck', followUps.downloadCheck, defaults.followUps.downloadCheck),
      useCheck: followUpValue('useCheck', followUps.useCheck, defaults.followUps.useCheck),
      feedbackCheck: followUpValue('feedbackCheck', followUps.feedbackCheck, defaults.followUps.feedbackCheck),
    },
  };
}

export function validateMindsetCampaignJourney(journey: MindsetCampaignJourney): string[] {
  const errors: string[] = [];
  if (journey.openingMessage.trim().length < 2 || journey.openingMessage.trim().length > 500) errors.push('Opening DM');
  if (journey.openingButtonText.trim().length < 2 || journey.openingButtonText.trim().length > 20) errors.push('Opening button');
  if (journey.linkMessage.trim().length < 2 || journey.linkMessage.trim().length > 80) errors.push('Link message');
  try {
    const url = new URL(journey.destinationUrl.trim());
    if (url.protocol !== 'https:' || url.username || url.password) errors.push('Secure app link');
  } catch {
    errors.push('Secure app link');
  }
  const messages = [
    journey.openingMessage,
    journey.linkMessage,
    ...MINDSET_FOLLOW_UP_KEYS.map((key) => journey.followUps[key].message),
  ];
  if (messages.some((message) => message.includes('—'))) errors.push('No em dashes');
  MINDSET_FOLLOW_UP_KEYS.forEach((key) => {
    const followUp = journey.followUps[key];
    if (!followUp.enabled) return;
    if (followUp.delayMinutes < 2 || followUp.delayMinutes > 1320) errors.push('Follow-up timing');
    if (followUp.message.trim().length < 2 || followUp.message.trim().length > 500) errors.push('Follow-up message');
  });
  return Array.from(new Set(errors));
}

export function formatMindsetDelay(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
}
