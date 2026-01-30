import { db } from '../firebase';

const LIMIT = 200; // Instagram limit: 200 DMs per hour
const WINDOW_MS = 60 * 60 * 1000; // 1 hour in milliseconds

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

/**
 * Check if we can send a message within rate limits
 * @param accountId - Optional account ID for per-account rate limiting
 */
export async function checkRateLimit(accountId?: string): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = new Date(now - WINDOW_MS);

  let query: FirebaseFirestore.Query = db.collection('sent_messages')
    .where('timestamp', '>', windowStart);

  if (accountId) {
    query = query.where('accountId', '==', accountId);
  }

  const snapshot = await query.get();

  const count = snapshot.size;
  const remaining = Math.max(0, LIMIT - count);
  const resetAt = new Date(now + WINDOW_MS);

  return {
    allowed: count < LIMIT,
    remaining,
    resetAt,
  };
}

/**
 * Record a sent message for rate limiting
 * @param accountId - Optional account ID for per-account tracking
 */
export async function recordSentMessage(
  recipientId: string,
  messageType: 'dm' | 'comment_reply' = 'dm',
  accountId?: string
): Promise<void> {
  await db.collection('sent_messages').add({
    recipientId,
    messageType,
    accountId: accountId || null,
    timestamp: new Date(),
  });
}

/**
 * Clean up old rate limit records (run periodically)
 */
export async function cleanupRateLimitRecords(): Promise<number> {
  const cutoff = new Date(Date.now() - WINDOW_MS * 2); // Keep 2 hours for safety

  const snapshot = await db.collection('sent_messages')
    .where('timestamp', '<', cutoff)
    .limit(500) // Batch delete
    .get();

  const batch = db.batch();
  snapshot.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();

  return snapshot.size;
}

/**
 * Get current rate limit status
 * @param accountId - Optional account ID for per-account status
 */
export async function getRateLimitStatus(accountId?: string): Promise<{
  used: number;
  limit: number;
  remaining: number;
  windowMinutes: number;
}> {
  const result = await checkRateLimit(accountId);

  return {
    used: LIMIT - result.remaining,
    limit: LIMIT,
    remaining: result.remaining,
    windowMinutes: 60,
  };
}
