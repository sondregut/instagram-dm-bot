import * as admin from 'firebase-admin';
import { db, InstagramAccount } from '../firebase';
import { isFollowerGateEnabled, isFollowerGateRecipientBlocked, containsOutboundLink, FOLLOWER_WINDOW_MS, FOLLOWER_WINDOW_MARGIN_MS } from './followerGatePolicy';
import { isMindsetAccountAllowed } from './mindsetCampaigns';
import { isMindsetConversationIdentityMatch } from './mindsetConversationIsolation';
import { isLinkOptOut, VERIFIED_APP_LINKS } from './linkRecoveryLogic';
import { classifyMindsetReplyForStage } from './mindsetFlowLogic';
import { getAccountAccessToken } from './accounts';
import { checkRateLimit, recordSentMessage } from '../utils/rateLimiter';

export const APP_LINK_FOLLOWUP_DELAY_MS = 8 * 60 * 60 * 1000;
const JOBS = 'app_link_followups';
const RECIPIENTS = 'app_link_followup_recipients';
const templates = Object.keys(VERIFIED_APP_LINKS) as Array<keyof typeof VERIFIED_APP_LINKS>;
const ms = (value: any): number => value?.toMillis?.() || 0;
const stamp = (value: number) => admin.firestore.Timestamp.fromMillis(value);
const terminal = (status: string, now: number) => ({ status, dueAt: admin.firestore.FieldValue.delete(), updatedAt: stamp(now) });
const conversation = (accountId: string, recipient: string) => `${accountId}_${recipient}`;
export const appLinkFollowUpId = (accountId: string, recipient: string, template: string): string => `${conversation(accountId, recipient)}_${template}`;
export function appLinkFollowUpsEnabled(account: InstagramAccount): boolean {
  const config = (account as any).appLinkFollowUp;
  return isFollowerGateEnabled(account) && isMindsetAccountAllowed(account) && account.isActive
    && account.connectionStatus === 'connected' && account.automationMode !== 'paused'
    && config?.enabled === true && config.policyVersion === 1 && config.delayMinutes === 480;
}
export function appLinkFollowUpCopy(template: keyof typeof VERIFIED_APP_LINKS): string {
  return `hi, just curious what you think of ${VERIFIED_APP_LINKS[template].name} so far if you’ve had a chance to try it yet`;
}

/** A real, newer recipient DM cancels pending reminders before routing the reply. */
export async function recordAppLinkFollowUpInteraction(account: InstagramAccount, recipient: string, incomingAt: number): Promise<void> {
  if (!appLinkFollowUpsEnabled(account)) return;
  const stateRef = db.collection(RECIPIENTS).doc(conversation(account.id, recipient));
  const refs = templates.map(t => db.collection(JOBS).doc(appLinkFollowUpId(account.id, recipient, t)));
  await db.runTransaction(async tx => {
    const [state, ...jobs] = await Promise.all([tx.get(stateRef), ...refs.map(r => tx.get(r))]);
    if (ms(state.data()?.lastInteractionAt) >= incomingAt) return;
    tx.set(stateRef, { accountId: account.id, recipientId: recipient, lastInteractionAt: stamp(incomingAt) }, { merge: true });
    for (const job of jobs) if (['pending', 'processing'].includes(job.data()?.status)
      && ms(job.data()?.incomingAt) < incomingAt) tx.update(job.ref, terminal('cancelled_user_replied', Date.now()));
  });
}

function blocked(account: InstagramAccount, item: any, receipt: any, gate: any, lead: any, state: any, now: number): string | null {
  if (!appLinkFollowUpsEnabled(account)) return 'disabled';
  if (!item || !templates.includes(item.template) || item.ownerUserId !== account.userId || item.accountId !== account.id
    || !/^[a-zA-Z0-9_-]{1,200}$/.test(item.recipientId || '') || item.recipientId === account.instagramAccountId) return 'identity';
  if (receipt?.status !== 'link_sent' || receipt.follows !== true || receipt.accountId !== account.id
    || receipt.recipientId !== item.recipientId || receipt.template !== item.template
    || ms(receipt.incomingAt) !== ms(item.incomingAt)) return 'unconfirmed_link';
  const incoming = ms(item.incomingAt); const expiry = ms(item.expiresAt);
  if (!incoming || !expiry || expiry > incoming + FOLLOWER_WINDOW_MS - FOLLOWER_WINDOW_MARGIN_MS
    || now >= expiry || incoming > now + 60000) return 'window_closed';
  if (isFollowerGateRecipientBlocked(gate, lead) || lead?.automationPaused || lead?.stage === 'human_handoff') return 'paused_or_opted_out';
  if (lead && !isMindsetConversationIdentityMatch(lead, { documentId: conversation(account.id, item.recipientId),
    accountId: account.id, instagramUserId: item.recipientId, ownerUserId: account.userId })) return 'identity';
  if ((lead?.history || []).some((h: any) => h.role === 'user' && h.campaignSessionId === lead.campaignSessionId
    && (isLinkOptOut(h.content || '') || /^stop[.!?]*$/i.test((h.content || '').trim())
      || classifyMindsetReplyForStage(h.content || '', 'awaiting_link_request') === 'not_interested'))) return 'opted_out';
  if (['appOpenedAt', 'firstRepStartedAt', 'firstRepCompletedAt', 'trialVerifiedAt', 'subscriptionVerifiedAt', 'trialStartedAt', 'subscribedAt'].some(k => lead?.[k])
    || ['completed', 'trial_claimed', 'subscription_claimed', 'trial_started', 'subscribed'].includes(lead?.stage)) return 'already_used_or_converted';
  if (Math.max(ms(state?.lastInteractionAt), ms(gate?.lastInboundAt), ms(lead?.lastUserInteractionAt)) > incoming) return 'user_replied';
  if (ms(lead?.lastAutomatedFollowUpAt) >= ms(item.linkDeliveredAt)
    || (ms(state?.lastFollowUpAttemptAt) && now - ms(state.lastFollowUpAttemptAt) < FOLLOWER_WINDOW_MS)) return 'already_reminded';
  return null;
}

/** Only an API-confirmed gate receipt can create a reminder; one per account/recipient/app. */
export async function enqueueAppLinkFollowUp(account: InstagramAccount, receiptId: string): Promise<boolean> {
  if (!appLinkFollowUpsEnabled(account)) return false;
  const receiptRef = db.collection('follower_gate_events').doc(receiptId);
  const initial = (await receiptRef.get()).data();
  if (!initial?.recipientId || !templates.includes(initial.template)) return false;
  const key = conversation(account.id, initial.recipientId);
  const ref = db.collection(JOBS).doc(appLinkFollowUpId(account.id, initial.recipientId, initial.template));
  return db.runTransaction(async tx => {
    const [job, receipt, gate, lead, state, currentAccount] = await Promise.all([tx.get(ref), tx.get(receiptRef),
      tx.get(db.collection('follower_gate_recipients').doc(key)), tx.get(db.collection('mindset_leads').doc(key)),
      tx.get(db.collection(RECIPIENTS).doc(key)), tx.get(db.collection('accounts').doc(account.id))]);
    if (job.exists || !currentAccount.exists) return false;
    const r = receipt.data(); const delivered = ms(r?.linkDeliveredAt) || ms(r?.updatedAt); const now = Date.now();
    const item = { accountId: account.id, ownerUserId: account.userId, recipientId: initial.recipientId, template: initial.template,
      receiptId, incomingAt: r?.incomingAt, expiresAt: r?.expiresAt, linkDeliveredAt: stamp(delivered),
      originalDueAt: stamp(delivered + APP_LINK_FOLLOWUP_DELAY_MS), dueAt: stamp(delivered + APP_LINK_FOLLOWUP_DELAY_MS),
      status: 'pending', createdAt: stamp(now), policyVersion: 1 };
    if (!delivered || delivered > now + 60000 || delivered < ms(r?.incomingAt)
      || delivered + APP_LINK_FOLLOWUP_DELAY_MS >= ms(r?.expiresAt)
      || blocked({ ...currentAccount.data(), id: account.id } as InstagramAccount, item, r, gate.data(), lead.data(), state.data(), now)) return false;
    tx.create(ref, item); return true;
  });
}

type Sender = (recipient: string, message: string, account: InstagramAccount, expires: number, authorize: () => Promise<boolean>) => Promise<boolean>;
/** One Meta POST, no message tags, retry, delayed queue, alternate host, or URL. */
export const sendAppLinkFollowUpOnce: Sender = async (recipient, message, account, expires, authorize) => {
  if (containsOutboundLink(message) || !appLinkFollowUpsEnabled(account) || Date.now() >= expires) return false;
  if (!(await checkRateLimit(account.id)).allowed) return false;
  const token = await getAccountAccessToken(account.id);
  if (!token?.startsWith('IG') || !await authorize() || Date.now() >= expires) return false;
  const response = await fetch('https://graph.instagram.com/v21.0/me/messages', { method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient: { id: recipient }, message: { text: message } }), signal: AbortSignal.timeout(10000) });
  const result = await response.json() as { message_id?: string };
  if (!response.ok || !result.message_id) return false;
  await recordSentMessage(recipient, 'dm', account.id); return true;
};

export async function processAppLinkFollowUps(send: Sender = sendAppLinkFollowUpOnce): Promise<number> {
  // Single-field index; completed/cancelled jobs lose dueAt and cannot starve this query.
  const due = await db.collection(JOBS).where('dueAt', '<=', stamp(Date.now())).limit(50).get(); let processed = 0;
  for (const candidate of due.docs) {
    const claimed = await db.runTransaction(async tx => {
      const current = await tx.get(candidate.ref);
      if (current.data()?.status !== 'pending' || ms(current.data()?.dueAt) > Date.now()) return false;
      tx.update(candidate.ref, { status: 'processing', dueAt: admin.firestore.FieldValue.delete(), updatedAt: stamp(Date.now()) }); return true;
    });
    if (!claimed) continue;
    const item = candidate.data(); const key = conversation(item.accountId, item.recipientId);
    const stateRef = db.collection(RECIPIENTS).doc(key); const leadRef = db.collection('mindset_leads').doc(key);
    try {
      const accountDoc = await db.collection('accounts').doc(item.accountId).get();
      const account = { ...accountDoc.data(), id: accountDoc.id } as InstagramAccount;
      const authorize = (reserve = true) => db.runTransaction(async tx => {
        const [job, freshAccount, receipt, gate, lead, state] = await Promise.all([tx.get(candidate.ref), tx.get(accountDoc.ref),
          tx.get(db.collection('follower_gate_events').doc(item.receiptId)), tx.get(db.collection('follower_gate_recipients').doc(key)), tx.get(leadRef), tx.get(stateRef)]);
        if (job.data()?.status !== 'processing') return false;
        const now = Date.now(); const reason = blocked({ ...freshAccount.data(), id: account.id } as InstagramAccount,
          item, receipt.data(), gate.data(), lead.data(), state.data(), now);
        if (reason) { tx.update(candidate.ref, terminal('cancelled_' + reason, now)); return false; }
        if (!reserve) return true;
        tx.update(candidate.ref, { status: 'dispatch_reserved', attemptAt: stamp(now), dueAt: admin.firestore.FieldValue.delete() });
        tx.set(stateRef, { accountId: account.id, recipientId: item.recipientId, lastFollowUpAttemptAt: stamp(now) }, { merge: true });
        return true;
      });
      if (!await authorize(false)) { processed++; continue; }
      const sent = await send(item.recipientId, appLinkFollowUpCopy(item.template), account, ms(item.expiresAt), () => authorize());
      const now = Date.now();
      await db.runTransaction(async tx => {
        const job = await tx.get(candidate.ref); const lead = await tx.get(leadRef);
        if (!['processing', 'dispatch_reserved'].includes(job.data()?.status)) return;
        tx.update(candidate.ref, { ...terminal(sent ? 'sent' : 'not_confirmed', now), ...(sent ? { sentAt: stamp(now) } : {}) });
        if (sent && lead.exists) tx.update(leadRef, { lastAutomatedFollowUpAt: stamp(now), updatedAt: stamp(now),
          history: admin.firestore.FieldValue.arrayUnion({ role: 'assistant', content: appLinkFollowUpCopy(item.template), at: stamp(now),
            source: 'automation', conversationId: key, ...(lead.data()?.campaignSessionId ? { campaignSessionId: lead.data()!.campaignSessionId } : {}) }) });
      });
    } catch (error) {
      console.error('[AppLinkFollowUp] Single attempt failed; no automatic retry', error instanceof Error ? error.name : 'unknown');
      await candidate.ref.update(terminal('not_confirmed', Date.now()));
    }
    processed++;
  }
  return processed;
}
