import * as admin from 'firebase-admin';
import { FieldPath } from 'firebase-admin/firestore';
import * as functions from 'firebase-functions';
import { db, InstagramAccount } from '../firebase';
import { MindsetStage } from './mindsetConversationEngine';
import { generateIsolatedAIResponseWithStatus } from './ai';
import { getUserPosts, sendInstagramDM } from './instagram';
import {
  buildMindsetActivationUrl,
  DEFAULT_MINDSET_PUBLIC_REPLY_TEXT,
  isWithinMessagingWindow,
  MAX_UNANSWERED_MINDSET_FOLLOW_UPS,
  MESSAGING_WINDOW_MS,
} from './mindsetFlowLogic';
import { simulateMindsetTurn } from './mindsetSimulation';
import {
  campaignsOverlap,
  isWaitingForNextPost,
  MindsetCampaignPostMode,
  MindsetCampaignStatus,
  normalizeMindsetCampaignKeyword,
  normalizeMindsetCampaignPostMode,
  validateMindsetCampaignInput,
} from './mindsetCampaignLogic';
import {
  getStoredMindsetCampaigns,
  getActiveStoredMindsetCampaigns,
  isMindsetTargetAccount,
  MindsetCampaign,
  MINDSET_CAMPAIGNS_COLLECTION,
  MINDSET_NEXT_POST_LOCKS_COLLECTION,
  reconcileNextPostCampaigns,
  runtimeMindsetCampaign,
  shouldIncludeRuntimeMindsetCampaign,
} from './mindsetCampaigns';
import { getBotMode } from '../utils/runtimeMode';
import {
  isMindsetConversationIdentityMatch,
  isMindsetConversationRecordSelfConsistent,
  isMindsetHistoryEntryInConversation,
} from './mindsetConversationIsolation';
import { normalizeMindsetCampaignJourney } from './mindsetCampaignJourney';

const LEADS = 'mindset_leads';
const FOLLOWUPS = 'mindset_followups';
const HANDOFFS = 'mindset_handoffs';
const TERMINAL_STAGES = new Set<MindsetStage>([
  'trial_claimed',
  'subscription_claimed',
  'trial_started',
  'subscribed',
  'completed',
  'human_handoff',
]);
const MINDSET_STAGES = new Set<MindsetStage>([
  'awaiting_link_request',
  'link_sent',
  'link_clicked',
  'awaiting_download_status',
  'awaiting_activation',
  'awaiting_use_status',
  'awaiting_feedback',
  'awaiting_offer_status',
  'awaiting_subscription_status',
  'trial_claimed',
  'subscription_claimed',
  'trial_started',
  'subscribed',
  'ai_follow_up',
  'human_handoff',
  'completed',
]);

interface MindsetHistoryEntry {
  role: 'user' | 'assistant';
  content: string;
  at?: admin.firestore.Timestamp;
  source?: 'automation' | 'human';
  conversationId?: string;
}

interface MindsetLeadRecord {
  id?: string;
  accountId?: string;
  ownerUserId?: string;
  instagramUserId?: string;
  username?: string;
  profilePictureUrl?: string | null;
  campaignId?: string;
  campaignName?: string;
  triggerKeyword?: string;
  stage?: MindsetStage;
  feedbackReason?: string;
  history?: MindsetHistoryEntry[];
  downloadClickedAt?: admin.firestore.Timestamp;
  activationLinkClickedAt?: admin.firestore.Timestamp;
  appOpenedAt?: admin.firestore.Timestamp;
  firstRepStartedAt?: admin.firestore.Timestamp;
  firstRepCompletedAt?: admin.firestore.Timestamp;
  paywallViewedAt?: admin.firestore.Timestamp;
  claimedTrialStartedAt?: admin.firestore.Timestamp;
  claimedSubscribedAt?: admin.firestore.Timestamp;
  trialStartedAt?: admin.firestore.Timestamp;
  subscribedAt?: admin.firestore.Timestamp;
  trialVerifiedAt?: admin.firestore.Timestamp;
  subscriptionVerifiedAt?: admin.firestore.Timestamp;
  lastVerifiedConversionEvent?: 'trial_started' | 'subscribed';
  conversionVerifiedAt?: admin.firestore.Timestamp;
  automationPaused?: boolean;
  automationPausedAt?: admin.firestore.Timestamp;
  stageBeforeHandoff?: MindsetStage;
  unansweredFollowUpCount?: number;
  lastAutomatedFollowUpAt?: admin.firestore.Timestamp;
  lastUserInteractionAt?: admin.firestore.Timestamp;
  createdAt?: admin.firestore.Timestamp;
  updatedAt?: admin.firestore.Timestamp;
}

interface MindsetFollowUpRecord {
  leadId?: string;
  accountId?: string;
  type?: string;
  status?: string;
  dueAt?: admin.firestore.Timestamp;
}

interface MindsetHandoffRecord {
  leadId?: string;
  accountId?: string;
  status?: string;
  reason?: string;
}

function toIso(value?: admin.firestore.Timestamp): string | null {
  return value ? value.toDate().toISOString() : null;
}

function timestampMillis(value?: admin.firestore.Timestamp): number {
  return value?.toMillis() || 0;
}

function isolatedLeadFromSnapshot(
  snapshot: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot
): MindsetLeadRecord | null {
  const data = snapshot.data() as MindsetLeadRecord | undefined;
  if (!data || !isMindsetConversationRecordSelfConsistent(snapshot.id, data)) return null;
  return { ...data, id: snapshot.id };
}

function verifiedConversionTimestamp(
  lead: MindsetLeadRecord,
  event: 'trial_started' | 'subscribed'
): admin.firestore.Timestamp | undefined {
  const explicit = event === 'trial_started'
    ? lead.trialVerifiedAt
    : lead.subscriptionVerifiedAt;
  if (explicit) return explicit;

  // Compatibility for conversions recorded before the explicit verification
  // fields existed. A conversational claim never wrote this signed-event marker.
  if (lead.lastVerifiedConversionEvent === event && lead.conversionVerifiedAt) {
    return event === 'trial_started' ? lead.trialStartedAt : lead.subscribedAt;
  }
  return undefined;
}

function requireAuth(context: functions.https.CallableContext): string {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }
  return context.auth.uid;
}

async function requireOwnedMindsetAccount(
  ownerUserId: string,
  accountId: unknown
): Promise<InstagramAccount> {
  if (typeof accountId !== 'string' || !accountId.trim()) {
    throw new functions.https.HttpsError('invalid-argument', 'Account ID required');
  }

  const accountSnapshot = await db.collection('accounts').doc(accountId).get();
  if (!accountSnapshot.exists) {
    throw new functions.https.HttpsError('not-found', 'Instagram account not found');
  }

  const account = { ...accountSnapshot.data(), id: accountSnapshot.id } as InstagramAccount;
  if (account.userId !== ownerUserId) {
    throw new functions.https.HttpsError('permission-denied', 'Not your Instagram account');
  }
  if (!isMindsetTargetAccount(account)) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'The Athlete Mindset DM workspace is restricted to the configured Instagram account'
    );
  }
  return account;
}

async function requireOwnedMindsetLead(
  ownerUserId: string,
  account: InstagramAccount,
  conversationId: unknown
): Promise<{
  ref: admin.firestore.DocumentReference;
  lead: MindsetLeadRecord;
}> {
  if (typeof conversationId !== 'string' || !conversationId.trim()) {
    throw new functions.https.HttpsError('invalid-argument', 'Conversation ID required');
  }
  const ref = db.collection(LEADS).doc(conversationId.trim());
  const snapshot = await ref.get();
  if (!snapshot.exists) {
    throw new functions.https.HttpsError('not-found', 'Conversation not found');
  }
  const lead = isolatedLeadFromSnapshot(snapshot);
  if (!lead) {
    throw new functions.https.HttpsError('permission-denied', 'Not your conversation');
  }
  if (lead.ownerUserId !== ownerUserId
      || lead.accountId !== account.id
      || !lead.instagramUserId
      || !isMindsetConversationIdentityMatch(lead, {
        documentId: snapshot.id,
        accountId: account.id,
        instagramUserId: lead.instagramUserId,
        ownerUserId,
      })) {
    throw new functions.https.HttpsError('permission-denied', 'Not your conversation');
  }
  return { ref, lead };
}

async function loadOperationsData(accountId: string, ownerUserId: string) {
  const [leadSnapshot, followUpSnapshot, handoffSnapshot] = await Promise.all([
    db.collection(LEADS).where('accountId', '==', accountId).limit(500).get(),
    db.collection(FOLLOWUPS).where('accountId', '==', accountId).limit(500).get(),
    db.collection(HANDOFFS).where('accountId', '==', accountId).limit(500).get(),
  ]);

  const leads = leadSnapshot.docs
    .flatMap((doc) => {
      const lead = isolatedLeadFromSnapshot(doc);
      return lead ? [lead] : [];
    })
    .filter((lead) => (
      lead.ownerUserId === ownerUserId
      && lead.accountId === accountId
      && Boolean(lead.id)
      && isMindsetConversationRecordSelfConsistent(lead.id || '', lead)
    ))
    .sort((first, second) => timestampMillis(second.updatedAt) - timestampMillis(first.updatedAt));
  const validLeadIds = new Set(leads.flatMap((lead) => lead.id ? [lead.id] : []));

  const followUpsByLead = new Map<string, MindsetFollowUpRecord[]>();
  for (const doc of followUpSnapshot.docs) {
    const followUp = doc.data() as MindsetFollowUpRecord;
    if (!followUp.leadId
        || followUp.accountId !== accountId
        || !validLeadIds.has(followUp.leadId)) continue;
    const existing = followUpsByLead.get(followUp.leadId) || [];
    existing.push(followUp);
    followUpsByLead.set(followUp.leadId, existing);
  }

  const handoffsByLead = new Map<string, MindsetHandoffRecord>();
  for (const doc of handoffSnapshot.docs) {
    const handoff = doc.data() as MindsetHandoffRecord;
    const id = handoff.leadId || doc.id;
    if (handoff.accountId !== accountId || !validLeadIds.has(id)) continue;
    handoffsByLead.set(id, handoff);
  }

  return { leads, followUpsByLead, handoffsByLead };
}

async function loadMindsetInboxPage(
  accountId: string,
  ownerUserId: string,
  limit: number,
  startAfter?: string
) {
  let query: FirebaseFirestore.Query = db.collection(LEADS)
    .where('accountId', '==', accountId)
    .orderBy(FieldPath.documentId())
    .limit(limit);

  if (startAfter) query = query.startAfter(startAfter);

  const leadSnapshot = await query.get();
  const leads = leadSnapshot.docs
    .flatMap((doc) => {
      const lead = isolatedLeadFromSnapshot(doc);
      return lead ? [lead] : [];
    })
    .filter((lead) => (
      lead.ownerUserId === ownerUserId
      && lead.accountId === accountId
      && Boolean(lead.id)
      && isMindsetConversationRecordSelfConsistent(lead.id || '', lead)
    ));
  const leadIds = leads.flatMap((lead) => lead.id ? [lead.id] : []);
  const followUpsByLead = new Map<string, MindsetFollowUpRecord[]>();
  const handoffsByLead = new Map<string, MindsetHandoffRecord>();

  if (leadIds.length > 0) {
    const followUpChunks: string[][] = [];
    for (let index = 0; index < leadIds.length; index += 10) {
      followUpChunks.push(leadIds.slice(index, index + 10));
    }
    const [followUpSnapshots, handoffSnapshots] = await Promise.all([
      Promise.all(followUpChunks.map((chunk) => db.collection(FOLLOWUPS)
        .where('leadId', 'in', chunk)
        .get())),
      db.getAll(...leadIds.map((leadId) => db.collection(HANDOFFS).doc(leadId))),
    ]);

    for (const snapshot of followUpSnapshots) {
      for (const doc of snapshot.docs) {
        const followUp = doc.data() as MindsetFollowUpRecord;
        if (!followUp.leadId
            || followUp.accountId !== accountId
            || !leadIds.includes(followUp.leadId)) continue;
        const existing = followUpsByLead.get(followUp.leadId) || [];
        existing.push(followUp);
        followUpsByLead.set(followUp.leadId, existing);
      }
    }

    for (const snapshot of handoffSnapshots) {
      if (!snapshot.exists) continue;
      const handoff = snapshot.data() as MindsetHandoffRecord;
      const id = handoff.leadId || snapshot.id;
      if (handoff.accountId !== accountId || !leadIds.includes(id)) continue;
      handoffsByLead.set(id, handoff);
    }
  }

  return {
    leads,
    followUpsByLead,
    handoffsByLead,
    nextCursor: leadSnapshot.size === limit
      ? leadSnapshot.docs[leadSnapshot.docs.length - 1]?.id || null
      : null,
  };
}

function serializeCampaign(campaign: MindsetCampaign) {
  const postMode = normalizeMindsetCampaignPostMode(campaign);
  return {
    id: campaign.id,
    name: campaign.name,
    keyword: campaign.keyword,
    postIds: campaign.postIds || [],
    postMode,
    nextPostId: postMode === 'next' ? campaign.nextPostId || null : null,
    nextPostActivatedAt: postMode === 'next' ? toIso(campaign.nextPostActivatedAt) : null,
    nextPostResolvedAt: postMode === 'next' ? toIso(campaign.nextPostResolvedAt) : null,
    status: campaign.status,
    publicReplyEnabled: campaign.publicReplyEnabled !== false,
    publicReplyText: campaign.publicReplyText || DEFAULT_MINDSET_PUBLIC_REPLY_TEXT,
    journey: normalizeMindsetCampaignJourney(campaign.journey),
    template: campaign.template,
    isSystem: campaign.isSystem === true,
    createdAt: toIso(campaign.createdAt),
    updatedAt: toIso(campaign.updatedAt),
  };
}

function serializeLead(
  lead: MindsetLeadRecord,
  followUps: MindsetFollowUpRecord[],
  handoff?: MindsetHandoffRecord
) {
  const verifiedTrialAt = verifiedConversionTimestamp(lead, 'trial_started');
  const verifiedSubscriptionAt = verifiedConversionTimestamp(lead, 'subscribed');
  const history = (lead.history || [])
    .filter((entry) => isMindsetHistoryEntryInConversation(entry, lead.id || ''))
    .map((entry) => ({
      role: entry.role,
      content: entry.content,
      at: toIso(entry.at),
      source: entry.role === 'assistant' ? entry.source || 'automation' : null,
    }))
    .sort((first, second) => (first.at || '').localeCompare(second.at || ''));

  return {
    id: lead.id || '',
    instagramUserId: lead.instagramUserId || '',
    username: lead.username || 'instagram_user',
    profilePictureUrl: lead.profilePictureUrl || null,
    campaignId: lead.campaignId || null,
    campaignName: lead.campaignName || null,
    keyword: lead.triggerKeyword || '',
    stage: lead.stage || 'awaiting_link_request',
    feedbackReason: lead.feedbackReason || null,
    history,
    milestones: {
      downloadClickedAt: toIso(lead.downloadClickedAt),
      activationLinkClickedAt: toIso(lead.activationLinkClickedAt),
      appOpenedAt: toIso(lead.appOpenedAt),
      firstRepStartedAt: toIso(lead.firstRepStartedAt),
      firstRepCompletedAt: toIso(lead.firstRepCompletedAt),
      paywallViewedAt: toIso(lead.paywallViewedAt),
      claimedTrialStartedAt: toIso(lead.claimedTrialStartedAt),
      claimedSubscribedAt: toIso(lead.claimedSubscribedAt),
      trialStartedAt: toIso(verifiedTrialAt),
      subscribedAt: toIso(verifiedSubscriptionAt),
    },
    pendingFollowUps: followUps
      .filter((item) => (
        item.type !== 'subscription_check'
        && (item.status === 'pending' || item.status === 'processing')
      ))
      .map((item) => ({
        type: item.type || 'follow_up',
        status: item.status || 'pending',
        dueAt: toIso(item.dueAt),
      }))
      .sort((first, second) => (first.dueAt || '').localeCompare(second.dueAt || '')),
    handoff: handoff && handoff.status !== 'resolved'
      ? {
        status: handoff.status || 'open',
        reason: handoff.reason || null,
      }
      : null,
    automation: {
      paused: lead.automationPaused === true || lead.stage === 'human_handoff',
      pausedAt: toIso(lead.automationPausedAt),
      canReply: Boolean(
        lead.lastUserInteractionAt
        && isWithinMessagingWindow(lead.lastUserInteractionAt.toMillis())
      ),
      messagingWindowEndsAt: lead.lastUserInteractionAt
        ? new Date(lead.lastUserInteractionAt.toMillis() + MESSAGING_WINDOW_MS).toISOString()
        : null,
      unansweredFollowUpCount: Math.max(0, Math.floor(lead.unansweredFollowUpCount || 0)),
      maxUnansweredFollowUps: MAX_UNANSWERED_MINDSET_FOLLOW_UPS,
      lastAutomatedFollowUpAt: toIso(lead.lastAutomatedFollowUpAt),
    },
    lastUserInteractionAt: toIso(lead.lastUserInteractionAt),
    createdAt: toIso(lead.createdAt),
    updatedAt: toIso(lead.updatedAt),
  };
}

export const getMindsetOverview = functions.https.onCall(async (data, context) => {
  const ownerUserId = requireAuth(context);
  const account = await requireOwnedMindsetAccount(ownerUserId, data?.accountId);
  const [{ leads, followUpsByLead, handoffsByLead }, storedCampaigns] = await Promise.all([
    loadOperationsData(account.id, ownerUserId),
    getStoredMindsetCampaigns(account.id),
  ]);
  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;
  const ownerCampaigns = await reconcileNextPostCampaigns(
    account,
    storedCampaigns.filter((campaign) => campaign.ownerUserId === ownerUserId),
    getBotMode()
  );
  const systemCampaign = shouldIncludeRuntimeMindsetCampaign(ownerCampaigns, getBotMode())
    ? runtimeMindsetCampaign(account)
    : null;
  const campaigns = [
    ...(systemCampaign ? [systemCampaign] : []),
    ...ownerCampaigns,
  ];

  return {
    account: {
      id: account.id,
      username: account.username,
      connectionStatus: account.connectionStatus,
    },
    runtime: {
      mode: getBotMode(),
      manychatKeywordProtected: getBotMode() === 'test',
      systemKeyword: systemCampaign?.keyword || null,
    },
    metrics: {
      total: leads.length,
      active: leads.filter((lead) => lead.stage && !TERMINAL_STAGES.has(lead.stage)).length,
      handoffs: leads.filter((lead) => {
        const handoff = handoffsByLead.get(lead.id || '');
        return handoff && handoff.status !== 'resolved';
      }).length,
      linkClicks: leads.filter((lead) => lead.downloadClickedAt).length,
      appOpens: leads.filter((lead) => lead.appOpenedAt).length,
      firstReps: leads.filter((lead) => lead.firstRepStartedAt || lead.firstRepCompletedAt).length,
      paywallViews: leads.filter((lead) => lead.paywallViewedAt).length,
      claimedTrials: leads.filter((lead) => lead.claimedTrialStartedAt).length,
      claimedSubscribed: leads.filter((lead) => lead.claimedSubscribedAt).length,
      trials: leads.filter((lead) => verifiedConversionTimestamp(lead, 'trial_started')).length,
      subscribed: leads.filter((lead) => verifiedConversionTimestamp(lead, 'subscribed')).length,
      last24Hours: leads.filter((lead) => timestampMillis(lead.createdAt) >= dayAgo).length,
    },
    recentConversations: leads.slice(0, 5).map((lead) => serializeLead(
      lead,
      followUpsByLead.get(lead.id || '') || [],
      handoffsByLead.get(lead.id || '')
    )),
    campaigns: campaigns.map(serializeCampaign),
  };
});

export const getMindsetInbox = functions.https.onCall(async (data, context) => {
  const ownerUserId = requireAuth(context);
  const account = await requireOwnedMindsetAccount(ownerUserId, data?.accountId);
  const requestedLimit = typeof data?.limit === 'number' ? data.limit : 100;
  const limit = Math.min(200, Math.max(1, Math.floor(requestedLimit)));
  const startAfter = typeof data?.startAfter === 'string' && data.startAfter.trim()
    ? data.startAfter.trim()
    : undefined;
  const { leads, followUpsByLead, handoffsByLead, nextCursor } = await loadMindsetInboxPage(
    account.id,
    ownerUserId,
    limit,
    startAfter
  );

  return {
    conversations: leads.map((lead) => serializeLead(
      lead,
      followUpsByLead.get(lead.id || '') || [],
      handoffsByLead.get(lead.id || '')
    )),
    nextCursor,
    refreshedAt: new Date().toISOString(),
  };
});

export const sendMindsetHumanReplyApi = functions.https.onCall(async (data, context) => {
  const ownerUserId = requireAuth(context);
  const account = await requireOwnedMindsetAccount(ownerUserId, data?.accountId);
  const { ref, lead } = await requireOwnedMindsetLead(
    ownerUserId,
    account,
    data?.conversationId
  );
  const message = typeof data?.message === 'string' ? data.message.trim() : '';
  if (!message || message.length > 500) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Reply must be between 1 and 500 characters'
    );
  }
  if (!lead.instagramUserId || !lead.lastUserInteractionAt) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'This conversation is not eligible for a direct reply'
    );
  }
  if (!isWithinMessagingWindow(lead.lastUserInteractionAt.toMillis())) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'The standard Instagram messaging window has closed'
    );
  }

  const sent = await sendInstagramDM(
    lead.instagramUserId,
    message,
    account,
    { conversationId: ref.id }
  );
  if (!sent) {
    throw new functions.https.HttpsError(
      'unavailable',
      'Instagram did not confirm the reply was sent'
    );
  }

  const now = admin.firestore.Timestamp.now();
  const pauseUpdates: Record<string, unknown> = {
    automationPaused: true,
    automationPausedAt: now,
    history: admin.firestore.FieldValue.arrayUnion({
      role: 'assistant',
      source: 'human',
      content: message,
      at: now,
      conversationId: ref.id,
    }),
    updatedAt: now,
  };
  if (lead.stage !== 'human_handoff' && !lead.stageBeforeHandoff) {
    pauseUpdates.stageBeforeHandoff = lead.stage || 'ai_follow_up';
  }
  await Promise.all([
    ref.set(pauseUpdates, { merge: true }),
    db.collection(HANDOFFS).doc(ref.id).set({
      leadId: ref.id,
      accountId: account.id,
      username: lead.username || 'instagram_user',
      status: 'in_progress',
      updatedAt: now,
    }, { merge: true }),
  ]);

  return { success: true };
});

export const setMindsetAutomationApi = functions.https.onCall(async (data, context) => {
  const ownerUserId = requireAuth(context);
  const account = await requireOwnedMindsetAccount(ownerUserId, data?.accountId);
  const { ref, lead } = await requireOwnedMindsetLead(
    ownerUserId,
    account,
    data?.conversationId
  );
  const paused = data?.paused;
  if (typeof paused !== 'boolean') {
    throw new functions.https.HttpsError('invalid-argument', 'Paused state required');
  }

  const now = admin.firestore.Timestamp.now();
  const updates: Record<string, unknown> = {
    automationPaused: paused,
    updatedAt: now,
  };
  if (paused) {
    updates.automationPausedAt = now;
    if (lead.stage !== 'human_handoff' && !lead.stageBeforeHandoff) {
      updates.stageBeforeHandoff = lead.stage || 'ai_follow_up';
    }
  } else {
    updates.automationPausedAt = admin.firestore.FieldValue.delete();
    if (lead.stage === 'human_handoff') {
      updates.stage = lead.stageBeforeHandoff || 'ai_follow_up';
    }
    updates.stageBeforeHandoff = admin.firestore.FieldValue.delete();
  }

  await Promise.all([
    ref.set(updates, { merge: true }),
    db.collection(HANDOFFS).doc(ref.id).set({
      leadId: ref.id,
      accountId: account.id,
      status: paused ? 'in_progress' : 'resolved',
      resolvedAt: paused ? admin.firestore.FieldValue.delete() : now,
      updatedAt: now,
    }, { merge: true }),
  ]);

  return { success: true, paused };
});

export const simulateMindsetConversationApi = functions.https.onCall(async (data, context) => {
  const ownerUserId = requireAuth(context);
  const account = await requireOwnedMindsetAccount(ownerUserId, data?.accountId);
  const stage = typeof data?.stage === 'string' && MINDSET_STAGES.has(data.stage as MindsetStage)
    ? data.stage as MindsetStage
    : 'awaiting_download_status';
  const message = typeof data?.message === 'string' ? data.message.trim() : '';
  if (!message || message.length > 500) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Test message must be between 1 and 500 characters'
    );
  }
  const history = Array.isArray(data?.history)
    ? (data.history as unknown[])
      .slice(-12)
      .flatMap((entry) => {
        if (!entry || typeof entry !== 'object') return [];
        const candidate = entry as { role?: unknown; content?: unknown };
        if ((candidate.role !== 'user' && candidate.role !== 'assistant')
            || typeof candidate.content !== 'string') return [];
        return [{
          role: candidate.role as 'user' | 'assistant',
          content: candidate.content.trim().slice(0, 500),
        }];
      })
    : [];
  const quickReplyPayload = typeof data?.quickReplyPayload === 'string'
    ? data.quickReplyPayload.trim()
    : undefined;
  if (quickReplyPayload
      && !/^mindset:[a-z_]+(?::[A-Za-z0-9_-]{1,80})?$/.test(quickReplyPayload)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Invalid test quick reply payload'
    );
  }

  return simulateMindsetTurn(
    stage,
    message,
    buildMindsetActivationUrl('00000000-0000-4000-8000-000000000000'),
    history,
    async (systemPrompt, conversationHistory, userMessage) =>
      generateIsolatedAIResponseWithStatus(systemPrompt, conversationHistory, {
        maxTokens: 300,
        userMessage,
        fallbackResponse: '',
      }),
    quickReplyPayload
  );
});

export const getMindsetCampaignsApi = functions.https.onCall(async (data, context) => {
  const ownerUserId = requireAuth(context);
  const account = await requireOwnedMindsetAccount(ownerUserId, data?.accountId);
  const storedCampaigns = await getStoredMindsetCampaigns(account.id);
  const ownerCampaigns = await reconcileNextPostCampaigns(
    account,
    storedCampaigns.filter((campaign) => campaign.ownerUserId === ownerUserId),
    getBotMode()
  );
  const systemCampaign = shouldIncludeRuntimeMindsetCampaign(ownerCampaigns, getBotMode())
    ? runtimeMindsetCampaign(account)
    : null;
  const campaigns = [
    ...(systemCampaign ? [systemCampaign] : []),
    ...ownerCampaigns,
  ];

  return {
    campaigns: campaigns.map(serializeCampaign),
    runtime: {
      mode: getBotMode(),
      manychatKeywordProtected: getBotMode() === 'test',
    },
  };
});

export const saveMindsetCampaignApi = functions.https.onCall(async (data, context) => {
  const ownerUserId = requireAuth(context);
  const account = await requireOwnedMindsetAccount(ownerUserId, data?.accountId);
  const id = typeof data?.id === 'string' && data.id.trim() ? data.id.trim() : null;
  const name = typeof data?.name === 'string' ? data.name.trim() : '';
  const keyword = normalizeMindsetCampaignKeyword(
    typeof data?.keyword === 'string' ? data.keyword : ''
  );
  const requestedPostIds: string[] = Array.isArray(data?.postIds)
    ? Array.from(new Set<string>((data.postIds as unknown[])
      .filter((value: unknown): value is string => typeof value === 'string')
      .map((value: string) => value.trim())
      .filter(Boolean)))
    : [];
  const allowedPostModes: MindsetCampaignPostMode[] = ['any', 'specific', 'next'];
  if (data?.postMode !== undefined && !allowedPostModes.includes(data.postMode)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid post targeting mode');
  }
  const postMode = allowedPostModes.includes(data?.postMode)
    ? data.postMode as MindsetCampaignPostMode
    : normalizeMindsetCampaignPostMode({ postIds: requestedPostIds });
  const postIds = postMode === 'specific' ? requestedPostIds : [];
  const allowedStatuses: MindsetCampaignStatus[] = ['draft', 'test', 'live', 'paused'];
  const status = allowedStatuses.includes(data?.status)
    ? data.status as MindsetCampaignStatus
    : 'draft';
  const publicReplyEnabled = data?.publicReplyEnabled !== false;
  const publicReplyText = typeof data?.publicReplyText === 'string'
    ? data.publicReplyText.trim()
    : DEFAULT_MINDSET_PUBLIC_REPLY_TEXT;
  const journey = normalizeMindsetCampaignJourney(data?.journey);
  const mode = getBotMode();
  const validationErrors = validateMindsetCampaignInput({
    name,
    keyword,
    postIds: requestedPostIds,
    postMode,
    status,
    publicReplyEnabled,
    publicReplyText,
    journey,
  }, mode);
  if (validationErrors.length > 0) {
    throw new functions.https.HttpsError('failed-precondition', validationErrors.join('. '));
  }

  if (id === 'runtime-default') {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'The controlled system campaign cannot be edited'
    );
  }

  const campaignRef = id
    ? db.collection(MINDSET_CAMPAIGNS_COLLECTION).doc(id)
    : db.collection(MINDSET_CAMPAIGNS_COLLECTION).doc();
  let existingCampaign: MindsetCampaign | null = null;
  if (id) {
    const existingSnapshot = await campaignRef.get();
    if (!existingSnapshot.exists) {
      throw new functions.https.HttpsError('not-found', 'Campaign not found');
    }
    const existing = existingSnapshot.data() as Partial<MindsetCampaign>;
    if (existing.ownerUserId !== ownerUserId || existing.accountId !== account.id) {
      throw new functions.https.HttpsError('permission-denied', 'Not your campaign');
    }
    const existingPostIds = Array.isArray(existing.postIds) ? existing.postIds : [];
    existingCampaign = {
      ...existing,
      id: existingSnapshot.id,
      postIds: existingPostIds,
      postMode: normalizeMindsetCampaignPostMode({
        postIds: existingPostIds,
        postMode: existing.postMode,
      }),
    } as MindsetCampaign;
  }

  let nextPostId: string | undefined;
  let nextPostBaselineIds: string[] | undefined;
  let nextPostActivatedAt: admin.firestore.Timestamp | undefined;
  let nextPostResolvedAt: admin.firestore.Timestamp | undefined;
  if (postMode === 'next' && existingCampaign?.postMode === 'next') {
    nextPostId = existingCampaign.nextPostId || undefined;
    nextPostBaselineIds = Array.isArray(existingCampaign.nextPostBaselineIds)
      ? existingCampaign.nextPostBaselineIds
      : undefined;
    nextPostActivatedAt = existingCampaign.nextPostActivatedAt;
    nextPostResolvedAt = existingCampaign.nextPostResolvedAt;
  }

  if (status === 'test' || status === 'live') {
    const storedCampaigns = await getStoredMindsetCampaigns(account.id);
    const reconciledCampaigns = await reconcileNextPostCampaigns(account, storedCampaigns, mode);
    const reconciledExisting = reconciledCampaigns.find((campaign) => campaign.id === campaignRef.id);
    if (postMode === 'next' && reconciledExisting?.postMode === 'next') {
      nextPostId = reconciledExisting.nextPostId || nextPostId;
      nextPostBaselineIds = reconciledExisting.nextPostBaselineIds || nextPostBaselineIds;
      nextPostActivatedAt = reconciledExisting.nextPostActivatedAt || nextPostActivatedAt;
      nextPostResolvedAt = reconciledExisting.nextPostResolvedAt || nextPostResolvedAt;
    }
    const activeCampaigns = getActiveStoredMindsetCampaigns(reconciledCampaigns, mode).filter((campaign) =>
      campaign.id !== campaignRef.id
      && campaign.ownerUserId === ownerUserId
    );
    if (postMode === 'next' && !nextPostId) {
      const waitingNextCampaign = activeCampaigns.find((campaign) => isWaitingForNextPost(campaign));
      if (waitingNextCampaign) {
        throw new functions.https.HttpsError(
          'already-exists',
          `Only one automation can wait for the next post. ${waitingNextCampaign.name} is already waiting.`
        );
      }
    }
    const collision = activeCampaigns.find((campaign) => campaignsOverlap(
      { keyword, postIds, postMode, nextPostId },
      {
        keyword: campaign.keyword,
        postIds: campaign.postIds || [],
        postMode: campaign.postMode,
        nextPostId: campaign.nextPostId,
      }
    ));
    if (collision) {
      throw new functions.https.HttpsError(
        'already-exists',
        `This keyword and post selection overlaps with ${collision.name}`
      );
    }

    if (postMode === 'next'
        && (!nextPostActivatedAt || !Array.isArray(nextPostBaselineIds))) {
      const baselinePosts = await getUserPosts(account, 100);
      nextPostBaselineIds = baselinePosts.map((post) => post.id);
      nextPostActivatedAt = admin.firestore.Timestamp.now();
      nextPostId = undefined;
      nextPostResolvedAt = undefined;
    }
  }

  const now = admin.firestore.Timestamp.now();
  const campaign: Omit<MindsetCampaign, 'id'> = {
    ownerUserId,
    accountId: account.id,
    name,
    keyword,
    postIds,
    postMode,
    status,
    publicReplyEnabled,
    publicReplyText,
    journey,
    template: 'athlete_mindset_download',
    updatedAt: now,
    ...(id ? {} : { createdAt: now }),
  };
  const nextPostFields: FirebaseFirestore.DocumentData = postMode === 'next'
    ? {
      nextPostId: nextPostId || admin.firestore.FieldValue.delete(),
      nextPostBaselineIds: Array.isArray(nextPostBaselineIds)
        ? nextPostBaselineIds
        : admin.firestore.FieldValue.delete(),
      nextPostActivatedAt: nextPostActivatedAt || admin.firestore.FieldValue.delete(),
      nextPostResolvedAt: nextPostResolvedAt || admin.firestore.FieldValue.delete(),
    }
    : {
      nextPostId: admin.firestore.FieldValue.delete(),
      nextPostBaselineIds: admin.firestore.FieldValue.delete(),
      nextPostActivatedAt: admin.firestore.FieldValue.delete(),
      nextPostResolvedAt: admin.firestore.FieldValue.delete(),
    };
  const waitingForNextPost = (status === 'test' || status === 'live')
    && postMode === 'next'
    && !nextPostId;
  const nextPostLockRef = db.collection(MINDSET_NEXT_POST_LOCKS_COLLECTION).doc(account.id);
  await db.runTransaction(async (transaction) => {
    const lockSnapshot = await transaction.get(nextPostLockRef);
    const lock = lockSnapshot.data() as { campaignId?: string; campaignName?: string } | undefined;
    if (waitingForNextPost) {
      if (lock?.campaignId && lock.campaignId !== campaignRef.id) {
        throw new functions.https.HttpsError(
          'already-exists',
          `Only one automation can wait for the next post. ${lock.campaignName || 'Another automation'} is already waiting.`
        );
      }
      transaction.set(nextPostLockRef, {
        accountId: account.id,
        ownerUserId,
        campaignId: campaignRef.id,
        campaignName: name,
        updatedAt: now,
      });
    } else if (lock?.campaignId === campaignRef.id) {
      transaction.delete(nextPostLockRef);
    }
    transaction.set(campaignRef, { ...campaign, ...nextPostFields }, { merge: true });
  });

  const responseCampaign: MindsetCampaign = {
    id: campaignRef.id,
    ...campaign,
    ...(postMode === 'next' ? {
      nextPostId,
      nextPostBaselineIds,
      nextPostActivatedAt,
      nextPostResolvedAt,
    } : {}),
  };

  return {
    success: true,
    campaign: serializeCampaign(responseCampaign),
  };
});
