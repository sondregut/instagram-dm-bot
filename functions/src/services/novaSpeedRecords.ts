import * as admin from 'firebase-admin';
import { createHash } from 'crypto';
import { db, InstagramAccount } from '../firebase';

export const NOVA_CAMPAIGN = 'novaspeed-comment-email';
export const NOVA_IDENTITIES = [
  { id: '75w5QJJQUa4TGOq8bwzZ', userId: 'uqBSZBen8DPLxIkzMFH8tRle62F3', instagramAccountId: '17841400489754274', username: 'sondre_pv' },
  { id: '0HSg4vvkJeiiwgjkxIve', userId: 'uqBSZBen8DPLxIkzMFH8tRle62F3', instagramAccountId: '17841480064131939', username: 'novaspeedtiming' },
];
export const novaRecordScope = (a: any): boolean => NOVA_IDENTITIES.some(x => a && x.id === a.id
  && x.userId === a.userId && x.instagramAccountId === a.instagramAccountId && x.username === a.username && a.platform !== 'facebook');
export const novaHash = (value: string): string => createHash('sha256').update(value).digest('hex');
export const novaRecordId = (accountId: string, key: string): string => `${accountId}_${novaHash(key)}`;
export const novaConversationId = (a: InstagramAccount, s: any): string => `${a.id}_${s.instagramUserId}_${s.commentId}`;
const validSession = (a: InstagramAccount, s: any): boolean => novaRecordScope(a) && s?.accountId === a.id
  && s.ownerUserId === a.userId && s.campaignId === NOVA_CAMPAIGN && /^[A-Za-z0-9_-]{1,180}$/.test(s.instagramUserId || '')
  && /^[A-Za-z0-9_-]{1,180}$/.test(s.commentId || '');

/** Called inside the campaign's existing guard/receipt transaction. No Sheet/network work here. */
export function writeNovaMessage(tx: FirebaseFirestore.Transaction, a: InstagramAccount, s: any,
  key: string, text: string, direction: 'Incoming' | 'Outgoing', at: number,
  status: 'received' | 'attempt_reserved' | 'accepted' | 'not_confirmed' = 'received', providerMessageId?: string): string | null {
  if (!validSession(a, s) || typeof text !== 'string' || !text || text.length > 20000 || !Number.isFinite(at)) return null;
  const id = novaRecordId(a.id, key), ref = db.collection('novaspeed_messages').doc(id);
  const revision = status === 'received' || status === 'attempt_reserved' ? 1 : 2;
  tx.set(ref, { id, ownerUserId: a.userId, accountId: a.id, sourceAccount: a.username,
    campaignId: NOVA_CAMPAIGN, instagramUserId: s.instagramUserId, username: s.username || '',
    leadId: `novaspeed_${a.id}_${s.instagramUserId}`, conversationId: novaConversationId(a, s),
    commentId: s.commentId, direction, text, timestamp: admin.firestore.Timestamp.fromMillis(at), status,
    ...(providerMessageId ? { providerMessageId } : {}), revision, updatedAt: admin.firestore.Timestamp.now() }, { merge: true });
  // Only confirmed accepted outbound messages are exported. Reserved/uncertain
  // attempts remain in Firestore for diagnosis and can never cause a resend.
  if (direction === 'Incoming' || status === 'accepted') {
    tx.set(db.collection('novaspeed_sheet_outbox').doc('message_' + id),
      { kind: 'message', recordId: id, accountId: a.id, ownerUserId: a.userId, campaignId: NOVA_CAMPAIGN,
        revision, status: 'pending', updatedAt: admin.firestore.Timestamp.now() });
  }
  if (providerMessageId) tx.set(db.collection('novaspeed_message_links').doc(novaRecordId(a.id, providerMessageId)),
    { accountId: a.id, ownerUserId: a.userId, campaignId: NOVA_CAMPAIGN, conversationId: novaConversationId(a, s), messageId: id });
  return id;
}
export function queueNovaLead(tx: FirebaseFirestore.Transaction, a: InstagramAccount, s: any, leadId: string): void {
  if (!validSession(a, s) || leadId !== `novaspeed_${a.id}_${s.instagramUserId}`) return;
  tx.set(db.collection('novaspeed_sheet_outbox').doc('lead_' + leadId),
    { kind: 'lead', recordId: leadId, accountId: a.id, ownerUserId: a.userId, campaignId: NOVA_CAMPAIGN,
      conversationId: novaConversationId(a, s), revision: 1, status: 'pending', updatedAt: admin.firestore.Timestamp.now() });
}
export async function recordNovaOutbound(a: InstagramAccount, s: any, key: string, text: string,
  status: 'attempt_reserved' | 'accepted' | 'not_confirmed', providerMessageId?: string): Promise<void> {
  await db.runTransaction(async tx => {
    const ref = db.collection('novaspeed_messages').doc(novaRecordId(a.id, key));
    const existing = (await tx.get(ref)).data();
    // Preserve the time of the first send attempt on later acceptance/readback.
    writeNovaMessage(tx, a, s, key, text, 'Outgoing', existing?.timestamp?.toMillis?.() || Date.now(), status, providerMessageId);
  });
}
export async function isExplicitNovaReply(a: InstagramAccount, s: any, event: any): Promise<boolean> {
  if (!validSession(a, s)) return false;
  const text = event?.message?.text;
  if (typeof text === 'string' && /\bnovaspeed\b/i.test(text.normalize('NFKC'))) return true;
  const replyId = event?.message?.reply_to?.mid;
  if (typeof replyId !== 'string' || !replyId || replyId.length > 2048) return false;
  const link = (await db.collection('novaspeed_message_links').doc(novaRecordId(a.id, replyId)).get()).data();
  return Boolean(link && link.accountId === a.id && link.ownerUserId === a.userId && link.campaignId === NOVA_CAMPAIGN
    && link.conversationId === novaConversationId(a, s));
}
