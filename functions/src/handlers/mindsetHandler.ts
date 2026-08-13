import { randomUUID } from 'crypto';
import * as admin from 'firebase-admin';
import { db, InstagramAccount } from '../firebase';
import { generateIsolatedAIResponseWithStatus } from '../services/ai';
import { buildMindsetActionPlan, MindsetStage } from '../services/mindsetConversationEngine';
import {
  replyToComment,
  sendInstagramButtonDM,
  sendInstagramDM,
  sendInstagramPrivateReply,
} from '../services/instagram';
import { refreshMindsetLeadProfile } from '../services/mindsetProfiles';
import {
  buildMindsetActivationUrl,
  buildMindsetAppOpenUrl,
  buildMindsetAISystemPrompt,
  buildMindsetDirectAppUrl,
  buildMindsetScopeClassifierPrompt,
  buildMindsetDownloadDestination,
  chooseMindsetPublicReply,
  classifyMindsetReplyForStage,
  constrainMindsetAIReply,
  hasMindsetFollowUpCapacity,
  isMindsetConversationSessionRecent,
  isWithinMessagingWindow,
  MAX_UNANSWERED_MINDSET_FOLLOW_UPS,
  MINDSET_SCOPE_CLASSIFIER_MAX_TOKENS,
  mindsetAIControlAction,
  parseMindsetScopeDecision,
  precheckMindsetAutomationScope,
  requiresMindsetHumanHandoff,
  shouldUseMindsetAIForReplyIntent,
  shouldSuppressMindsetAutomatedReply,
} from '../services/mindsetFlowLogic';
import {
  activationTimestampField,
  isValidMindsetLeadToken,
  MindsetActivationEvent,
  MindsetConversionEvent,
  conversionTimestampField,
  conversionVerificationTimestampField,
  stageAfterActivationEvent,
  stageAfterConversionEvent,
} from '../services/mindsetTrackingLogic';
import { isMindsetModeActive } from '../utils/runtimeMode';
import {
  isMindsetAccountAllowed,
  resolveMindsetCampaignForComment,
} from '../services/mindsetCampaigns';
import {
  buildMindsetConversationId,
  isMindsetConversationIdentityMatch,
  isMindsetConversationRecordSelfConsistent,
  isMindsetFollowUpIdentityMatch,
  isMindsetHistoryEntryInConversation,
} from '../services/mindsetConversationIsolation';
import {
  mindsetCampaignFollowUpDelayMs,
  MindsetCampaignJourney,
  normalizeMindsetCampaignJourney,
} from '../services/mindsetCampaignJourney';

const LEADS = 'mindset_leads';
const COMMENT_EVENTS = 'mindset_comment_events';
const FOLLOWUPS = 'mindset_followups';
const HANDOFFS = 'mindset_handoffs';

const FOLLOW_UP_TYPES = [
  'link_reminder',
  'download_check',
  'use_check',
  'feedback_check',
  'subscription_check',
] as const;

type FollowUpType = typeof FOLLOW_UP_TYPES[number];

const CLOSED_FUNNEL_STAGES = new Set<MindsetStage>([
  'trial_claimed',
  'subscription_claimed',
  'trial_started',
  'subscribed',
  'completed',
  'human_handoff',
]);

interface MindsetLead {
  id: string;
  accountId: string;
  ownerUserId: string;
  instagramUserId: string;
  username: string;
  initialCommentId: string;
  initialMediaId: string;
  campaignId?: string;
  campaignName?: string;
  campaignJourney?: MindsetCampaignJourney;
  triggerKeyword: string;
  linkToken: string;
  stage: MindsetStage;
  lastUserInteractionAt?: admin.firestore.Timestamp;
  profilePictureUrl?: string | null;
  profilePictureUpdatedAt?: admin.firestore.Timestamp;
  profilePictureRefreshAttemptedAt?: admin.firestore.Timestamp;
  downloadClickedAt?: admin.firestore.Timestamp;
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
  automationPaused?: boolean;
  automationPausedAt?: admin.firestore.Timestamp;
  stageBeforeHandoff?: MindsetStage;
  unansweredFollowUpCount?: number;
  lastAutomatedFollowUpAt?: admin.firestore.Timestamp;
  feedbackReason?: string;
  history?: Array<{
    role: 'user' | 'assistant';
    content: string;
    at: admin.firestore.Timestamp;
    source?: 'automation' | 'human';
    conversationId?: string;
  }>;
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
}

interface MindsetCommentEvent {
  id: string;
  media: { id: string };
  from: { id: string; username: string };
  text: string;
}

interface MindsetMessageEvent {
  sender: { id: string };
  recipient?: { id: string };
  message?: {
    text?: string;
    is_echo?: boolean;
    quick_reply?: { payload: string };
    attachments?: unknown[];
  };
  postback?: { payload: string };
}

function safeDocumentId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 500);
}

function isAllowedAccount(account: InstagramAccount): boolean {
  return isMindsetAccountAllowed(account);
}

function journeyForLead(lead: Pick<MindsetLead, 'campaignJourney'>): MindsetCampaignJourney {
  return normalizeMindsetCampaignJourney(lead.campaignJourney);
}

async function claimCommentEvent(eventId: string, accountId: string): Promise<boolean> {
  const ref = db.collection(COMMENT_EVENTS).doc(safeDocumentId(`${accountId}_${eventId}`));
  const now = admin.firestore.Timestamp.now();

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data();
    const processingStartedAt = data?.processingStartedAt as admin.firestore.Timestamp | undefined;
    const isFreshProcessing = processingStartedAt &&
      now.toMillis() - processingStartedAt.toMillis() < 10 * 60 * 1000;

    if (data?.status === 'completed' || isFreshProcessing) return false;

    transaction.set(ref, {
      accountId,
      eventId,
      status: 'processing',
      processingStartedAt: now,
      updatedAt: now,
    }, { merge: true });
    return true;
  });
}

export async function handleMindsetComment(
  event: MindsetCommentEvent,
  account: InstagramAccount
): Promise<boolean> {
  if (!isAllowedAccount(account)) return false;
  const campaign = await resolveMindsetCampaignForComment(
    account,
    event.text,
    event.media.id
  );
  if (!campaign) return false;
  if (!await claimCommentEvent(event.id, account.id)) return true;

  const now = admin.firestore.Timestamp.now();
  const id = buildMindsetConversationId(account.id, event.from.id);
  const ref = db.collection(LEADS).doc(id);
  const existing = await ref.get();
  const existingLead = existing.data() as MindsetLead | undefined;
  if (existingLead && !isMindsetConversationIdentityMatch(existingLead, {
    documentId: id,
    accountId: account.id,
    instagramUserId: event.from.id,
    ownerUserId: account.userId,
  })) {
    console.error('[Mindset] Comment blocked by conversation isolation guard');
    await db.collection(COMMENT_EVENTS)
      .doc(safeDocumentId(`${account.id}_${event.id}`))
      .set({ status: 'blocked_isolation_violation', updatedAt: now }, { merge: true });
    return true;
  }
  if (existingLead && (existingLead.automationPaused || existingLead.stage === 'human_handoff')) {
    await Promise.all([
      ref.set({
        username: event.from.username,
        history: admin.firestore.FieldValue.arrayUnion({
          role: 'user',
          content: `[Comment] ${event.text.substring(0, 200)}`,
          at: now,
          conversationId: id,
        }),
        updatedAt: now,
      }, { merge: true }),
      db.collection(COMMENT_EVENTS)
        .doc(safeDocumentId(`${account.id}_${event.id}`))
        .set({
          status: 'completed',
          skippedReason: 'automation_paused',
          privateReplySent: false,
          publicReplySent: false,
          updatedAt: now,
        }, { merge: true }),
    ]);
    console.log('[Mindset] Keyword comment recorded without a reply because the conversation is human-owned');
    return true;
  }
  const linkToken = existingLead?.linkToken || randomUUID();
  const stage: MindsetStage = existingLead && CLOSED_FUNNEL_STAGES.has(existingLead.stage)
    ? existingLead.stage
    : 'awaiting_link_request';
  const campaignJourney = normalizeMindsetCampaignJourney(campaign.journey);
  const privateMessage = campaignJourney.openingMessage;

  await ref.set({
    id,
    accountId: account.id,
    ownerUserId: account.userId,
    instagramUserId: event.from.id,
    username: event.from.username,
    initialCommentId: event.id,
    initialMediaId: event.media.id,
    campaignId: campaign.id,
    campaignName: campaign.name,
    campaignJourney,
    triggerKeyword: campaign.keyword,
    linkToken,
    stage,
    unansweredFollowUpCount: 0,
    history: admin.firestore.FieldValue.arrayUnion({
      role: 'user',
      content: `[Comment] ${event.text.substring(0, 200)}`,
      at: now,
      conversationId: id,
    }),
    createdAt: existingLead?.createdAt || now,
    updatedAt: now,
  }, { merge: true });

  const privateReplySent = await sendInstagramPrivateReply(
    event.id,
    privateMessage,
    [{ title: campaignJourney.openingButtonText, payload: `mindset:send_link:${linkToken}` }],
    account
  );

  if (!privateReplySent) {
    await db.collection(COMMENT_EVENTS)
      .doc(safeDocumentId(`${account.id}_${event.id}`))
      .set({ status: 'failed', updatedAt: admin.firestore.Timestamp.now() }, { merge: true });
    throw new Error('Instagram private reply failed');
  }

  // Reply publicly only after the private message succeeded so we never claim a DM was sent when it was not.
  const publicReply = campaign.publicReplyEnabled === false
    ? null
    : constrainMindsetAIReply(
      chooseMindsetPublicReply(event.id, campaign.publicReplyText),
      220
    );
  const publicReplySent = publicReply
    ? await replyToComment(event.id, publicReply, account)
    : null;

  await Promise.all([
    ref.set({
      history: admin.firestore.FieldValue.arrayUnion({
        role: 'assistant',
        content: privateMessage,
        at: now,
        conversationId: id,
      }),
      updatedAt: admin.firestore.Timestamp.now(),
    }, { merge: true }),
    db.collection(COMMENT_EVENTS)
      .doc(safeDocumentId(`${account.id}_${event.id}`))
      .set({ status: 'completed', privateReplySent: true, publicReplySent, updatedAt: admin.firestore.Timestamp.now() }, { merge: true }),
  ]);

  return true;
}

async function scheduleFollowUp(
  lead: MindsetLead,
  type: FollowUpType,
  delayMs: number
): Promise<void> {
  if (!isMindsetConversationRecordSelfConsistent(lead.id, lead)) {
    throw new Error('Conversation isolation check failed before scheduling follow-up');
  }
  const id = safeDocumentId(`${lead.id}_${type}`);
  const now = admin.firestore.Timestamp.now();
  await db.collection(FOLLOWUPS).doc(id).set({
    id,
    leadId: lead.id,
    accountId: lead.accountId,
    type,
    status: 'pending',
    dueAt: admin.firestore.Timestamp.fromMillis(now.toMillis() + delayMs),
    createdAt: now,
    updatedAt: now,
  }, { merge: true });
}

async function cancelPendingFollowUps(
  leadIdValue: string,
  reason: string,
  types: readonly FollowUpType[] = FOLLOW_UP_TYPES
): Promise<void> {
  const now = admin.firestore.Timestamp.now();
  const refs = types.map((type) =>
    db.collection(FOLLOWUPS).doc(safeDocumentId(`${leadIdValue}_${type}`))
  );
  const snapshots = await Promise.all(refs.map((ref) => ref.get()));
  await Promise.all(snapshots
    .filter((snapshot) => snapshot.exists && snapshot.data()?.status === 'pending')
    .map((snapshot) => snapshot.ref.update({
      status: 'cancelled',
      cancelReason: reason,
      updatedAt: now,
    })));
}

async function updateLeadHistory(
  ref: FirebaseFirestore.DocumentReference,
  role: 'user' | 'assistant',
  content: string,
  extra: Record<string, unknown> = {},
  source: 'automation' | 'human' = 'automation'
): Promise<void> {
  const now = admin.firestore.Timestamp.now();
  const historyEntry = role === 'assistant'
    ? { role, content: content.substring(0, 500), at: now, source, conversationId: ref.id }
    : { role, content: content.substring(0, 500), at: now, conversationId: ref.id };
  await ref.set({
    ...extra,
    history: admin.firestore.FieldValue.arrayUnion(historyEntry),
    updatedAt: now,
  }, { merge: true });
}

async function createSilentMindsetHandoff(
  ref: FirebaseFirestore.DocumentReference,
  lead: MindsetLead,
  reason: string
): Promise<void> {
  const now = admin.firestore.Timestamp.now();
  await Promise.all([
    ref.set({
      stage: 'human_handoff',
      automationPaused: true,
      automationPausedAt: now,
      stageBeforeHandoff: lead.stage,
      updatedAt: now,
    }, { merge: true }),
    db.collection(HANDOFFS).doc(lead.id).set({
      leadId: lead.id,
      accountId: lead.accountId,
      username: lead.username,
      status: 'open',
      reason,
      createdAt: now,
      updatedAt: now,
    }, { merge: true }),
    cancelPendingFollowUps(lead.id, `silent_handoff_${reason}`),
  ]);
}

async function reserveUnansweredFollowUp(
  ref: FirebaseFirestore.DocumentReference,
  expectedLastUserInteractionAt: admin.firestore.Timestamp,
  expectedAccountId: string,
  expectedInstagramUserId: string,
  expectedOwnerUserId: string
): Promise<{ allowed: boolean; reason?: 'user_replied' | 'paused' | 'terminal' | 'limit' | 'isolation' }> {
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = snapshot.data() as MindsetLead | undefined;
    if (!current) return { allowed: false, reason: 'terminal' as const };
    if (!isMindsetConversationIdentityMatch(current, {
      documentId: ref.id,
      accountId: expectedAccountId,
      instagramUserId: expectedInstagramUserId,
      ownerUserId: expectedOwnerUserId,
    })) {
      return { allowed: false, reason: 'isolation' as const };
    }
    if (current.automationPaused) return { allowed: false, reason: 'paused' as const };
    if (CLOSED_FUNNEL_STAGES.has(current.stage)) {
      return { allowed: false, reason: 'terminal' as const };
    }
    if (!current.lastUserInteractionAt
        || current.lastUserInteractionAt.toMillis() !== expectedLastUserInteractionAt.toMillis()) {
      return { allowed: false, reason: 'user_replied' as const };
    }
    if (!hasMindsetFollowUpCapacity(current.unansweredFollowUpCount)) {
      return { allowed: false, reason: 'limit' as const };
    }

    const count = typeof current.unansweredFollowUpCount === 'number'
      && Number.isFinite(current.unansweredFollowUpCount)
      ? Math.max(0, Math.floor(current.unansweredFollowUpCount))
      : 0;
    const now = admin.firestore.Timestamp.now();
    transaction.set(ref, {
      unansweredFollowUpCount: count + 1,
      lastAutomatedFollowUpAt: now,
      updatedAt: now,
    }, { merge: true });
    return { allowed: true };
  });
}

async function handleMindsetAction(
  action: string,
  senderId: string,
  lead: MindsetLead,
  ref: FirebaseFirestore.DocumentReference,
  account: InstagramAccount,
  token?: string
): Promise<void> {
  const now = admin.firestore.Timestamp.now();

  if (action === 'send_link') {
    if (!token || token !== lead.linkToken) throw new Error('Invalid link-request token');
    const journey = journeyForLead(lead);
    const nextStage = CLOSED_FUNNEL_STAGES.has(lead.stage) ? lead.stage : 'link_sent';
    const messages = [
      journey.linkMessage,
      buildMindsetDirectAppUrl(journey.destinationUrl),
    ];
    for (let index = 0; index < messages.length; index++) {
      const message = messages[index];
      const sent = await sendInstagramDM(senderId, message, account, { conversationId: ref.id });
      if (!sent) throw new Error(`Download link message ${index + 1} failed`);
      await updateLeadHistory(
        ref,
        'assistant',
        message,
        index === messages.length - 1
          ? { stage: nextStage, lastUserInteractionAt: now }
          : {}
      );
    }
    if (!CLOSED_FUNNEL_STAGES.has(lead.stage) && journey.followUps.noClick.enabled) {
      const updated = { ...lead, stage: nextStage, lastUserInteractionAt: now };
      await scheduleFollowUp(
        updated,
        'link_reminder',
        mindsetCampaignFollowUpDelayMs(journey.followUps.noClick)
      );
    }
    return;
  }

  if (CLOSED_FUNNEL_STAGES.has(lead.stage)
      && !['app_link_request', 'trial_claimed', 'trial_started', 'human', 'subscribed'].includes(action)) {
    console.log(`[Mindset] Ignoring stale funnel action in ${lead.stage}`);
    return;
  }

  const plan = buildMindsetActionPlan(
    action,
    lead.stage,
    buildMindsetActivationUrl(lead.linkToken)
  );
  if (plan) {
    if (plan.createsHandoff) {
      await createSilentMindsetHandoff(ref, lead, 'user_requested_or_sensitive');
      return;
    }

    const updates: Record<string, unknown> = {
      stage: plan.nextStage,
      lastUserInteractionAt: now,
    };
    if (plan.feedbackReason) updates.feedbackReason = plan.feedbackReason;
    if (action === 'trial_claimed' || action === 'trial_started') updates.claimedTrialStartedAt = now;
    if (action === 'subscribed') updates.claimedSubscribedAt = now;

    if (plan.buttons) {
      const sent = await sendInstagramButtonDM(senderId, plan.message, plan.buttons, account);
      if (!sent) throw new Error(`Mindset action ${action} failed to send`);
      await updateLeadHistory(ref, 'assistant', plan.message, updates);
    } else {
      const messages = [plan.message, ...(plan.additionalMessages || [])].filter(Boolean);
      for (let index = 0; index < messages.length; index++) {
        const message = messages[index];
        const sent = await sendInstagramDM(senderId, message, account, { conversationId: ref.id });
        if (!sent) throw new Error(`Mindset action ${action} message ${index + 1} failed to send`);
        await updateLeadHistory(
          ref,
          'assistant',
          message,
          index === messages.length - 1 ? updates : {}
        );
      }
    }

    if (plan.nextStage === 'completed') {
      await cancelPendingFollowUps(lead.id, 'conversation_completed');
    } else if (action === 'trial_claimed' || action === 'trial_started' || action === 'subscribed') {
      await cancelPendingFollowUps(lead.id, `manual_${action}`);
    } else if (action === 'downloaded') {
      await cancelPendingFollowUps(lead.id, 'download_confirmed', ['link_reminder', 'download_check']);
    } else if (action === 'used' || action.startsWith('feedback_')) {
      await cancelPendingFollowUps(lead.id, 'rep_status_confirmed', ['use_check', 'feedback_check']);
    } else if (action.startsWith('offer_') || action === 'price_objection' || action === 'price_question') {
      await cancelPendingFollowUps(lead.id, 'offer_status_answered', ['subscription_check']);
    }

    return;
  }

  console.warn(`[Mindset] Ignoring unknown action: ${action.slice(0, 80)}`);
}

export async function handleMindsetMessage(
  event: MindsetMessageEvent,
  account: InstagramAccount
): Promise<boolean> {
  if (!isAllowedAccount(account) || event.message?.is_echo) return false;
  if (!event.recipient || event.recipient.id !== account.instagramAccountId) {
    console.error('[Mindset] Message blocked because the webhook recipient did not match the account');
    return true;
  }

  const senderId = event.sender.id;
  const ref = db.collection(LEADS).doc(buildMindsetConversationId(account.id, senderId));
  const snapshot = await ref.get();
  if (!snapshot.exists) return false;

  const lead = snapshot.data() as MindsetLead;
  if (!isMindsetConversationIdentityMatch(lead, {
    documentId: ref.id,
    accountId: account.id,
    instagramUserId: senderId,
    ownerUserId: account.userId,
  })) {
    console.error('[Mindset] Message blocked by conversation isolation guard');
    return true;
  }
  const payload = event.message?.quick_reply?.payload || event.postback?.payload;
  const text = event.message?.text?.trim() || '';
  const hasAttachment = Array.isArray(event.message?.attachments)
    && event.message.attachments.length > 0;
  const now = admin.firestore.Timestamp.now();
  const conversationWasRecent = isMindsetConversationSessionRecent(
    lead.lastUserInteractionAt?.toMillis(),
    now.toMillis()
  );

  // Meta grants messaging-profile access only after the user interacts in DM.
  // Start enrichment at that boundary without putting it in front of the reply.
  const profileRefreshPromise = refreshMindsetLeadProfile(ref, lead, account);

  if (payload?.startsWith('mindset:')) {
    const [, action, token] = payload.split(':');
    await updateLeadHistory(ref, 'user', `[Quick Reply] ${action}`, {
      lastUserInteractionAt: now,
      unansweredFollowUpCount: 0,
    });
    await cancelPendingFollowUps(lead.id, 'user_replied');
    if (lead.automationPaused || lead.stage === 'human_handoff') {
      await profileRefreshPromise;
      return true;
    }
    await handleMindsetAction(action, senderId, lead, ref, account, token);
    await profileRefreshPromise;
    return true;
  }

  if (hasAttachment) {
    await updateLeadHistory(
      ref,
      'user',
      text ? `${text} [Instagram attachment]` : '[Instagram attachment]',
      {
        lastUserInteractionAt: now,
        unansweredFollowUpCount: 0,
      }
    );
    await cancelPendingFollowUps(lead.id, 'user_replied_with_attachment');
    if (!lead.automationPaused && lead.stage !== 'human_handoff') {
      await createSilentMindsetHandoff(ref, lead, 'attachment_requires_review');
    }
    await profileRefreshPromise;
    return true;
  }

  if (!text) {
    await profileRefreshPromise;
    return false;
  }
  await updateLeadHistory(ref, 'user', text, {
    lastUserInteractionAt: now,
    unansweredFollowUpCount: 0,
  });
  await cancelPendingFollowUps(lead.id, 'user_replied');
  if (lead.automationPaused || lead.stage === 'human_handoff') {
    await profileRefreshPromise;
    return true;
  }
  if (requiresMindsetHumanHandoff(text)) {
    await handleMindsetAction('human', senderId, lead, ref, account);
    await profileRefreshPromise;
    return true;
  }
  const intent = classifyMindsetReplyForStage(text, lead.stage);
  const mayContinueAfterClosedFunnel = [
    'app_link_request',
    'trial_started',
    'subscribed',
  ].includes(intent);
  if (CLOSED_FUNNEL_STAGES.has(lead.stage) && !mayContinueAfterClosedFunnel) {
    console.log(`[Mindset] Conversation already complete; storing the message without replying (${intent})`);
    await profileRefreshPromise;
    return true;
  }
  const scopePrecheck = precheckMindsetAutomationScope(
    intent,
    text,
    lead.stage,
    conversationWasRecent
  );
  let scopeDecision = scopePrecheck;
  let scopeClassifierUsedAI = true;
  if (scopePrecheck === 'classify') {
    const previousAssistantMessage = [...(lead.history || [])]
      .reverse()
      .find((message) => (
        message.role === 'assistant'
        && isMindsetHistoryEntryInConversation(message, lead.id)
      ))?.content;
    const scopeResult = await generateIsolatedAIResponseWithStatus(
      buildMindsetScopeClassifierPrompt(
        lead.stage,
        previousAssistantMessage,
        conversationWasRecent
      ),
      [{ role: 'user', content: text }],
      {
        maxTokens: MINDSET_SCOPE_CLASSIFIER_MAX_TOKENS,
        userMessage: text,
        fallbackResponse: '',
      }
    );
    scopeClassifierUsedAI = scopeResult.usedAI;
    scopeDecision = scopeResult.usedAI
      ? parseMindsetScopeDecision(scopeResult.text)
      : 'uncertain';
  }
  if (scopeDecision !== 'in_scope') {
    const handoffReason = !scopeClassifierUsedAI
      ? 'scope_classifier_unavailable'
      : scopeDecision === 'off_topic'
        ? 'off_topic'
        : scopeDecision === 'human_required'
          ? 'scope_human_required'
          : 'scope_uncertain';
    console.log(`[Mindset] Free-text reply blocked by scope gate: ${handoffReason}`);
    await createSilentMindsetHandoff(ref, lead, handoffReason);
    await profileRefreshPromise;
    return true;
  }

  const isNewConversionConfirmation = (
    intent === 'subscribed'
      && !['subscription_claimed', 'subscribed'].includes(lead.stage)
  ) || (
    intent === 'trial_started'
      && !['trial_claimed', 'trial_started', 'subscribed'].includes(lead.stage)
  );
  const isAllowedClosedFunnelAction = intent === 'app_link_request' || isNewConversionConfirmation;
  const isSafeTerminalAcknowledgement = intent === 'gratitude' || intent === 'not_interested';
  if (!shouldUseMindsetAIForReplyIntent(intent)
      && (![
        'trial_claimed',
        'subscription_claimed',
        'trial_started',
        'subscribed',
        'completed',
      ].includes(lead.stage) || isAllowedClosedFunnelAction || isSafeTerminalAcknowledgement)) {
    await handleMindsetAction(intent, senderId, lead, ref, account);
    await profileRefreshPromise;
    return true;
  }

  const history = (lead.history || [])
    .filter((message) => isMindsetHistoryEntryInConversation(message, lead.id))
    .slice(-8)
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));
  const aiResult = await generateIsolatedAIResponseWithStatus(
    buildMindsetAISystemPrompt(lead.stage),
    [...history, { role: 'user', content: text }],
    {
      maxTokens: 300,
      userMessage: text,
      fallbackResponse: '',
    }
  );
  const aiControlAction = aiResult.usedAI ? mindsetAIControlAction(aiResult.text) : null;
  if (aiControlAction === 'handoff') {
    console.log('[Mindset] Claude requested a silent sensitive-message handoff');
    await createSilentMindsetHandoff(ref, lead, 'ai_sensitive_handoff');
    await profileRefreshPromise;
    return true;
  }
  if (aiControlAction === 'send_app_link') {
    console.log('[Mindset] Claude requested the deterministic app-link action');
    await handleMindsetAction('app_link_request', senderId, lead, ref, account);
    await profileRefreshPromise;
    return true;
  }
  const responseText = constrainMindsetAIReply(aiResult.text);
  if (!aiResult.usedAI || shouldSuppressMindsetAutomatedReply(responseText)) {
    console.log('[Mindset] Free-text response suppressed; creating silent handoff');
    await createSilentMindsetHandoff(
      ref,
      lead,
      aiResult.usedAI ? 'automated_reply_suppressed' : 'ai_provider_unavailable'
    );
    await profileRefreshPromise;
    return true;
  }

  console.log('[Mindset] Free-text response source: claude');
  const sent = await sendInstagramDM(senderId, responseText, account, { conversationId: ref.id });
  if (!sent) throw new Error('Mindset free-text response failed to send');
  await updateLeadHistory(ref, 'assistant', responseText, {
    stage: 'ai_follow_up',
  });
  await profileRefreshPromise;
  return true;
}

export async function processMindsetFollowUps(): Promise<number> {
  if (!isMindsetModeActive()) return 0;
  const now = admin.firestore.Timestamp.now();
  const due = await db.collection(FOLLOWUPS)
    .where('status', '==', 'pending')
    .where('dueAt', '<=', now)
    .limit(50)
    .get();
  let processed = 0;

  for (const doc of due.docs) {
    try {
      const claimed = await db.runTransaction(async (transaction) => {
        const current = await transaction.get(doc.ref);
        if (current.data()?.status !== 'pending') return false;
        transaction.update(doc.ref, { status: 'processing', updatedAt: now });
        return true;
      });
      if (!claimed) continue;

      const item = doc.data() as { leadId: string; accountId: string; type: FollowUpType };
      const [leadSnapshot, accountSnapshot] = await Promise.all([
        db.collection(LEADS).doc(item.leadId).get(),
        db.collection('accounts').doc(item.accountId).get(),
      ]);
      if (!leadSnapshot.exists || !accountSnapshot.exists) throw new Error('Follow-up target missing');

      const lead = leadSnapshot.data() as MindsetLead;
      const account = { ...accountSnapshot.data(), id: accountSnapshot.id } as InstagramAccount;
      if (!isAllowedAccount(account)) throw new Error('Account blocked by safety gate');
      if (!isMindsetFollowUpIdentityMatch(
        item,
        leadSnapshot.id,
        lead,
        account.id,
        account.userId
      )) {
        console.error('[Mindset] Follow-up blocked by conversation isolation guard');
        await doc.ref.update({ status: 'cancelled_isolation_violation', updatedAt: now });
        processed++;
        continue;
      }
      if (item.type === 'subscription_check') {
        await doc.ref.update({ status: 'cancelled_policy_removed', updatedAt: now });
        processed++;
        continue;
      }
      if (lead.automationPaused) {
        await doc.ref.update({
          status: 'pending',
          dueAt: admin.firestore.Timestamp.fromMillis(now.toMillis() + 30 * 60 * 1000),
          updatedAt: now,
        });
        continue;
      }
      if ([
        'trial_claimed',
        'subscription_claimed',
        'trial_started',
        'subscribed',
        'completed',
        'human_handoff',
      ].includes(lead.stage)) {
        await doc.ref.update({ status: 'cancelled_terminal_stage', updatedAt: now });
        continue;
      }
      if (!lead.lastUserInteractionAt || !isWithinMessagingWindow(lead.lastUserInteractionAt.toMillis(), now.toMillis())) {
        await doc.ref.update({ status: 'skipped_window_closed', updatedAt: now });
        continue;
      }

      let sent = false;
      let message = '';
      let nextStage: MindsetStage | null = null;
      const journey = journeyForLead(lead);

      if (item.type === 'link_reminder'
          && journey.followUps.noClick.enabled
          && !lead.downloadClickedAt) {
        message = journey.followUps.noClick.message;
      } else if (item.type === 'download_check'
          && journey.followUps.downloadCheck.enabled
          && !lead.appOpenedAt
          && !lead.firstRepStartedAt) {
        message = journey.followUps.downloadCheck.message;
        nextStage = 'awaiting_download_status';
      } else if (item.type === 'use_check'
          && journey.followUps.useCheck.enabled
          && lead.appOpenedAt
          && !lead.firstRepStartedAt) {
        message = journey.followUps.useCheck.message;
        nextStage = 'awaiting_use_status';
      } else if (item.type === 'feedback_check'
          && journey.followUps.feedbackCheck.enabled
          && lead.firstRepCompletedAt) {
        message = journey.followUps.feedbackCheck.message;
        nextStage = 'awaiting_feedback';
      }

      if (message) {
        const reservation = await reserveUnansweredFollowUp(
          leadSnapshot.ref,
          lead.lastUserInteractionAt,
          account.id,
          lead.instagramUserId,
          account.userId
        );
        if (!reservation.allowed) {
          const status = reservation.reason === 'limit'
            ? 'skipped_unanswered_limit'
            : reservation.reason === 'user_replied'
              ? 'cancelled_user_replied'
              : reservation.reason === 'paused'
                ? 'cancelled_automation_paused'
                : reservation.reason === 'isolation'
                  ? 'cancelled_isolation_violation'
                  : 'cancelled_terminal_stage';
          await doc.ref.update({
            status,
            unansweredLimit: MAX_UNANSWERED_MINDSET_FOLLOW_UPS,
            updatedAt: now,
          });
          if (reservation.reason === 'limit') {
            await cancelPendingFollowUps(lead.id, 'unanswered_follow_up_limit');
          }
          processed++;
          continue;
        }

        sent = await sendInstagramDM(
          lead.instagramUserId,
          message,
          account,
          { conversationId: leadSnapshot.id }
        );
        if (!sent) throw new Error(`${item.type} message failed to send`);
        await updateLeadHistory(
          leadSnapshot.ref,
          'assistant',
          message,
          nextStage ? { stage: nextStage } : {}
        );
      }

      await doc.ref.update({ status: 'completed', processedAt: now, updatedAt: now });
      processed++;
    } catch (error) {
      console.error(`[Mindset] Follow-up ${doc.id} failed`, error instanceof Error ? error.message : 'unknown');
      await doc.ref.update({ status: 'failed', updatedAt: admin.firestore.Timestamp.now() });
    }
  }

  return processed;
}

async function resolveMindsetLeadByToken(
  token: string
): Promise<{ doc: FirebaseFirestore.QueryDocumentSnapshot; lead: MindsetLead } | null> {
  const matches = await db.collection(LEADS).where('linkToken', '==', token).limit(2).get();
  if (matches.size !== 1) {
    if (matches.size > 1) {
      console.error('[Mindset] Token rejected because it matched multiple conversations');
    }
    return null;
  }

  const doc = matches.docs[0];
  const lead = doc.data() as MindsetLead;
  if (!isMindsetConversationRecordSelfConsistent(doc.id, lead)) {
    console.error('[Mindset] Token rejected by conversation isolation guard');
    return null;
  }
  return { doc, lead };
}

export async function recordMindsetDownloadClick(token: string): Promise<string | null> {
  if (!isValidMindsetLeadToken(token)) return null;
  const resolved = await resolveMindsetLeadByToken(token);
  if (!resolved) return null;
  const { doc, lead } = resolved;
  const journey = journeyForLead(lead);
  const now = admin.firestore.Timestamp.now();
  const nextStage: MindsetStage = CLOSED_FUNNEL_STAGES.has(lead.stage)
    ? lead.stage
    : 'link_clicked';
  const updatedLead: MindsetLead = {
    ...lead,
    stage: nextStage,
    downloadClickedAt: now,
    updatedAt: now,
  };
  await doc.ref.set({
    stage: nextStage,
    downloadClickedAt: now,
    updatedAt: now,
  }, { merge: true });
  if (!CLOSED_FUNNEL_STAGES.has(lead.stage)
      && !lead.appOpenedAt
      && journey.followUps.downloadCheck.enabled) {
    await scheduleFollowUp(
      updatedLead,
      'download_check',
      mindsetCampaignFollowUpDelayMs(journey.followUps.downloadCheck)
    );
  }
  return buildMindsetDownloadDestination(token, journey.destinationUrl);
}

export async function recordMindsetActivationLinkClick(
  token: string
): Promise<{ appUrl: string; fallbackUrl: string } | null> {
  if (!isValidMindsetLeadToken(token)) return null;
  const resolved = await resolveMindsetLeadByToken(token);
  if (!resolved) return null;
  const journey = journeyForLead(resolved.lead);
  const now = admin.firestore.Timestamp.now();
  await resolved.doc.ref.set({
    activationLinkClickedAt: now,
    updatedAt: now,
  }, { merge: true });
  return {
    appUrl: buildMindsetAppOpenUrl(token),
    fallbackUrl: buildMindsetDownloadDestination(token, journey.destinationUrl),
  };
}

export async function recordMindsetActivationEvent(
  token: string,
  event: MindsetActivationEvent
): Promise<boolean> {
  if (!isValidMindsetLeadToken(token)) return false;
  const resolved = await resolveMindsetLeadByToken(token);
  if (!resolved) return false;
  const { doc, lead } = resolved;
  const journey = journeyForLead(lead);
  const field = activationTimestampField(event);
  const now = admin.firestore.Timestamp.now();
  const isFirstOccurrence = !(lead as unknown as Record<string, unknown>)[field];
  const nextStage = stageAfterActivationEvent(lead.stage, event);
  const updates: Record<string, unknown> = {
    stage: nextStage,
    updatedAt: now,
  };
  if (isFirstOccurrence) updates[field] = now;
  await doc.ref.set(updates, { merge: true });

  const updatedLead = { ...lead, ...updates, stage: nextStage, updatedAt: now } as MindsetLead;
  if (event === 'app_opened') {
    await cancelPendingFollowUps(lead.id, 'app_opened', ['link_reminder', 'download_check']);
    if (isFirstOccurrence && journey.followUps.useCheck.enabled) {
      await scheduleFollowUp(
        updatedLead,
        'use_check',
        mindsetCampaignFollowUpDelayMs(journey.followUps.useCheck)
      );
    }
  } else if (event === 'first_rep_started') {
    await cancelPendingFollowUps(lead.id, 'first_rep_started', ['use_check']);
  } else if (event === 'first_rep_completed') {
    await cancelPendingFollowUps(lead.id, 'first_rep_completed', ['use_check']);
    if (isFirstOccurrence
        && !CLOSED_FUNNEL_STAGES.has(nextStage)
        && journey.followUps.feedbackCheck.enabled) {
      await scheduleFollowUp(
        updatedLead,
        'feedback_check',
        mindsetCampaignFollowUpDelayMs(journey.followUps.feedbackCheck)
      );
    }
  } else if (event === 'paywall_viewed') {
    await cancelPendingFollowUps(lead.id, 'paywall_viewed', ['feedback_check']);
  }
  return true;
}

export async function recordMindsetConversionEvent(
  token: string,
  event: MindsetConversionEvent,
  sourceEventId?: string
): Promise<boolean> {
  if (!isValidMindsetLeadToken(token)) return false;
  const resolved = await resolveMindsetLeadByToken(token);
  if (!resolved) return false;
  const { doc, lead } = resolved;
  const field = conversionTimestampField(event);
  const verificationField = conversionVerificationTimestampField(event);
  const now = admin.firestore.Timestamp.now();
  const updates: Record<string, unknown> = {
    stage: stageAfterConversionEvent(lead.stage, event),
    lastVerifiedConversionEvent: event,
    conversionVerifiedAt: now,
    [verificationField]: now,
    updatedAt: now,
  };
  if (!(lead as unknown as Record<string, unknown>)[field]) updates[field] = now;
  if (sourceEventId) updates.lastConversionSourceEventId = sourceEventId.slice(0, 200);

  await doc.ref.set(updates, { merge: true });
  await cancelPendingFollowUps(lead.id, `verified_${event}`);
  return true;
}
