import type { Conversation, MindsetConversation, MindsetInboxResult } from './firebase';

const PREVIOUS_BOT_SOURCE = 'previous_bot' as const;
const MINDSET_SOURCE = 'mindset_funnel' as const;

function timestampToIso(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const timestamp = value as { _seconds?: unknown; seconds?: unknown };
  const seconds = typeof timestamp._seconds === 'number'
    ? timestamp._seconds
    : typeof timestamp.seconds === 'number'
      ? timestamp.seconds
      : null;
  return seconds === null ? null : new Date(seconds * 1000).toISOString();
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

function latestUserTimestamp(conversation: Conversation): string | null {
  const message = [...(conversation.messages || [])]
    .reverse()
    .find((item) => item.role === 'user');
  return message ? timestampToIso(message.timestamp) : null;
}

function previousConversationToInbox(conversation: Conversation): MindsetConversation {
  const updatedAt = timestampToIso(conversation.lastMessageAt);
  return {
    id: `previous:${conversation.id}`,
    instagramUserId: conversation.instagramUserId || '',
    username: conversation.username || 'instagram_user',
    profilePictureUrl: conversation.profilePictureUrl || null,
    campaignId: conversation.currentAutomationId || null,
    campaignName: 'Earlier Instagram automation',
    keyword: '',
    stage: conversation.conversationState === 'completed' ? 'completed' : 'ai_follow_up',
    feedbackReason: null,
    history: (conversation.messages || []).map((message) => ({
      role: message.role,
      content: message.content,
      at: timestampToIso(message.timestamp),
      source: message.role === 'assistant' ? 'automation' : null,
    })),
    milestones: emptyMilestones(),
    pendingFollowUps: [],
    handoff: null,
    automation: {
      paused: true,
      pausedAt: null,
      canReply: false,
      messagingWindowEndsAt: null,
    },
    lastUserInteractionAt: latestUserTimestamp(conversation),
    createdAt: timestampToIso(conversation.createdAt),
    updatedAt,
    recordSource: PREVIOUS_BOT_SOURCE,
    previousBotState: conversation.conversationState,
    includesEarlierHistory: false,
  };
}

function timestampValue(value: string | null): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function earlierTimestamp(first: string | null, second: string | null): string | null {
  if (!first) return second;
  if (!second) return first;
  return timestampValue(first) <= timestampValue(second) ? first : second;
}

function laterTimestamp(first: string | null, second: string | null): string | null {
  if (!first) return second;
  if (!second) return first;
  return timestampValue(first) >= timestampValue(second) ? first : second;
}

function mergeHistory(
  first: MindsetConversation['history'],
  second: MindsetConversation['history']
): MindsetConversation['history'] {
  const unique = new Map<string, MindsetConversation['history'][number]>();
  for (const message of [...first, ...second]) {
    const key = `${message.role}\u0000${message.content}\u0000${message.at || ''}`;
    unique.set(key, message);
  }
  return Array.from(unique.values()).sort((left, right) =>
    (left.at || '').localeCompare(right.at || '')
  );
}

function mergePreviousHistory(
  primary: MindsetConversation,
  previous: MindsetConversation
): MindsetConversation {
  const primaryIsMindset = primary.recordSource !== PREVIOUS_BOT_SOURCE;
  return {
    ...primary,
    username: primary.username === 'instagram_user' ? previous.username : primary.username,
    profilePictureUrl: primary.profilePictureUrl || previous.profilePictureUrl,
    history: mergeHistory(primary.history, previous.history),
    createdAt: earlierTimestamp(primary.createdAt, previous.createdAt),
    updatedAt: laterTimestamp(primary.updatedAt, previous.updatedAt),
    lastUserInteractionAt: laterTimestamp(
      primary.lastUserInteractionAt,
      previous.lastUserInteractionAt
    ),
    previousBotState: primaryIsMindset
      ? primary.previousBotState || previous.previousBotState
      : previous.previousBotState || primary.previousBotState,
    includesEarlierHistory: true,
  };
}

function conversationKey(conversation: Pick<MindsetConversation, 'id' | 'instagramUserId'>): string {
  return conversation.instagramUserId
    ? `instagram:${conversation.instagramUserId}`
    : `document:${conversation.id}`;
}

export function combineMindsetInbox(
  mindsetResult: MindsetInboxResult,
  previousConversations: Conversation[],
  previousDataComplete: boolean,
  availability: { mindset: boolean; previousBot: boolean; mindsetComplete?: boolean } = {
    mindset: true,
    previousBot: true,
  }
): MindsetInboxResult {
  const combined = new Map<string, MindsetConversation>();

  for (const conversation of mindsetResult.conversations) {
    const normalized: MindsetConversation = {
      ...conversation,
      recordSource: MINDSET_SOURCE,
      previousBotState: conversation.previousBotState || null,
      includesEarlierHistory: conversation.includesEarlierHistory === true,
    };
    combined.set(conversationKey(normalized), normalized);
  }

  for (const conversation of previousConversations) {
    const previous = previousConversationToInbox(conversation);
    const key = conversationKey(previous);
    const existing = combined.get(key);
    combined.set(key, existing ? mergePreviousHistory(existing, previous) : previous);
  }

  const conversations = Array.from(combined.values()).sort((left, right) =>
    timestampValue(right.updatedAt) - timestampValue(left.updatedAt)
  );

  return {
    conversations,
    refreshedAt: new Date().toISOString(),
    summary: {
      total: conversations.length,
      mindset: conversations.filter((item) => item.recordSource === MINDSET_SOURCE).length,
      previousBotOnly: conversations.filter((item) => item.recordSource === PREVIOUS_BOT_SOURCE).length,
      mindsetDataComplete: availability.mindset && availability.mindsetComplete !== false,
      previousDataComplete,
      mindsetDataAvailable: availability.mindset,
      previousBotDataAvailable: availability.previousBot,
    },
  };
}
