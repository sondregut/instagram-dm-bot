import type {
  MindsetCampaignFollowUp,
  MindsetCampaignFollowUpKey,
  MindsetCampaignJourney,
  MindsetCampaignTemplate,
} from './firebase';

export const VAULT_RESOURCE_FOLLOW_UP_MESSAGE = `btw, I also have a few other pole vault resources if you’re interested

1:1 coaching
https://www.stavhopp.no/coaching

training programs
https://www.stavhopp.no/shop

mental training
https://www.athletemindset.app/app`;

export const DEFAULT_MINDSET_CAMPAIGN_JOURNEY: MindsetCampaignJourney = {
  openingMessage: "Click below to get the link to download Athlete Mindset!\n\nIf you don't see the button, just reply link\n\nAppreciate you,\nSondre",
  openingButtonText: 'Send me the link',
  linkMessage: 'here you go! hope you like it',
  linkButtonText: 'Download App',
  destinationUrl: 'https://apps.apple.com/app/id6757452747',
  followUps: {
    noClick: {
      enabled: true,
      delayMinutes: 8 * 60,
      message: 'hi, just curious what you think of the app so far if you’ve had a chance to try it yet',
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
    resourceOffer: {
      enabled: false,
      delayMinutes: 8 * 60,
      message: '',
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
    resourceOffer: {
      enabled: true,
      delayMinutes: 8 * 60,
      message: VAULT_RESOURCE_FOLLOW_UP_MESSAGE,
    },
  },
};

function linkOnlyJourney(name: string, destinationUrl: string): MindsetCampaignJourney {
  return {
    openingMessage: `Click below to get the ${name} App Store link!\n\nIf you don't see the button, reply link.\n\nAppreciate you,\nSondre`,
    openingButtonText: 'Send me the link',
    linkMessage: 'Here you go!',
    linkButtonText: 'Download App',
    destinationUrl,
    followUps: {
      noClick: { enabled: false, delayMinutes: 8 * 60, message: '' },
      downloadCheck: { enabled: false, delayMinutes: 30, message: '' },
      useCheck: { enabled: false, delayMinutes: 8 * 60, message: '' },
      feedbackCheck: { enabled: false, delayMinutes: 5, message: '' },
      resourceOffer: { enabled: false, delayMinutes: 8 * 60, message: '' },
    },
  };
}

export const DEFAULT_TRACKSPEED_CAMPAIGN_JOURNEY = linkOnlyJourney(
  'TrackSpeed', 'https://apps.apple.com/us/app/trackspeed-sprint-timer/id6757509163'
);
export const DEFAULT_TRACKJUMP_CAMPAIGN_JOURNEY = linkOnlyJourney(
  'TrackJump', 'https://apps.apple.com/us/app/trackjump-jump-height-rsi/id6809517672'
);

export function normalizeMindsetCampaignTemplate(value: unknown): MindsetCampaignTemplate {
  if (value === 'vault_tracker_download'
      || value === 'trackspeed_download'
      || value === 'trackjump_download') return value;
  return 'athlete_mindset_download';
}

export function defaultMindsetCampaignJourney(
  template: MindsetCampaignTemplate
): MindsetCampaignJourney {
  switch (template) {
    case 'vault_tracker_download': return DEFAULT_VAULT_CAMPAIGN_JOURNEY;
    case 'trackspeed_download': return DEFAULT_TRACKSPEED_CAMPAIGN_JOURNEY;
    case 'trackjump_download': return DEFAULT_TRACKJUMP_CAMPAIGN_JOURNEY;
    default: return DEFAULT_MINDSET_CAMPAIGN_JOURNEY;
  }
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
  'resourceOffer',
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
  fallback: MindsetCampaignFollowUp,
  disabled = false
): MindsetCampaignFollowUp {
  const message = textValue(value?.message, fallback.message);
  return {
    enabled: disabled ? false : typeof value?.enabled === 'boolean' ? value.enabled : fallback.enabled,
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
  const linkOnly = templateValue === 'trackspeed_download' || templateValue === 'trackjump_download';
  return {
    openingMessage: openingMessageValue(value?.openingMessage, defaults.openingMessage),
    openingButtonText: textValue(value?.openingButtonText, defaults.openingButtonText),
    linkMessage: linkMessageValue(value?.linkMessage, defaults.linkMessage),
    linkButtonText: textValue(value?.linkButtonText, defaults.linkButtonText),
    destinationUrl: (() => {
      const destination = textValue(value?.destinationUrl, defaults.destinationUrl);
      if (normalizeMindsetCampaignTemplate(templateValue) !== 'athlete_mindset_download') return destination;
      try {
        const url = new URL(destination);
        return url.protocol === 'https:' && !url.username && !url.password
          && ['athletemindset.app', 'www.athletemindset.app'].includes(url.hostname)
          && url.pathname.replace(/\/$/, '') === '/app'
          ? defaults.destinationUrl
          : destination;
      } catch {
        return destination;
      }
    })(),
    followUps: {
      noClick: followUpValue('noClick', followUps.noClick, defaults.followUps.noClick, linkOnly),
      downloadCheck: followUpValue('downloadCheck', followUps.downloadCheck, defaults.followUps.downloadCheck, linkOnly),
      useCheck: followUpValue('useCheck', followUps.useCheck, defaults.followUps.useCheck, linkOnly),
      feedbackCheck: followUpValue('feedbackCheck', followUps.feedbackCheck, defaults.followUps.feedbackCheck, linkOnly),
      resourceOffer: followUpValue('resourceOffer', followUps.resourceOffer, defaults.followUps.resourceOffer, linkOnly),
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
