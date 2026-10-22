import { randomUUID } from 'crypto';
import * as admin from 'firebase-admin';
import { db, InstagramAccount } from '../firebase';
import { decrypt } from '../utils/encryption';
import { isFollowerGateEnabled, FOLLOWER_CHECK_MAX_AGE_MS, FOLLOWER_RECHECK_MS, FOLLOWER_ERROR_RECHECK_MS } from './followerGatePolicy';

export interface FollowerResult { follows: boolean | null; checkedAt: number; source: string; errorCode?: number; rateLimited?: boolean; }
const MAX_CHECKS_PER_ACCOUNT_HOUR = 200;

/** Strict, bounded read through the account's existing authorized token. No retry or host fallback. */
export async function fetchFollowerRelationship(account: InstagramAccount, recipientId: string): Promise<FollowerResult> {
  const checkedAt = Date.now();
  try {
    const token = account.accessToken.includes(':') ? decrypt(account.accessToken) : account.accessToken;
    if (!token || !token.startsWith('IG')) return { follows: null, checkedAt, source: 'unsupported_token' };
    const response = await fetch(`https://graph.instagram.com/v21.0/${encodeURIComponent(recipientId)}?fields=is_user_follow_business`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000),
    });
    const body = await response.json();
    return { follows: response.ok && typeof body.is_user_follow_business === 'boolean' ? body.is_user_follow_business : null,
      checkedAt: Date.now(), source: response.ok ? 'meta' : 'meta_error', rateLimited: response.status === 429,
      ...(typeof body.error?.code === 'number' ? { errorCode: body.error.code } : {}) };
  } catch { return { follows: null, checkedAt: Date.now(), source: 'request_error' }; }
}

export async function verifyFollower(account: InstagramAccount, recipientId: string, fresh: boolean = false): Promise<FollowerResult> {
  const now = Date.now();
  if (!isFollowerGateEnabled(account)) return { follows: null, checkedAt: now, source: 'scope_blocked' };
  const ref = db.collection('follower_checks').doc(`${account.id}_${recipientId}`);
  const rateRef = db.collection('follower_check_limits').doc(account.id);
  const nonce = randomUUID();
  const reserved = await db.runTransaction(async tx => {
    const [snapshot, rateSnapshot] = await Promise.all([tx.get(ref), tx.get(rateRef)]);
    const cached = snapshot.data(); const at = cached?.checkedAt?.toMillis?.() || 0;
    const ageLimit = cached?.follows === true ? FOLLOWER_CHECK_MAX_AGE_MS
      : cached?.follows === false ? FOLLOWER_RECHECK_MS : FOLLOWER_ERROR_RECHECK_MS;
    // Each admitted gate interaction checks Meta again; transient-error backoff
    // and transaction locks still hold the link instead of hammering the API.
    if (at > 0 && now - at < ageLimit && (!fresh || typeof cached?.follows !== 'boolean')) return { cached: { follows: cached?.follows === true ? true : cached?.follows === false ? false : null,
      checkedAt: at, source: 'cache' } as FollowerResult };
    if ((cached?.reservedUntil?.toMillis?.() || 0) > now) return { cached: { follows: null, checkedAt: now, source: 'check_in_progress' } as FollowerResult };
    const rate = rateSnapshot.data();
    if ((rate?.blockedUntil?.toMillis?.() || 0) > now) return { cached: { follows: null, checkedAt: now, source: 'meta_rate_backoff' } as FollowerResult };
    const windowStart = rate?.windowStart?.toMillis?.() || 0; const sameWindow = now - windowStart < 3600000;
    const count = sameWindow ? Number(rate?.count || 0) : 0;
    if (count >= MAX_CHECKS_PER_ACCOUNT_HOUR) return { cached: { follows: null, checkedAt: now, source: 'local_rate_limit' } as FollowerResult };
    tx.set(rateRef, { count: count + 1, windowStart: admin.firestore.Timestamp.fromMillis(sameWindow ? windowStart : now) }, { merge: true });
    tx.set(ref, { accountId: account.id, recipientId, nonce, reservedUntil: admin.firestore.Timestamp.fromMillis(now + 15000) }, { merge: true });
    return { cached: null };
  });
  if (reserved.cached) return reserved.cached;
  const result = await fetchFollowerRelationship(account, recipientId);
  await db.runTransaction(async tx => {
    const snapshot = await tx.get(ref); if (snapshot.data()?.nonce !== nonce) return;
    tx.set(ref, { follows: result.follows, checkedAt: admin.firestore.Timestamp.fromMillis(result.checkedAt),
      source: result.source, errorCode: result.errorCode || null, reservedUntil: admin.firestore.Timestamp.fromMillis(0) }, { merge: true });
    if (result.rateLimited || [4, 17, 32, 613].includes(result.errorCode || 0)) tx.set(rateRef, {
      blockedUntil: admin.firestore.Timestamp.fromMillis(Date.now() + 60000),
    }, { merge: true });
  });
  return result;
}
