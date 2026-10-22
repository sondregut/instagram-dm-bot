import * as admin from 'firebase-admin';
import { db, InstagramAccount } from '../firebase';
import { NOVA_CAMPAIGN, novaRecordScope, queueNovaInterestJob } from './novaSpeedRecords';
import { matchesCommentKeyword } from '../utils/commentKeywordMatching';

export const novaContactId = (accountId: string, recipientId: string): string => `novaspeed_${accountId}_${recipientId}`;
export const novaCommentId = (accountId: string, commentId: string): string => `${accountId}_${commentId}`;
const validId = (v: any): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,180}$/.test(v);
export function novaUsername(v: any): string {
  return typeof v === 'string' && /^[A-Za-z0-9._]{1,30}$/.test(v) ? v.toLowerCase() : '';
}
export function novaProfileUrl(v: any): string {
  const username = novaUsername(v);
  return username ? `https://www.instagram.com/${username}/` : '';
}
export function novaPostUrl(v: any): string {
  if (typeof v !== 'string') return '';
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && ['instagram.com', 'www.instagram.com'].includes(u.hostname)
      && !u.username && !u.password && !u.port && /^\/(?:p|reel|tv)\/[A-Za-z0-9_-]+\/?$/.test(u.pathname)
      ? `https://www.instagram.com${u.pathname.replace(/\/?$/, '/')}` : '';
  } catch { return ''; }
}
const displayName = (v: any): string => typeof v === 'string' && v.trim().length <= 150
  && !/[\u0000-\u001f]/.test(v) ? v.trim() : '';

/** Capture only authenticated, qualifying NovaSpeed comment payloads. No profile lookup or send. */
export async function recordNovaInterest(a: InstagramAccount, event: any, receivedAt: number,
  commentAt: number, originalTimestamp: boolean): Promise<void> {
  if (!novaRecordScope(a) || !validId(event?.id) || !validId(event?.from?.id) || !validId(event?.media?.id)
    || event.from.id === a.instagramAccountId || novaUsername(event.from.username) === a.username
    || !matchesCommentKeyword(event.text, 'NOVASPEED') || !Number.isFinite(receivedAt) || !Number.isFinite(commentAt)) return;
  const contactId = novaContactId(a.id, event.from.id), commentId = novaCommentId(a.id, event.id);
  const contactRef = db.collection('novaspeed_contacts').doc(contactId), commentRef = db.collection('novaspeed_comments').doc(commentId);
  await db.runTransaction(async tx => {
    const [contact, comment] = await Promise.all([tx.get(contactRef), tx.get(commentRef)]);
    const prior = contact.data();
    if (comment.exists) return;
    if (prior && (prior.accountId !== a.id || prior.ownerUserId !== a.userId
      || prior.instagramUserId !== event.from.id || prior.campaignId !== NOVA_CAMPAIGN
      || !Number.isInteger(prior.commentCount) || prior.commentCount < 1)) throw new Error('NovaSpeed contact identity mismatch');
    const now = admin.firestore.Timestamp.now(), at = admin.firestore.Timestamp.fromMillis(commentAt);
    const username = novaUsername(event.from.username), name = displayName(event.from.name);
    const conversationId = `${a.id}_${event.from.id}_${event.id}`;
    tx.create(commentRef, { id: commentId, contactId, accountId: a.id, ownerUserId: a.userId,
      campaignId: NOVA_CAMPAIGN, instagramUserId: event.from.id, username, commentId: event.id,
      mediaId: event.media.id, conversationId, text: event.text, commentAt: at,
      timeEvidence: originalTimestamp ? 'Instagram webhook timestamp' : 'Webhook receipt time; original unavailable',
      observedAt: admin.firestore.Timestamp.fromMillis(receivedAt), postUrl: novaPostUrl(event.media.permalink),
      sourceEvidence: 'Authenticated Instagram webhook', createdAt: now, updatedAt: now });
    const latest = !prior || commentAt >= (prior.lastInterestAt?.toMillis?.() || 0);
    tx.set(contactRef, { id: contactId, accountId: a.id, ownerUserId: a.userId, campaignId: NOVA_CAMPAIGN,
      instagramUserId: event.from.id, ...(username && (latest || !prior?.username) ? { username, profileUrl: novaProfileUrl(username), profileEvidence: 'Username from Instagram webhook; URL derived' } : {}),
      ...(name && (latest || !prior?.displayName) ? { displayName: name } : {}),
      firstInterestAt: prior?.firstInterestAt && prior.firstInterestAt.toMillis() <= commentAt ? prior.firstInterestAt : at,
      ...(latest ? { lastInterestAt: at, lastCommentId: event.id, conversationId } : {}),
      commentCount: (prior?.commentCount || 0) + 1, createdAt: prior?.createdAt || now, updatedAt: now }, { merge: true });
    queueNovaInterestJob(tx, a, 'contact', contactId);
    queueNovaInterestJob(tx, a, 'comment', commentId);
  });
}

/** Refresh reporting after the send outcome; this queue never replays an Instagram event. */
export async function refreshNovaInterest(a: InstagramAccount, recipientId: string, commentId: string): Promise<void> {
  if (!novaRecordScope(a) || !validId(recipientId) || !validId(commentId)) return;
  const cid = novaContactId(a.id, recipientId), eid = novaCommentId(a.id, commentId);
  await db.runTransaction(async tx => {
    const [contact, comment] = await Promise.all([
      tx.get(db.collection('novaspeed_contacts').doc(cid)), tx.get(db.collection('novaspeed_comments').doc(eid)),
    ]);
    if (contact.exists) queueNovaInterestJob(tx, a, 'contact', cid);
    if (comment.exists) queueNovaInterestJob(tx, a, 'comment', eid);
  });
}
