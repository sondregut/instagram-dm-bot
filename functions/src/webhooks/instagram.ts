import { writeNovaMessage, queueNovaLead, recordNovaOutbound, isExplicitNovaReply, novaRecordId } from '../services/novaSpeedRecords';
import * as admin from 'firebase-admin';
import { createHash } from 'crypto';
import { matchesCommentKeyword } from '../utils/commentKeywordMatching';
import { sendInstagramCommentPrivateReplyOnce, sendInstagramDMOnce, replyToComment } from '../services/instagram';
import { isFollowerGateRecipientBlocked } from '../services/followerGatePolicy';
import { requiresMindsetHumanHandoff } from '../services/mindsetFlowLogic';
import { isLinkOptOut } from '../services/linkRecoveryLogic';
import { isMindsetAutomationEnabled } from '../utils/runtimeMode';
import * as functions from 'firebase-functions';
import { handleMessage, InstagramMessageEvent } from '../handlers/messageHandler';
import { handleComment, InstagramCommentEvent } from '../handlers/commentHandler';
import {
  handleStoryMention,
  handleStoryReply,
  isStoryMentionEvent,
  isStoryReplyEvent,
  InstagramStoryMentionEvent,
  InstagramStoryReplyEvent,
} from '../handlers/storyHandler';
import { getAccountByInstagramId, updateAccountWebhookTimestamp } from '../services/accounts';
import { db, InstagramAccount } from '../firebase';
import { handleMindsetComment, handleMindsetMessage } from '../handlers/mindsetHandler';
import { isMindsetAccountAllowed } from '../services/mindsetCampaigns';
import { BotMode, getBotMode, shouldRunLegacyAutomation } from '../utils/runtimeMode';
import { verifyMetaWebhookSignature } from '../utils/webhookSignature';
import { handleJumpDirectMessage } from '../handlers/jumpDirectMessage';
import { handleLinkRecovery } from '../handlers/linkRecovery';
import { handleFollowerGateMessage } from '../handlers/followerGate';
import { withFollowerInbound, FOLLOWER_WINDOW_MS, FOLLOWER_WINDOW_MARGIN_MS } from '../services/followerGatePolicy';
import { isTrackSpeedOnlyScope } from '../services/trackSpeedOnlyPolicy';

/**
 * Instagram Webhook Handler
 * Receives events from Meta's webhook system
 * Routes events to the correct account in multi-tenant setup
 */
export const instagramWebhook = functions.https.onRequest(async (req, res) => {
  // Webhook verification (GET request from Meta)
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    const verifyToken = process.env.VERIFY_TOKEN || 'instagram_dm_bot_verify_123';

    if (mode === 'subscribe' && token === verifyToken) {
      console.log('Webhook verified successfully');
      res.status(200).send(challenge);
      return;
    }

    console.error('Webhook verification failed');
    res.sendStatus(403);
    return;
  }

  // Handle webhook events (POST request)
  if (req.method === 'POST') {
    const mode = getBotMode();
    if (mode === 'disabled') {
      console.log('[Webhook] Bot is disabled - ignoring all events');
      res.sendStatus(200);
      return;
    }

    const signature = req.get('x-hub-signature-256') || undefined;
    if (!verifyMetaWebhookSignature(req.rawBody, signature, process.env.INSTAGRAM_APP_SECRET)) {
      console.warn('[Webhook] Rejected request with invalid signature');
      res.sendStatus(401);
      return;
    }

    const { object, entry } = req.body || {};
    if (object !== 'instagram' || !Array.isArray(entry)) {
      res.sendStatus(404);
      return;
    }

    try {
      await processWebhookEvents(entry, mode);
    } catch (error) {
      console.error('[Webhook] Event processing failed:', error instanceof Error ? error.message : 'unknown');
    }

    res.sendStatus(200);
    return;
  }

  res.sendStatus(405);
});

/**
 * Process webhook events from Meta
 * Routes events to the correct account based on recipient ID
 */
async function processWebhookEvents(entry: any[], mode: BotMode): Promise<void> {
  for (const event of entry) {
    // The event.id is the Instagram Account ID that received the event
    const instagramAccountId = event.id;

    // Look up which account this belongs to
    const account = await getAccountByInstagramId(instagramAccountId);

    if (!account) {
      console.log(`[Webhook] Unknown Instagram account: ${instagramAccountId}`);
      // Could be a legacy account or unregistered - skip
      continue;
    }

    // NovaSpeed is isolated from app-download, story and general AI workflows.
    // The handle reserves a silent route; delivery requires verified immutable IDs.
    if (isNovaSpeedScope(account)) {
      for (const message of Array.isArray(event.messaging) ? event.messaging : []) {
        if (!await handleNovaSpeedNoteOrEcho(message, account)) await handleNovaSpeedMessage(message, account);
      }
      for (const change of Array.isArray(event.changes) ? event.changes : []) {
        if (change.field === 'comments') await handleNovaSpeedComment(change.value, account, Date.now());
      }
      continue;
    }

    // Update last webhook timestamp
    await updateAccountWebhookTimestamp(account.id);

    console.log(`[Webhook] Processing event for account: ${account.username} (${account.id})`);
    // A reserved handle stays silent until immutable identity + gate settings
    // are verified. Only SPEED comments can create a session; DMs can only
    // continue it. No legacy, story, runtime MINDSET, JUMP, or AI fall-through.
    if (isTrackSpeedOnlyScope(account)) {
      for (const change of Array.isArray(event.changes) ? event.changes : []) {
        if (change?.field !== 'comments') continue;
        try {
          await handleMindsetComment(change.value, account);
        } catch (error) {
          console.error('[Webhook] SPEED comment failed:', error instanceof Error ? error.message : 'unknown');
        }
      }
      for (const messagingEvent of Array.isArray(event.messaging) ? event.messaging : []) {
        if (isStoryMentionEvent(messagingEvent) || isStoryReplyEvent(messagingEvent)) continue;
        try {
          await handleFollowerGateMessage(messagingEvent, account);
        } catch (error) {
          console.error('[Webhook] SPEED comment continuation failed:', error instanceof Error ? error.message : 'unknown');
        }
      }
      continue;
    }
    const mindsetTargetAccount = isMindsetAccountAllowed(account);
    const legacyAutomationAllowed = shouldRunLegacyAutomation(mode, mindsetTargetAccount);

    // Handle direct messages and story events
    if (event.messaging && Array.isArray(event.messaging)) {
      for (const messagingEvent of event.messaging) {
        try {
          // Check for story mention events
          if (isStoryMentionEvent(messagingEvent)) {
            if (!legacyAutomationAllowed) continue;
            console.log('[Webhook] Processing story mention event');
            await handleStoryMention(messagingEvent as InstagramStoryMentionEvent, account);
            continue;
          }

          // Check for story reply events (message with story context)
          if (isStoryReplyEvent(messagingEvent)) {
            if (!legacyAutomationAllowed) continue;
            console.log('[Webhook] Processing story reply event');
            await handleStoryReply(messagingEvent as InstagramStoryReplyEvent, account);
            continue;
          }

          await withFollowerInbound(account, messagingEvent.sender?.id || '',
            Number(messagingEvent.timestamp || 0) + FOLLOWER_WINDOW_MS - FOLLOWER_WINDOW_MARGIN_MS,
            () => handleFollowerGateMessage(messagingEvent, account, { forceLinkRequest: true }), async () => {
              if (await handleSharedNovaSpeedMessage(messagingEvent, account)) return;
              if (await handleFollowerGateMessage(messagingEvent, account)) return;
              if (await handleJumpDirectMessage(messagingEvent, account)) return;
              if (await handleLinkRecovery(messagingEvent, account)) return;
              const mindsetHandled = await handleMindsetMessage(messagingEvent as InstagramMessageEvent, account);
              if (mindsetHandled || !legacyAutomationAllowed) return;
              await handleMessage(messagingEvent as InstagramMessageEvent, account);
            });
        } catch (error) {
          console.error('Error handling message/story event:', error);
        }
      }
    }

    // Handle field changes (comments, mentions, etc.)
    if (event.changes && Array.isArray(event.changes)) {
      for (const change of event.changes) {
        try {
          switch (change.field) {
            case 'comments':
              if (isNovaSpeedEnabled(account) && isNovaSpeedComment(change.value?.text)) {
                await handleNovaSpeedComment(change.value, account, Date.now());
                break;
              }
              const mindsetHandled = await handleMindsetComment(change.value as InstagramCommentEvent, account);
              if (mindsetHandled || !legacyAutomationAllowed) break;
              await handleComment(change.value as InstagramCommentEvent, account);
              break;

            case 'mentions':
              if (!legacyAutomationAllowed) break;
              // Handle story mentions from changes field (alternative format)
              console.log('[Webhook] Story mention from changes:', change.value);
              if (change.value?.media_type === 'STORY' || change.value?.story_id) {
                // Convert to our event format and handle
                const mentionEvent: InstagramStoryMentionEvent = {
                  sender: { id: change.value.user_id || change.value.from?.id },
                  recipient: { id: account.instagramAccountId },
                  timestamp: Date.now(),
                  story_mention: {
                    id: change.value.story_id || change.value.media_id,
                    link: change.value.permalink || '',
                  },
                };
                await handleStoryMention(mentionEvent, account);
              }
              break;

            default:
              console.log(`Unhandled change field: ${change.field}`);
          }
        } catch (error) {
          console.error(`Error handling ${change.field} change:`, error);
        }
      }
    }
  }
}

/**
 * Webhook event types reference:
 *
 * Messaging events (event.messaging):
 * - message: New message received
 * - message_reads: Message was read
 * - message_reactions: Reaction to a message
 * - messaging_postbacks: Quick reply button clicked
 *
 * Change events (event.changes):
 * - comments: New comment on a post
 * - mentions: Tagged in a story
 * - story_insights: Story view insights
 */

// Account-scoped NovaSpeed comment/email campaign.

export interface NovaSpeedIdentity { id: string; userId: string; instagramAccountId: string }
// Verified after successful Instagram Login on 2026-10-21. Brand activation
// also requires automationMode=live on this exact connected account.
export const NOVASPEED_IDENTITY: NovaSpeedIdentity | null = {
  id: '0HSg4vvkJeiiwgjkxIve', userId: 'uqBSZBen8DPLxIkzMFH8tRle62F3',
  instagramAccountId: '17841480064131939',
};
// Verified in the live account document on 2026-10-21. This campaign coexists
// with MINDSET; it must never take the account's exclusive NovaSpeed route.
export const SONDRE_NOVASPEED_IDENTITY: NovaSpeedIdentity = {
  id: '75w5QJJQUa4TGOq8bwzZ', userId: 'uqBSZBen8DPLxIkzMFH8tRle62F3',
  instagramAccountId: '17841400489754274',
};
export const NOVASPEED_PUBLIC = 'Thanks! Check your DMs.';
export const NOVASPEED_PRIVATE = 'Thanks for your interest in the NovaSpeed timing system! Reply with your email address and we’ll send you more information.';
export const NOVASPEED_THANKS = 'Thanks! Your email has been saved for NovaSpeed product information.';
export const NOVASPEED_INVALID = 'Please reply with just one email address, like name@example.com. You can also reply STOP.';
export const NOVASPEED_SESSION_MS = 7 * 24 * 60 * 60 * 1000;
export const NOVASPEED_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const validNovaId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,180}$/.test(v);
export const novaKey = (accountId: string, recipientId: string): string => `${accountId}_${recipientId}`;

export function isNovaSpeedScope(a: InstagramAccount): boolean {
  return a.platform !== 'facebook' && (a.username?.toLowerCase().replace(/^@/, '') === 'novaspeedtiming'
    || Boolean(NOVASPEED_IDENTITY && (a.id === NOVASPEED_IDENTITY.id || a.instagramAccountId === NOVASPEED_IDENTITY.instagramAccountId)));
}
export function isNovaSpeedEnabled(a: InstagramAccount | undefined): a is InstagramAccount {
  const shared = a?.username === 'sondre_pv';
  const id = shared ? SONDRE_NOVASPEED_IDENTITY : NOVASPEED_IDENTITY;
  return Boolean(id && a && a.platform !== 'facebook' && a.id === id.id && a.userId === id.userId
    && a.instagramAccountId === id.instagramAccountId && (shared || a.username === 'novaspeedtiming')
    && a.isActive && a.connectionStatus === 'connected' && a.webhookSubscribed === true
    && (a.automationMode === 'live' || (shared && a.automationMode === undefined))
    && isMindsetAutomationEnabled() && ['mindset', 'full'].includes(getBotMode()));
}
export function isNovaSpeedComment(text: unknown): boolean {
  return matchesCommentKeyword(text, 'NOVASPEED');
}
// Accept one bare address only. Never extract emails from quoted/unrelated prose,
// never claim ownership/deliverability verification, and never log the address.
export function novaEmail(text: unknown): string | null {
  if (typeof text !== 'string') return null;
  const value = text.trim();
  if (value.length > 254 || /[\r\n\u0000-\u001f]/.test(value)) return null;
  const parts = value.split('@');
  if (parts.length !== 2) return null;
  const [local, domain] = parts;
  if (!local || local.length > 64 || local.startsWith('.') || local.endsWith('.') || local.includes('..')
    || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)) return null;
  const labels = domain.split('.');
  if (labels.length < 2 || !/^[a-z]{2,63}$/i.test(labels[labels.length - 1])
    || labels.some(p => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(p))) return null;
  return `${local}@${domain.toLowerCase()}`;
}

const stamp = () => admin.firestore.Timestamp.now();
const millis = (value: any): number => value?.toMillis?.() || 0;
const sessionRef = (a: InstagramAccount, r: string) => db.collection('novaspeed_sessions').doc(novaKey(a.id, r));
const receiptRef = (a: InstagramAccount, kind: string, id: string) => db.collection('novaspeed_events').doc(`${a.id}_${kind}_${id}`);
const sessionMatches = (s: any, a: InstagramAccount, r: string): boolean => Boolean(s && s.accountId === a.id
  && s.ownerUserId === a.userId && s.instagramUserId === r);
const blocked = (gate: any, lead: any, session: any): boolean => isFollowerGateRecipientBlocked(gate, lead)
  || lead?.automationPaused === true || lead?.stage === 'human_handoff' || session?.paused === true;
const novaOwnsSharedConversation = (a: InstagramAccount, s: any, mindset: any): boolean => a.username !== 'sondre_pv'
  || Boolean(s && (mindset?.campaignSessionId || null) === (s.mindsetSessionAtEntry || null)
    && millis(mindset?.lastUserInteractionAt) <= millis(s.reservedAt)
    && millis(mindset?.lastAutomatedFollowUpAt) <= millis(s.reservedAt));

async function readGuard(tx: FirebaseFirestore.Transaction, a: InstagramAccount, r: string) {
  const [account, gate, lead, session] = await Promise.all([
    tx.get(db.collection('accounts').doc(a.id)),
    tx.get(db.collection('follower_gate_recipients').doc(novaKey(a.id, r))),
    tx.get(db.collection('mindset_leads').doc(novaKey(a.id, r))), tx.get(sessionRef(a, r)),
  ]);
  const current = account.data() as InstagramAccount | undefined;
  const state = session.data();
  return { current, state, gate: gate.data(), mindset: lead.data(), allowed: isNovaSpeedEnabled(a) && isNovaSpeedEnabled(current)
    && !blocked(gate.data(), lead.data(), state) && (!state || sessionMatches(state, a, r)) };
}
async function fresh(a: InstagramAccount, r: string) {
  return db.runTransaction(tx => readGuard(tx, a, r));
}

export async function handleNovaSpeedComment(event: any, a: InstagramAccount, receivedAt: number): Promise<void> {
  if (!isNovaSpeedEnabled(a) || !event || !validNovaId(event.id) || !validNovaId(event.media?.id)
    || !validNovaId(event.from?.id) || event.from.id === a.instagramAccountId
    || event.from.username?.toLowerCase() === a.username.toLowerCase() || !isNovaSpeedComment(event.text)) return;
  const r = event.from.id, ref = receiptRef(a, 'comment', event.id), session = sessionRef(a, r);
  const parsed = event.timestamp ? Date.parse(event.timestamp) : receivedAt;
  const commentAt = Number.isFinite(parsed) ? parsed : receivedAt;
  const expiresAt = commentAt + NOVASPEED_SESSION_MS - 60_000;
  if (!Number.isFinite(receivedAt) || commentAt > Date.now() + 60_000 || Date.now() >= expiresAt) return;
  const reserved = await db.runTransaction(async tx => {
    const [guard, receipt] = await Promise.all([readGuard(tx, a, r), tx.get(ref)]);
    if (!guard.allowed || receipt.exists) return false;
    const old = guard.state;
    if (old?.status === 'email_collected' || Date.now() - millis(old?.reservedAt) < NOVASPEED_COOLDOWN_MS) return false;
    tx.create(ref, { accountId: a.id, ownerUserId: a.userId, instagramUserId: r,
      commentId: event.id, mediaId: event.media.id, status: 'reserved', reservedAt: stamp() });
    tx.set(session, { accountId: a.id, ownerUserId: a.userId, instagramUserId: r,
      username: typeof event.from.username === 'string' ? event.from.username : '',
      commentId: event.id, mediaId: event.media.id, status: 'opening_reserved', reservedAt: stamp(),
      campaignId: 'novaspeed-comment-email',
      mindsetSessionAtEntry: guard.mindset?.campaignSessionId || null,
      expiresAt: admin.firestore.Timestamp.fromMillis(expiresAt), invalidPrompted: false, paused: false });
    return true;
  });
  if (!reserved) return;
  try {
    const guard = await fresh(a, r);
    if (!guard.allowed || guard.state?.commentId !== event.id
      || !novaOwnsSharedConversation(a, guard.state, guard.mindset)) return;
    await recordNovaOutbound(a, guard.state, 'opening:' + event.id, NOVASPEED_PRIVATE, 'attempt_reserved');
    let providerMessageId: string | undefined;
    const accepted = await sendInstagramCommentPrivateReplyOnce(event.id, NOVASPEED_PRIVATE, guard.current!, expiresAt,
      (_accepted, id) => { providerMessageId = id; });
    await recordNovaOutbound(a, guard.state, 'opening:' + event.id, NOVASPEED_PRIVATE, accepted ? 'accepted' : 'not_confirmed', providerMessageId);
    await ref.update({ privateReplyStatus: accepted ? 'accepted' : 'not_confirmed', updatedAt: stamp() });
    if (!accepted) return; // An uncertain response is permanently reserved, never replayed.
    await db.runTransaction(async tx => {
      const now = await readGuard(tx, a, r);
      if (now.allowed && now.state?.commentId === event.id && novaOwnsSharedConversation(a, now.state, now.mindset)) {
        tx.update(session, { status: 'awaiting_email', updatedAt: stamp() });
      }
    });
    const now = await fresh(a, r);
    if (!now.allowed || now.state?.commentId !== event.id
      || !novaOwnsSharedConversation(a, now.state, now.mindset)) return;
    const publicAccepted = await replyToComment(event.id, NOVASPEED_PUBLIC, now.current);
    await ref.update({ status: 'completed', publicReplyStatus: publicAccepted ? 'accepted' : 'not_confirmed', updatedAt: stamp() });
  } catch {
    // No provider text, credentials, comment text or email is copied to logs.
    await ref.update({ status: 'outcome_uncertain', updatedAt: stamp() });
  }
}

/**
 * Claim only an existing NovaSpeed conversation on the shared personal account.
 * Existing MINDSET comments, explicit controls, newer sessions and story events
 * retain their original handlers. No MINDSET documents are modified here.
 */
export async function handleSharedNovaSpeedMessage(event: any, a: InstagramAccount): Promise<boolean> {
  if (await handleNovaSpeedNoteOrEcho(event, a)) return true;
  if (a.username !== 'sondre_pv' || !isNovaSpeedEnabled(a) || !validNovaId(event?.sender?.id)
    || event.recipient?.id !== a.instagramAccountId || event.sender.id === a.instagramAccountId
    || event.message?.is_echo || event.message?.reply_to?.story || event.message?.attachments
    || typeof event.message?.text !== 'string') return false;
  const r = event.sender.id, text = event.message.text;
  const guard = await fresh(a, r), s = guard.state;
  if (!s || !sessionMatches(s, a, r)) return false;
  const isControl = event.message?.quick_reply || event.postback
    || /^\s*(?:mindset|link|vault|jump|speed)[\s.!?,]*$/i.test(text);
  const newerMindset = !novaOwnsSharedConversation(a, s, guard.mindset);
  if (isControl || newerMindset) {
    // Only the NovaSpeed session yields ownership. Existing MINDSET state and
    // follow-up rules are preserved, including its own pause/opt-out behavior.
    if (s.status === 'awaiting_email' || s.status === 'opening_reserved') {
      await sessionRef(a, r).update({ status: 'superseded', updatedAt: stamp() });
    }
    return false;
  }
  const stop = /^\s*(?:stop|unsubscribe|cancel)[.!?\s]*$/i.test(text) || isLinkOptOut(text)
    || requiresMindsetHumanHandoff(text);
  if (stop) {
    await handleNovaSpeedMessage(event, a);
    return false; // Preserve the original shared-account opt-out/handoff path.
  }
  // Never pass a second email in this completed campaign to unrelated AI flows.
  if (s.status === 'email_collected' && novaEmail(text)) return true;
  if (s.status !== 'awaiting_email' || millis(s.expiresAt) <= Date.now()) return false;
  await handleNovaSpeedMessage(event, a);
  return true;
}

export async function handleNovaSpeedMessage(event: any, a: InstagramAccount): Promise<void> {
  if (!isNovaSpeedEnabled(a) || !validNovaId(event?.sender?.id)
    || typeof event?.message?.mid !== 'string' || !event.message.mid || event.message.mid.length > 2048
    || event.recipient?.id !== a.instagramAccountId || event.sender.id === a.instagramAccountId
    || event.message.is_echo || event.message.reply_to?.story || event.message.attachments || event.postback
    || typeof event.message.text !== 'string' || event.message.text.length > 20000) return;
  const r = event.sender.id, text = event.message.text, mid = event.message.mid;
  const inboundAt = Number(event.timestamp), expiresAt = inboundAt + 24 * 60 * 60 * 1000 - 60_000;
  if (!Number.isFinite(inboundAt) || inboundAt > Date.now() + 60_000 || Date.now() >= expiresAt) return;
  const session = sessionRef(a, r), receipt = receiptRef(a, 'dm', createHash('sha256').update(mid).digest('hex'));
  const stop = /^\s*(?:stop|unsubscribe|cancel)[.!?\s]*$/i.test(text) || isLinkOptOut(text);
  const handoff = requiresMindsetHumanHandoff(text);
  const email = novaEmail(text);
  const leadRef = db.collection('leads').doc(`novaspeed_${novaKey(a.id, r)}`);
  const response = await db.runTransaction(async tx => {
    const [guard, seen, lead] = await Promise.all([readGuard(tx, a, r), tx.get(receipt), tx.get(leadRef)]);
    if (seen.exists || !isNovaSpeedEnabled(guard.current)) return null;
    if (stop || handoff) {
      if (guard.allowed && guard.state?.status === 'awaiting_email' && novaOwnsSharedConversation(a, guard.state, guard.mindset)
        && millis(guard.state.expiresAt) > Date.now()) {
        writeNovaMessage(tx, a, guard.state, 'incoming:' + mid, text, 'Incoming', inboundAt, 'received', mid);
      }
      // Never overwrite a mismatched conversation or another brand's data.
      if (guard.state && !sessionMatches(guard.state, a, r)) return null;
      tx.create(receipt, { accountId: a.id, instagramUserId: r, status: 'stopped', createdAt: stamp() });
      tx.set(session, { accountId: a.id, ownerUserId: a.userId, instagramUserId: r,
        status: stop ? 'opted_out' : 'human_handoff', paused: true, updatedAt: stamp() }, { merge: true });
      return null;
    }
    const s = guard.state;
    if (!guard.allowed || s?.status !== 'awaiting_email' || !novaOwnsSharedConversation(a, s, guard.mindset)
      || millis(s.expiresAt) <= Date.now()
      || inboundAt < millis(s.reservedAt) - 60_000) return null;
    const existing = lead.data();
    if (existing && (existing.accountId !== a.id || existing.userId !== a.userId || existing.instagramUserId !== r)) return null;
    tx.create(receipt, { accountId: a.id, instagramUserId: r, status: 'reserved', createdAt: stamp() });
    writeNovaMessage(tx, a, s, 'incoming:' + mid, text, 'Incoming', inboundAt, 'received', mid);
    if (email) {
      tx.set(leadRef, { id: leadRef.id, userId: a.userId, accountId: a.id, instagramUserId: r,
        username: s.username || '', email, source: 'comment', automationId: 'novaspeed-comment-email',
        sourceCommentId: s.commentId, sourceMessageId: mid, conversationId: `${a.id}_${r}_${s.commentId}`, purpose: 'Requested NovaSpeed product information',
        emailVerified: false, marketingSubscribed: false, followUpEmailSent: false, createdAt: stamp() });
      tx.update(session, { status: 'email_collected', emailLeadId: leadRef.id, updatedAt: stamp() });
      queueNovaLead(tx, a, s, leadRef.id);
      return NOVASPEED_THANKS;
    }
    if (s.invalidPrompted) return null;
    tx.update(session, { invalidPrompted: true, updatedAt: stamp() });
    return NOVASPEED_INVALID;
  });
  if (!response) return;
  try {
    const guard = await fresh(a, r);
    if (!guard.allowed || !novaOwnsSharedConversation(a, guard.state, guard.mindset)) return;
    await recordNovaOutbound(a, guard.state, 'response:' + mid, response, 'attempt_reserved');
    let providerMessageId: string | undefined;
    const accepted = await sendInstagramDMOnce(r, response, guard.current!, expiresAt, (_accepted, id) => { providerMessageId = id; });
    await recordNovaOutbound(a, guard.state, 'response:' + mid, response, accepted ? 'accepted' : 'not_confirmed', providerMessageId);
    await receipt.update({ status: accepted ? 'accepted' : 'not_confirmed', updatedAt: stamp() });
  } catch {
    await receipt.update({ status: 'outcome_uncertain', updatedAt: stamp() });
  }
}

/** Save only explicit post-capture NovaSpeed notes or campaign-linked manual echoes.
 * Shared-account personal messages and other campaigns never inherit attribution. */
export async function handleNovaSpeedNoteOrEcho(event: any, a: InstagramAccount): Promise<boolean> {
  const echo = event?.message?.is_echo === true;
  const r = echo ? event?.recipient?.id : event?.sender?.id;
  const ownerId = echo ? event?.sender?.id : event?.recipient?.id;
  const text = event?.message?.text, mid = event?.message?.mid, at = Number(event?.timestamp);
  if (!isNovaSpeedEnabled(a) || !validNovaId(r) || ownerId !== a.instagramAccountId || r === a.instagramAccountId
    || typeof text !== 'string' || !text || text.length > 20000 || typeof mid !== 'string' || !mid || mid.length > 2048
    || event.message.reply_to?.story || event.message.attachments || event.message.quick_reply || event.postback
    || !Number.isFinite(at) || at > Date.now() + 60000 || at < Date.now() - 24 * 3600000) return false;
  const guard = await fresh(a, r), s = guard.state;
  if (!s || !isNovaSpeedEnabled(guard.current) || guard.gate?.optedOut || s.status === 'opted_out'
    || !sessionMatches(s, a, r) || !novaOwnsSharedConversation(a, s, guard.mindset)
    || millis(s.expiresAt) <= Date.now() || at < millis(s.reservedAt) - 60000
    || (!echo && !['email_collected', 'human_handoff'].includes(s.status)) || !['awaiting_email', 'email_collected', 'human_handoff'].includes(s.status)) return false;
  if (/^\s*(?:mindset|link|vault|jump|speed)[\s.!?,]*$/i.test(text) || isLinkOptOut(text) || requiresMindsetHumanHandoff(text)) return false;
  // A provider echo already linked to a recorded bot message is a duplicate.
  const link = await db.collection('novaspeed_message_links').doc(novaRecordId(a.id, mid)).get();
  if (echo && link.exists) return true;
  if (!await isExplicitNovaReply(a, s, event)) return false;
  return db.runTransaction(async tx => {
    const current = await readGuard(tx, a, r);
    const ref = receiptRef(a, 'note', createHash('sha256').update(mid).digest('hex'));
    const seen = await tx.get(ref);
    if (seen.exists) return true;
    if (!isNovaSpeedEnabled(current.current) || current.gate?.optedOut || current.state?.status === 'opted_out'
      || current.state?.commentId !== s.commentId || !novaOwnsSharedConversation(a, current.state, current.mindset)) return false;
    const id = writeNovaMessage(tx, a, s, (echo ? 'manual:' : 'incoming:') + mid, text, echo ? 'Outgoing' : 'Incoming', at, echo ? 'accepted' : 'received', mid);
    if (!id) return false;
    tx.create(ref, { accountId: a.id, ownerUserId: a.userId, campaignId: 'novaspeed-comment-email', status: 'note_saved', createdAt: stamp() });
    return true; // No automated reply is sent for these notes.
  });
}
