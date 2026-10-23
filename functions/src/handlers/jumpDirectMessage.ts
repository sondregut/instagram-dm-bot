import { createHash } from 'crypto';
import * as admin from 'firebase-admin';
import { db, InstagramAccount } from '../firebase';
import { sendInstagramDMOnce } from '../services/instagram';
import { isMindsetAccountAllowed } from '../services/mindsetCampaigns';
import { isMindsetDirectKeywordRequest, requiresMindsetHumanHandoff } from '../services/mindsetFlowLogic';
import { buildMindsetConversationId, isMindsetConversationIdentityMatch } from '../services/mindsetConversationIsolation';
import { getBotMode } from '../utils/runtimeMode';
import { isLinkOptOut } from '../services/linkRecoveryLogic';
import { isPoleVaultAccount, POLE_VAULT_ACCOUNT, POLE_VAULT_URL, POLE_VAULT_LINK_MESSAGE } from '../services/poleVaultAccount';

export const JUMP_DIRECT_ACCOUNTS = [
  { id: '75w5QJJQUa4TGOq8bwzZ', username: 'sondre_pv', instagramAccountId: '17841400489754274', campaignId: 'sondre-pv-jump-trackjump-all-posts' },
  { id: 'TXPgRGqp2Z6Rno7B2yzi', username: 'trackspeedapp', instagramAccountId: '17841437108874860', campaignId: 'trackspeedapp-jump-trackjump-all-posts' },
] as const;
const OWNER = 'uqBSZBen8DPLxIkzMFH8tRle62F3';
const URL = 'https://apps.apple.com/us/app/trackjump-jump-height-rsi/id6809517672';
const WINDOW_MS = 24 * 60 * 60 * 1000;
const COOLDOWN_MS = 60 * 1000;
// Keep a margin for network transit at the boundary of Meta's reply window.
const WINDOW_MARGIN_MS = 60 * 1000;

export interface JumpMessageEvent {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  postback?: unknown;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    is_self?: boolean;
    is_deleted?: boolean;
    app_id?: unknown;
    quick_reply?: unknown;
    attachments?: unknown[];
  };
}

export function jumpDirectTarget(event: JumpMessageEvent, account: InstagramAccount) {
  const targets = [...JUMP_DIRECT_ACCOUNTS, POLE_VAULT_ACCOUNT];
  const target = targets.find(candidate => candidate.id === account.id
    && candidate.username === account.username && candidate.instagramAccountId === account.instagramAccountId);
  const message = event.message;
  if (!target || account.userId !== OWNER || account.platform === 'facebook'
    || !account.isActive || account.connectionStatus !== 'connected'
    || !event.sender?.id || event.recipient?.id !== target.instagramAccountId
    || targets.some(candidate => candidate.instagramAccountId === event.sender?.id)
    || !message || message.is_echo || message.is_self || message.is_deleted || message.app_id
    || !message.mid || typeof message.mid !== 'string' || typeof message.text !== 'string'
    || message.quick_reply || event.postback || message.attachments?.length
    || /https?:\/\//i.test(message.text)
    || isLinkOptOut(message.text) || requiresMindsetHumanHandoff(message.text)
    || !isMindsetDirectKeywordRequest(message.text, isPoleVaultAccount(account) ? 'VAULT' : 'JUMP')) return null;
  return target;
}

/** Scoped standalone keyword route. Never creates or changes a campaign conversation. */
export async function handleJumpDirectMessage(event: JumpMessageEvent, account: InstagramAccount): Promise<boolean> {
  if (!['mindset', 'full'].includes(getBotMode()) || !isMindsetAccountAllowed(account)) return false;
  const vault = isPoleVaultAccount(account);
  const target = jumpDirectTarget(event, account);
  if (!target) return false;
  const receivedAt = event.timestamp;
  const now = Date.now();
  if (typeof receivedAt !== 'number' || !Number.isFinite(receivedAt)
    || receivedAt > now + COOLDOWN_MS || now >= receivedAt + WINDOW_MS - WINDOW_MARGIN_MS) return true;
  const senderId = event.sender!.id!;
  const mid = event.message!.mid!;
  const receiptId = createHash('sha256').update(`${account.id}:${mid}`).digest('hex');
  const receiptRef = db.collection('jump_dm_events').doc(receiptId);
  const conversationId = buildMindsetConversationId(account.id, senderId);
  const recipientRef = db.collection('jump_dm_recipients').doc(conversationId);
  const campaignRef = db.collection('mindset_campaigns').doc(target.campaignId);
  const leadRef = db.collection('mindset_leads').doc(conversationId);
  const reply = await db.runTransaction(async transaction => {
    const [receipt, recipient, campaign, lead] = await Promise.all([
      transaction.get(receiptRef), transaction.get(recipientRef), transaction.get(campaignRef), transaction.get(leadRef),
    ]);
    if (receipt.exists) return null;
    const config = campaign.data();
    if (!config || config.accountId !== account.id || config.ownerUserId !== account.userId
      || config.status !== 'live' || config.keyword !== (vault ? 'VAULT' : 'JUMP')
      || config.template !== (vault ? 'vault_tracker_download' : 'trackjump_download')
      || config.journey?.destinationUrl !== (vault ? POLE_VAULT_URL : URL)
      || config.journey?.linkMessage !== (vault ? POLE_VAULT_LINK_MESSAGE : 'Here you go!')) return null;
    const conversation = lead.data();
    if (lead.exists && (!conversation || !isMindsetConversationIdentityMatch(conversation, {
      documentId: conversationId, accountId: account.id, instagramUserId: senderId, ownerUserId: account.userId,
    }) || conversation.automationPaused || conversation.stage === 'human_handoff')) return null;
    if (conversation?.history?.some((h: any) => h.role === 'user'
      && h.campaignSessionId === conversation.campaignSessionId && isLinkOptOut(h.content || ''))) return null;
    const lastAttempt = recipient.data()?.lastAttemptAt?.toMillis();
    if (typeof lastAttempt === 'number' && now - lastAttempt < COOLDOWN_MS) return null;
    const at = admin.firestore.Timestamp.fromMillis(now);
    // Reserve before the external send. Even a crash or uncertain response cannot resend this MID.
    transaction.create(receiptRef, {
      accountId: account.id, ownerUserId: account.userId, recipientId: senderId,
      campaignId: target.campaignId, status: 'reserved', createdAt: at,
      expiresAt: admin.firestore.Timestamp.fromMillis(receivedAt + WINDOW_MS),
    });
    transaction.set(recipientRef, { accountId: account.id, recipientId: senderId, lastAttemptAt: at, template: config.template });
    return `${config.journey.linkMessage}\n\n${config.journey.destinationUrl}`;
  });
  if (!reply) return true;
  let sent = false;
  try {
    sent = await sendInstagramDMOnce(senderId, reply, account, receivedAt + WINDOW_MS - WINDOW_MARGIN_MS);
  } finally {
    await receiptRef.update({ status: sent ? 'sent' : 'not_confirmed', updatedAt: admin.firestore.Timestamp.now() });
  }
  return true;
}
