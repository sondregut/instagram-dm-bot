import { MINDSET_PRODUCT_KNOWLEDGE } from './mindsetProductKnowledge';

export type MindsetCampaignTemplate =
  | 'athlete_mindset_download'
  | 'vault_tracker_download';

export interface MindsetCampaignProductProfile {
  template: MindsetCampaignTemplate;
  name: string;
  shortName: string;
  scopeDescription: string;
  offTopicExamples: string;
  productKnowledge: string;
  copy: {
    downloaded: string;
    used: string;
    priceObjection: string;
    onboardingHelp: string;
    complete: string;
    notYet: string;
    navigation: string;
    noTime: string;
  };
}

const VAULT_PRODUCT_KNOWLEDGE = `
# CANONICAL VAULT PRODUCT GUIDE

## What Vault is
- Vault is an iPhone pole-vault training tracker for athletes and coaches.
- It is built specifically for pole vaulters to log training and competition sessions without interrupting practice.
- Athletes can record jumps, poles, grip height, approach steps, mid-mark, bar height, jump rating, and notes.
- Vault supports attaching video to the jump it belongs to, managing a pole library, and reviewing training and competition trends.
- Voice logging can capture jump details without typing.
- Analytics can show height progression, success-rate trends, training-versus-competition patterns, jump-quality distribution, and selected date ranges.

## Product boundaries
- The confirmed destination for this campaign is the iPhone download handoff supplied by Sondre.
- The live App Store screen is the only source for current price, billing period, trial, discount, and eligibility terms.
- Purchases, restore purchase, and subscription management happen through Apple. Never request payment information in Instagram.
- Do not infer that someone paid or started a trial from their words alone. Treat conversion as verified only when a verified app or subscription event confirms it.
- Do not ask whether they subscribed, paid, or started a trial.
- Do not invent exact navigation, controls, prices, guarantees, platform availability, or future features.
- Vault is a tracking and review tool. It does not replace a coach and this assistant must not give pole-vault technique, equipment-selection, medical, or injury advice.

## Conversation scope
- Help only with getting the Vault app, opening it, understanding its confirmed tracking features, and collecting feedback after the person tries it.
- Questions about how to pole vault, which pole or grip to use, training programming, injuries, sponsorships, or Sondre personally are outside this automation and must receive no automated reply.
- If someone is stuck inside Vault and the exact screen is unclear, ask what screen they see and what they are trying to log. Do not guess.

## Conversation privacy
- Treat the current Instagram campaign session as sealed.
- Use only this person's messages from this campaign session, its current stage, verified events for this session, and this product guide.
- Never mention, quote, summarize, compare with, or infer anything from another user or another product campaign.
`.trim();

const PROFILES: Record<MindsetCampaignTemplate, MindsetCampaignProductProfile> = {
  athlete_mindset_download: {
    template: 'athlete_mindset_download',
    name: 'Athlete Mindset',
    shortName: 'Athlete Mindset',
    scopeDescription: 'Athlete Mindset, its app link, onboarding, mental reps, Aomi, app features, navigation, the in-app App Store offer, or feedback about trying the app',
    offTopicExamples: 'pole-vault technique or equipment, general sport coaching, sponsorships, unrelated links, or social conversation',
    productKnowledge: MINDSET_PRODUCT_KNOWLEDGE,
    copy: {
      downloaded: 'Awesome, excited to hear what you think about it.',
      used: 'nice, glad you gave it a try!',
      priceObjection: 'That makes sense. Price matters. The App Store shows the current offer. What would Athlete Mindset need to help with for it to feel worthwhile?',
      onboardingHelp: 'What would help most: building a routine, choosing a training session, or using Aomi?',
      complete: 'Perfect. Enjoy the app, and message anytime if you get stuck.',
      notYet: 'What stopped you from downloading or opening the app?',
      navigation: "During setup, keep going until the mental-rep preview. If you already have access, open Home and tap Today's Mental Rep. What screen are you on?",
      noTime: 'Understood. When would be a realistic time for you to try the first rep?',
    },
  },
  vault_tracker_download: {
    template: 'vault_tracker_download',
    name: 'Vault',
    shortName: 'Vault',
    scopeDescription: 'Vault, its app link, downloading or opening the app, logging sessions or jumps, poles, grip, steps, mid-mark, attached jump videos, voice logging, app analytics, the in-app App Store offer, or feedback about trying the app',
    offTopicExamples: 'pole-vault technique, which pole or grip to use, training programming, injuries, sponsorships, unrelated links, or social conversation',
    productKnowledge: VAULT_PRODUCT_KNOWLEDGE,
    copy: {
      downloaded: 'awesome, excited to hear what you think about Vault',
      used: 'nice, glad you gave it a try!',
      priceObjection: 'That makes sense. Price matters. The App Store shows the current offer. What would Vault need to help with for it to feel worthwhile?',
      onboardingHelp: 'What would help most: logging a session, adding poles, attaching video, or reviewing your stats?',
      complete: 'Perfect. Enjoy Vault, and message if you get stuck in the app.',
      notYet: 'What stopped you from downloading or opening Vault?',
      navigation: 'What screen are you on, and what are you trying to log in Vault?',
      noTime: 'Understood. When would be a realistic time for you to try Vault?',
    },
  },
};

export function normalizeMindsetCampaignTemplate(value: unknown): MindsetCampaignTemplate {
  return value === 'vault_tracker_download'
    ? 'vault_tracker_download'
    : 'athlete_mindset_download';
}

export function mindsetCampaignProduct(
  value: unknown
): MindsetCampaignProductProfile {
  return PROFILES[normalizeMindsetCampaignTemplate(value)];
}
