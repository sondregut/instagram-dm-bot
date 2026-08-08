import {
  InstagramAccount,
  InstagramPost,
  MindsetCampaign,
  MindsetCampaignInput,
  MindsetCampaignsResult,
  MindsetConversation,
  MindsetInboxResult,
  MindsetOverview,
} from './firebase';
import { DEFAULT_MINDSET_PUBLIC_REPLY_TEXT } from './mindsetPublicReplies';
import {
  DEFAULT_MINDSET_CAMPAIGN_JOURNEY,
  normalizeMindsetCampaignJourney,
  validateMindsetCampaignJourney,
} from './mindsetJourney';

const REVIEW_CAMPAIGNS_KEY = 'athlete-mindset-review-campaigns';
const REVIEW_CONVERSATIONS_KEY = 'athlete-mindset-review-conversations-v3';
const REVIEW_MESSAGING_WINDOW_MS = 23 * 60 * 60 * 1000;
const OLD_SUBSCRIPTION_REPLY = 'You are set. Want help getting the most value from your first week?';
const OLD_SUBSCRIPTION_FEEDBACK_REPLY = 'Awesome \u2014 excited to hear how you like it. What made you decide to subscribe?';
const SUBSCRIPTION_FEEDBACK_REPLY = "Awesome! Excited to hear how you like it. Let me know what you think after you've used it a bit.";
const OLD_DOWNLOADED_REPLY = 'Great! Have you completed your first mental rep in the app yet?';
const DOWNLOADED_REPLY = 'Great! The setup personalizes a short mental-rep preview before the offer. Did you make it to the preview?';

export function isDashboardReviewMode(): boolean {
  return process.env.NODE_ENV === 'development'
    && process.env.NEXT_PUBLIC_DASHBOARD_REVIEW_MODE === 'true';
}

export const reviewAccount: InstagramAccount = {
  id: 'review-sondre-pv',
  username: 'sondre_pv',
  instagramAccountId: 'review-instagram-account',
  pageName: 'Sondre Gutormsen',
  connectionStatus: 'connected',
  aiPersonality: {
    name: 'Athlete Mindset assistant',
    description: 'Automated Instagram assistant for Athlete Mindset',
    systemPrompt: '',
    tone: 'friendly',
    goals: ['Help athletes experience their first mental rep'],
  },
  settings: {
    maxResponseLength: 200,
    collectEmail: false,
    collectPhone: false,
    autoWelcomeNewFollowers: false,
    businessHoursOnly: false,
    notifyOnNewLead: true,
    notifyOnHandoff: true,
  },
};

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

function emptyMilestones(): MindsetConversation['milestones'] {
  return {
    downloadClickedAt: null,
    activationLinkClickedAt: null,
    appOpenedAt: null,
    firstRepStartedAt: null,
    firstRepCompletedAt: null,
    paywallViewedAt: null,
    claimedTrialStartedAt: null,
    claimedSubscribedAt: null,
    trialStartedAt: null,
    subscribedAt: null,
  };
}

function reviewAutomation(
  lastUserInteractionAt: string,
  paused: boolean = false,
  pausedAt: string | null = null
): MindsetConversation['automation'] {
  const endsAt = new Date(new Date(lastUserInteractionAt).getTime() + REVIEW_MESSAGING_WINDOW_MS);
  return {
    paused,
    pausedAt,
    canReply: Date.now() < endsAt.getTime(),
    messagingWindowEndsAt: endsAt.toISOString(),
    unansweredFollowUpCount: 0,
    maxUnansweredFollowUps: 2,
    lastAutomatedFollowUpAt: null,
  };
}

function initialReviewConversations(): MindsetConversation[] {
  return [
    {
      id: 'review-helena',
      instagramUserId: 'review-user-1',
      username: 'helena.sarita',
      profilePictureUrl: 'https://randomuser.me/api/portraits/women/44.jpg',
      campaignId: 'runtime-default',
      campaignName: 'Controlled Instagram test',
      keyword: 'AMDMTEST8472',
      stage: 'ai_follow_up',
      feedbackReason: 'Price',
      history: [
        { role: 'user', content: '[Comment] AMDMTEST8472', at: minutesAgo(68) },
        { role: 'assistant', content: 'Click below to get the link to download Athlete Mindset!\n\nAppreciate you,\nSondre', at: minutesAgo(67) },
        { role: 'assistant', content: 'Click here: [Download App]', at: minutesAgo(65) },
        { role: 'assistant', content: 'Quick check, did you manage to download and open Athlete Mindset?', at: minutesAgo(60) },
        { role: 'user', content: 'Yes, opened it', at: minutesAgo(56) },
        { role: 'assistant', content: DOWNLOADED_REPLY, at: minutesAgo(55) },
        { role: 'user', content: 'Yes, completed', at: minutesAgo(28) },
        { role: 'assistant', content: 'Nice! How did that first mental rep feel?', at: minutesAgo(27) },
        { role: 'user', content: 'It helped, but what does it cost?', at: minutesAgo(12) },
        { role: 'assistant', content: 'The App Store shows the exact current price and any trial terms inside the app.', at: minutesAgo(11) },
      ],
      milestones: {
        ...emptyMilestones(),
        downloadClickedAt: minutesAgo(64),
        appOpenedAt: minutesAgo(56),
        firstRepStartedAt: minutesAgo(42),
        firstRepCompletedAt: minutesAgo(29),
        paywallViewedAt: minutesAgo(15),
      },
      pendingFollowUps: [],
      handoff: null,
      lastUserInteractionAt: minutesAgo(12),
      automation: reviewAutomation(minutesAgo(12)),
      createdAt: minutesAgo(68),
      updatedAt: minutesAgo(11),
    },
    {
      id: 'review-marcus',
      instagramUserId: 'review-user-2',
      username: 'marcus.runs',
      // Mirrors a comment-only or unavailable Meta profile: the UI must fall
      // back cleanly until Instagram grants profile access.
      profilePictureUrl: null,
      campaignId: 'runtime-default',
      campaignName: 'Controlled Instagram test',
      keyword: 'AMDMTEST8472',
      stage: 'human_handoff',
      feedbackReason: null,
      history: [
        { role: 'user', content: '[Comment] AMDMTEST8472', at: minutesAgo(44) },
        { role: 'assistant', content: 'Click below to get the link to download Athlete Mindset!\n\nAppreciate you,\nSondre', at: minutesAgo(43) },
        { role: 'user', content: 'I was charged and need to talk to a person', at: minutesAgo(7) },
      ],
      milestones: emptyMilestones(),
      pendingFollowUps: [],
      handoff: { status: 'open', reason: 'billing_request' },
      lastUserInteractionAt: minutesAgo(7),
      automation: reviewAutomation(minutesAgo(7), true, minutesAgo(6)),
      createdAt: minutesAgo(44),
      updatedAt: minutesAgo(6),
    },
    {
      id: 'review-jules',
      instagramUserId: 'review-user-3',
      username: 'jules.compete',
      profilePictureUrl: 'https://randomuser.me/api/portraits/women/68.jpg',
      campaignId: 'runtime-default',
      campaignName: 'Controlled Instagram test',
      keyword: 'AMDMTEST8472',
      stage: 'awaiting_use_status',
      feedbackReason: null,
      history: [
        { role: 'user', content: '[Comment] AMDMTEST8472', at: minutesAgo(190) },
        { role: 'assistant', content: 'Click here: [Download App]', at: minutesAgo(187) },
        { role: 'user', content: 'Downloaded and opened it', at: minutesAgo(53) },
        { role: 'assistant', content: DOWNLOADED_REPLY, at: minutesAgo(52) },
      ],
      milestones: {
        ...emptyMilestones(),
        downloadClickedAt: minutesAgo(186),
        appOpenedAt: minutesAgo(53),
      },
      pendingFollowUps: [
        { type: 'use_check', status: 'pending', dueAt: minutesAgo(-2) },
      ],
      handoff: null,
      lastUserInteractionAt: minutesAgo(53),
      automation: reviewAutomation(minutesAgo(53)),
      createdAt: minutesAgo(190),
      updatedAt: minutesAgo(52),
    },
    {
      id: 'review-nora',
      instagramUserId: 'review-user-4',
      username: 'nora.vaults',
      profilePictureUrl: 'https://randomuser.me/api/portraits/women/65.jpg',
      campaignId: 'spring-launch',
      campaignName: 'Spring launch draft preview',
      keyword: 'FOCUS',
      stage: 'subscribed',
      feedbackReason: null,
      history: [
        { role: 'user', content: '[Comment] FOCUS', at: minutesAgo(560) },
        { role: 'assistant', content: 'Click here: [Download App]', at: minutesAgo(557) },
        { role: 'user', content: 'I subscribed', at: minutesAgo(210) },
        { role: 'assistant', content: SUBSCRIPTION_FEEDBACK_REPLY, at: minutesAgo(209) },
      ],
      milestones: {
        ...emptyMilestones(),
        downloadClickedAt: minutesAgo(556),
        appOpenedAt: minutesAgo(522),
        firstRepStartedAt: minutesAgo(500),
        firstRepCompletedAt: minutesAgo(492),
        paywallViewedAt: minutesAgo(480),
        claimedTrialStartedAt: minutesAgo(470),
        claimedSubscribedAt: minutesAgo(210),
        trialStartedAt: minutesAgo(470),
        subscribedAt: minutesAgo(205),
      },
      pendingFollowUps: [],
      handoff: null,
      lastUserInteractionAt: minutesAgo(210),
      automation: reviewAutomation(minutesAgo(210)),
      createdAt: minutesAgo(560),
      updatedAt: minutesAgo(209),
    },
  ];
}

function readReviewConversations(): MindsetConversation[] {
  if (typeof window === 'undefined') return initialReviewConversations();
  const stored = window.localStorage.getItem(REVIEW_CONVERSATIONS_KEY);
  if (!stored) return initialReviewConversations();
  try {
    return (JSON.parse(stored) as MindsetConversation[]).map((conversation) => {
      return {
        ...conversation,
        history: conversation.history.map((message) => {
          if (message.role !== 'assistant') return message;
          if (
            ['subscription_claimed', 'subscribed'].includes(conversation.stage)
            && [OLD_SUBSCRIPTION_REPLY, OLD_SUBSCRIPTION_FEEDBACK_REPLY].includes(message.content)
          ) {
            return { ...message, content: SUBSCRIPTION_FEEDBACK_REPLY };
          }
          if (message.content === OLD_DOWNLOADED_REPLY) {
            return { ...message, content: DOWNLOADED_REPLY };
          }
          return message;
        }),
      };
    });
  } catch {
    return initialReviewConversations();
  }
}

function writeReviewConversations(conversations: MindsetConversation[]): void {
  window.localStorage.setItem(REVIEW_CONVERSATIONS_KEY, JSON.stringify(conversations));
}

const reviewSystemCampaign: MindsetCampaign = {
  id: 'runtime-default',
  name: 'Controlled Instagram test',
  keyword: 'AMDMTEST8472',
  postIds: [],
  postMode: 'any',
  nextPostId: null,
  nextPostActivatedAt: null,
  nextPostResolvedAt: null,
  status: 'test',
  publicReplyEnabled: true,
  publicReplyText: DEFAULT_MINDSET_PUBLIC_REPLY_TEXT,
  journey: DEFAULT_MINDSET_CAMPAIGN_JOURNEY,
  template: 'athlete_mindset_download',
  isSystem: true,
  createdAt: null,
  updatedAt: null,
};

const initialCustomCampaigns: MindsetCampaign[] = [
  {
    id: 'mindset-future-draft',
    name: 'MINDSET future launch',
    keyword: 'MINDSET',
    postIds: [],
    postMode: 'any',
    nextPostId: null,
    nextPostActivatedAt: null,
    nextPostResolvedAt: null,
    status: 'draft',
    publicReplyEnabled: true,
    publicReplyText: DEFAULT_MINDSET_PUBLIC_REPLY_TEXT,
    journey: DEFAULT_MINDSET_CAMPAIGN_JOURNEY,
    template: 'athlete_mindset_download',
    isSystem: false,
    createdAt: minutesAgo(1440),
    updatedAt: minutesAgo(90),
  },
];

function readStoredReviewCampaigns(): MindsetCampaign[] {
  if (typeof window === 'undefined') return initialCustomCampaigns;
  const stored = window.localStorage.getItem(REVIEW_CAMPAIGNS_KEY);
  if (!stored) return initialCustomCampaigns;
  try {
    return (JSON.parse(stored) as MindsetCampaign[])
      .filter((campaign) => !campaign.isSystem)
      .map((campaign) => ({
        ...campaign,
        postMode: campaign.postMode || (campaign.postIds.length > 0 ? 'specific' : 'any'),
        nextPostId: campaign.nextPostId || null,
        nextPostActivatedAt: campaign.nextPostActivatedAt || null,
        nextPostResolvedAt: campaign.nextPostResolvedAt || null,
        publicReplyEnabled: campaign.publicReplyEnabled !== false,
        publicReplyText: campaign.publicReplyText || DEFAULT_MINDSET_PUBLIC_REPLY_TEXT,
        journey: normalizeMindsetCampaignJourney(campaign.journey),
      }));
  } catch {
    return initialCustomCampaigns;
  }
}

function readReviewCampaigns(): MindsetCampaign[] {
  const customCampaigns = readStoredReviewCampaigns();
  return customCampaigns.some((campaign) => campaign.status === 'test')
    ? customCampaigns
    : [reviewSystemCampaign, ...customCampaigns];
}

export async function getReviewOverview(): Promise<MindsetOverview> {
  const conversations = readReviewConversations();
  return {
    account: {
      id: reviewAccount.id,
      username: reviewAccount.username,
      connectionStatus: reviewAccount.connectionStatus,
    },
    runtime: {
      mode: 'test',
      manychatKeywordProtected: true,
      systemKeyword: 'AMDMTEST8472',
    },
    metrics: {
      total: 24,
      active: 9,
      handoffs: 1,
      linkClicks: 18,
      appOpens: 13,
      firstReps: 8,
      paywallViews: 5,
      claimedTrials: 4,
      claimedSubscribed: 3,
      trials: 3,
      subscribed: 2,
      last24Hours: 7,
    },
    recentConversations: conversations,
    campaigns: readReviewCampaigns(),
  };
}

export async function getReviewInbox(): Promise<MindsetInboxResult> {
  return {
    conversations: readReviewConversations(),
    refreshedAt: new Date().toISOString(),
  };
}

export async function sendReviewMindsetHumanReply(
  conversationId: string,
  message: string
): Promise<void> {
  const trimmed = message.trim();
  if (!trimmed || trimmed.length > 500) {
    throw new Error('Reply must be between 1 and 500 characters.');
  }
  const conversations = readReviewConversations();
  const target = conversations.find((conversation) => conversation.id === conversationId);
  if (!target) throw new Error('Conversation not found.');
  if (!target.automation.canReply) throw new Error('The standard Instagram messaging window has closed.');

  const now = new Date().toISOString();
  writeReviewConversations(conversations.map((conversation) => conversation.id === conversationId
    ? {
      ...conversation,
      history: [
        ...conversation.history,
        { role: 'assistant', source: 'human', content: trimmed, at: now },
      ],
      handoff: {
        status: 'in_progress',
        reason: conversation.handoff?.reason || 'operator_takeover',
      },
      automation: {
        ...conversation.automation,
        paused: true,
        pausedAt: now,
      },
      updatedAt: now,
    }
    : conversation));
}

export async function setReviewMindsetAutomation(
  conversationId: string,
  paused: boolean
): Promise<void> {
  const conversations = readReviewConversations();
  if (!conversations.some((conversation) => conversation.id === conversationId)) {
    throw new Error('Conversation not found.');
  }
  const now = new Date().toISOString();
  writeReviewConversations(conversations.map((conversation) => conversation.id === conversationId
    ? {
      ...conversation,
      stage: !paused && conversation.stage === 'human_handoff'
        ? 'ai_follow_up'
        : conversation.stage,
      handoff: paused
        ? conversation.handoff || { status: 'in_progress', reason: 'operator_takeover' }
        : null,
      automation: {
        ...conversation.automation,
        paused,
        pausedAt: paused ? now : null,
      },
      updatedAt: now,
    }
    : conversation));
}

export async function getReviewCampaigns(): Promise<MindsetCampaignsResult> {
  return {
    campaigns: readReviewCampaigns(),
    runtime: {
      mode: 'test',
      manychatKeywordProtected: true,
    },
  };
}

export async function saveReviewCampaign(input: MindsetCampaignInput): Promise<MindsetCampaign> {
  const keyword = input.keyword.trim().toUpperCase();
  if (input.postMode === 'specific' && input.postIds.length === 0) {
    throw new Error('Select at least one Instagram post.');
  }
  if (input.status === 'test' && keyword === 'MINDSET') {
    throw new Error('MINDSET stays reserved for ManyChat during controlled testing.');
  }
  if (input.status === 'live') {
    throw new Error('Live activation is disabled while the bot is in test mode.');
  }
  if (input.publicReplyEnabled) {
    const publicReplies = Array.from(new Set(input.publicReplyText
      .split(/\r?\n/)
      .map((reply) => reply.trim())
      .filter(Boolean)));
    if (publicReplies.length < 1 || publicReplies.length > 5
        || publicReplies.some((reply) => reply.length < 2 || reply.length > 180)) {
      throw new Error('Add between 1 and 5 public replies, with each reply under 180 characters.');
    }
  }
  const journeyErrors = validateMindsetCampaignJourney(input.journey);
  if (journeyErrors.length > 0) {
    throw new Error(`Complete the DM journey: ${journeyErrors.join(', ')}.`);
  }
  const campaigns = readStoredReviewCampaigns();
  const existingIndex = input.id
    ? campaigns.findIndex((campaign) => campaign.id === input.id)
    : -1;
  const existing = existingIndex >= 0 ? campaigns[existingIndex] : null;
  const now = new Date().toISOString();
  const preserveNextPostState = input.postMode === 'next'
    && existing?.postMode === 'next'
    && Boolean(existing.nextPostActivatedAt);
  const activatingNextPost = input.postMode === 'next'
    && input.status === 'test'
    && !preserveNextPostState;
  const waitingForNextPost = input.postMode === 'next'
    && input.status === 'test'
    && !(preserveNextPostState && existing?.nextPostId);
  if (waitingForNextPost) {
    const otherWaitingCampaign = campaigns.find((campaign) => (
      campaign.id !== input.id
      && (campaign.status === 'test' || campaign.status === 'live')
      && campaign.postMode === 'next'
      && !campaign.nextPostId
    ));
    if (otherWaitingCampaign) {
      throw new Error(`Only one automation can wait for the next post. ${otherWaitingCampaign.name} is already waiting.`);
    }
  }
  const campaign: MindsetCampaign = {
    id: existing?.id || `review-${crypto.randomUUID()}`,
    name: input.name.trim(),
    keyword,
    postIds: input.postMode === 'specific' ? input.postIds : [],
    postMode: input.postMode,
    nextPostId: preserveNextPostState ? existing?.nextPostId || null : null,
    nextPostActivatedAt: preserveNextPostState
      ? existing?.nextPostActivatedAt || null
      : activatingNextPost ? now : null,
    nextPostResolvedAt: preserveNextPostState ? existing?.nextPostResolvedAt || null : null,
    status: input.status,
    publicReplyEnabled: input.publicReplyEnabled,
    publicReplyText: input.publicReplyText.trim(),
    journey: normalizeMindsetCampaignJourney(input.journey),
    template: 'athlete_mindset_download',
    isSystem: false,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  const nextCampaigns = existingIndex >= 0
    ? campaigns.map((item, index) => index === existingIndex ? campaign : item)
    : [...campaigns, campaign];
  window.localStorage.setItem(REVIEW_CAMPAIGNS_KEY, JSON.stringify(nextCampaigns));
  return campaign;
}

export async function getReviewPosts(): Promise<InstagramPost[]> {
  return [
    {
      id: 'review-post-1',
      mediaType: 'VIDEO',
      thumbnailUrl: 'https://picsum.photos/seed/athlete-mindset-pressure/900/900',
      caption: 'The pressure rep every athlete should practice before competition.',
      timestamp: minutesAgo(180).toString(),
      permalink: 'https://www.instagram.com/sondre_pv/',
    },
    {
      id: 'review-post-2',
      mediaType: 'CAROUSEL_ALBUM',
      mediaUrl: 'https://picsum.photos/seed/athlete-mindset-reset/900/900',
      caption: 'Three ways to reset after a bad attempt.',
      timestamp: minutesAgo(1440).toString(),
      permalink: 'https://www.instagram.com/sondre_pv/',
    },
    {
      id: 'review-post-3',
      mediaType: 'VIDEO',
      thumbnailUrl: 'https://picsum.photos/seed/athlete-mindset-confidence/900/900',
      caption: 'Confidence is trained before it is tested.',
      timestamp: minutesAgo(2880).toString(),
      permalink: 'https://www.instagram.com/sondre_pv/',
    },
    {
      id: 'review-post-4',
      mediaType: 'IMAGE',
      mediaUrl: 'https://picsum.photos/seed/athlete-mindset-rep/900/900',
      caption: 'Your next performance starts with your next mental rep.',
      timestamp: minutesAgo(4320).toString(),
      permalink: 'https://www.instagram.com/sondre_pv/',
    },
  ];
}
