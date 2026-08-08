import type {
  MindsetCampaignFollowUp,
  MindsetCampaignFollowUpKey,
  MindsetCampaignJourney,
} from './firebase';

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
      message: 'Hey! Did you get a chance to check out Athlete Mindset yet? Would love to hear what you think.',
    },
    downloadCheck: {
      enabled: true,
      delayMinutes: 30,
      message: 'Quick check, did you manage to download and open Athlete Mindset?',
    },
    useCheck: {
      enabled: true,
      delayMinutes: 45,
      message: 'Did you get a chance to try your first mental rep?',
    },
    feedbackCheck: {
      enabled: true,
      delayMinutes: 5,
      message: 'How did your first mental rep feel?',
    },
  },
};

export const MINDSET_FOLLOW_UP_KEYS: MindsetCampaignFollowUpKey[] = [
  'noClick',
  'downloadCheck',
  'useCheck',
  'feedbackCheck',
];

function textValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function followUpValue(
  value: Partial<MindsetCampaignFollowUp> | undefined,
  fallback: MindsetCampaignFollowUp
): MindsetCampaignFollowUp {
  return {
    enabled: value?.enabled !== false,
    delayMinutes: typeof value?.delayMinutes === 'number' && Number.isFinite(value.delayMinutes)
      ? Math.round(value.delayMinutes)
      : fallback.delayMinutes,
    message: textValue(value?.message, fallback.message),
  };
}

export function normalizeMindsetCampaignJourney(value?: Partial<MindsetCampaignJourney> | null): MindsetCampaignJourney {
  const followUps = value?.followUps || {} as MindsetCampaignJourney['followUps'];
  return {
    openingMessage: textValue(value?.openingMessage, DEFAULT_MINDSET_CAMPAIGN_JOURNEY.openingMessage),
    openingButtonText: textValue(value?.openingButtonText, DEFAULT_MINDSET_CAMPAIGN_JOURNEY.openingButtonText),
    linkMessage: textValue(value?.linkMessage, DEFAULT_MINDSET_CAMPAIGN_JOURNEY.linkMessage),
    linkButtonText: textValue(value?.linkButtonText, DEFAULT_MINDSET_CAMPAIGN_JOURNEY.linkButtonText),
    destinationUrl: textValue(value?.destinationUrl, DEFAULT_MINDSET_CAMPAIGN_JOURNEY.destinationUrl),
    followUps: {
      noClick: followUpValue(followUps.noClick, DEFAULT_MINDSET_CAMPAIGN_JOURNEY.followUps.noClick),
      downloadCheck: followUpValue(followUps.downloadCheck, DEFAULT_MINDSET_CAMPAIGN_JOURNEY.followUps.downloadCheck),
      useCheck: followUpValue(followUps.useCheck, DEFAULT_MINDSET_CAMPAIGN_JOURNEY.followUps.useCheck),
      feedbackCheck: followUpValue(followUps.feedbackCheck, DEFAULT_MINDSET_CAMPAIGN_JOURNEY.followUps.feedbackCheck),
    },
  };
}

export function validateMindsetCampaignJourney(journey: MindsetCampaignJourney): string[] {
  const errors: string[] = [];
  if (journey.openingMessage.trim().length < 2 || journey.openingMessage.trim().length > 500) errors.push('Opening DM');
  if (journey.openingButtonText.trim().length < 2 || journey.openingButtonText.trim().length > 20) errors.push('Opening button');
  if (journey.linkMessage.trim().length < 2 || journey.linkMessage.trim().length > 80) errors.push('Link message');
  if (journey.linkButtonText.trim().length < 2 || journey.linkButtonText.trim().length > 20) errors.push('Link button');
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
