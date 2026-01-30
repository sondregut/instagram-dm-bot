import { db, InstagramAccount, InstagramConfig } from '../firebase';
import { checkRateLimit, recordSentMessage } from '../utils/rateLimiter';
import { truncateMessage } from '../utils/validators';
import { decrypt } from '../utils/encryption';
import { getAccountByInstagramId, getAccountAccessToken } from './accounts';

const GRAPH_API_VERSION = 'v21.0';
// Instagram Business Login tokens use graph.instagram.com
const INSTAGRAM_GRAPH_API_BASE = `https://graph.instagram.com/${GRAPH_API_VERSION}`;
// Facebook Login tokens use graph.facebook.com (legacy)
const FACEBOOK_GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

interface InstagramAPIResponse {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Get Instagram configuration from Firestore (Legacy - for backwards compatibility)
 */
async function getLegacyConfig(): Promise<InstagramConfig | null> {
  const configDoc = await db.collection('config').doc('instagram').get();
  if (!configDoc.exists) {
    return null;
  }
  const config = configDoc.data() as InstagramConfig;

  // Only decrypt if token looks encrypted (contains colons from our format)
  if (config.accessToken && config.accessToken.includes(':')) {
    try {
      config.accessToken = decrypt(config.accessToken);
    } catch (error) {
      console.log('Token not encrypted or decryption failed, using as-is');
    }
  }

  return config;
}

/**
 * Get access token for an account (handles decryption)
 */
async function getAccessToken(account: InstagramAccount): Promise<string> {
  // Decrypt token if it looks encrypted
  if (account.accessToken && account.accessToken.includes(':')) {
    try {
      return decrypt(account.accessToken);
    } catch (error) {
      console.log('Token not encrypted or decryption failed, using as-is');
      return account.accessToken;
    }
  }
  return account.accessToken;
}

/**
 * Make authenticated request to Instagram/Facebook Graph API
 */
async function graphRequest(
  endpoint: string,
  accessToken: string,
  method: 'GET' | 'POST' = 'GET',
  body?: object,
  useInstagramApi: boolean = true  // Default to Instagram API for new tokens
): Promise<InstagramAPIResponse> {
  const baseUrl = useInstagramApi ? INSTAGRAM_GRAPH_API_BASE : FACEBOOK_GRAPH_API_BASE;
  const url = `${baseUrl}${endpoint}`;
  console.log(`[GraphAPI] ${method} ${url}`);

  const options: RequestInit = {
    method,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  };

  if (body && method === 'POST') {
    options.body = JSON.stringify(body);
    console.log(`[GraphAPI] Request body:`, JSON.stringify(body));
  }

  try {
    const response = await fetch(url, options);
    const data = await response.json();

    console.log(`[GraphAPI] Response status: ${response.status}`);
    console.log(`[GraphAPI] Response data:`, JSON.stringify(data));

    if (!response.ok) {
      console.error('[GraphAPI] Error:', data);
      return {
        success: false,
        error: data.error?.message || 'Unknown API error',
      };
    }

    return { success: true, data };
  } catch (error) {
    console.error('[GraphAPI] Request failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Request failed',
    };
  }
}

/**
 * Send a DM to an Instagram user (Multi-tenant version)
 * @param recipientId - Instagram user ID to send message to
 * @param message - Message content
 * @param account - Instagram account to send from (optional for backwards compatibility)
 */
export async function sendInstagramDM(
  recipientId: string,
  message: string,
  account?: InstagramAccount
): Promise<boolean> {
  console.log(`[Instagram] Attempting to send DM to ${recipientId}`);

  // Check rate limit (global or per-account in future)
  const rateLimit = await checkRateLimit(account?.id);
  if (!rateLimit.allowed) {
    console.log(`Rate limit reached. Remaining: ${rateLimit.remaining}, resets at: ${rateLimit.resetAt}`);
    // Queue for later delivery
    await queueMessage(recipientId, message, account?.id, account?.userId);
    return false;
  }

  try {
    let accessToken: string;
    let instagramAccountId: string;

    if (account) {
      // Multi-tenant: use provided account
      accessToken = await getAccessToken(account);
      instagramAccountId = account.instagramAccountId;
      console.log(`[Instagram] Using account: ${account.username} (${account.id})`);
    } else {
      // Legacy: use global config
      const config = await getLegacyConfig();
      if (!config) {
        console.error('[Instagram] No account or config provided');
        return false;
      }
      accessToken = config.accessToken;
      instagramAccountId = config.instagramAccountId;
      console.log('[Instagram] Using legacy config');
    }

    console.log(`[Instagram] Access token starts with: ${accessToken?.substring(0, 20)}...`);

    const truncatedMessage = truncateMessage(message);

    // Detect token type: Instagram tokens start with "IGAA" or "IG", Facebook tokens start with "EA" or other
    const isInstagramToken = accessToken?.startsWith('IGAA') || accessToken?.startsWith('IG');
    console.log(`[Instagram] Token type: ${isInstagramToken ? 'Instagram Business Login' : 'Facebook Login'}`);

    // Try using /me/messages endpoint with appropriate API
    const result = await graphRequest(
      `/me/messages`,
      accessToken,
      'POST',
      {
        recipient: { id: recipientId },
        message: { text: truncatedMessage },
      },
      isInstagramToken  // Use Instagram API for Instagram tokens
    );

    if (result.success) {
      await recordSentMessage(recipientId, 'dm', account?.id);
      console.log(`[Instagram] DM sent successfully to ${recipientId}`);
      return true;
    }

    console.error(`[Instagram] Failed to send DM to ${recipientId}:`, result.error);

    // If /me/messages failed, try with Instagram account ID
    console.log(`[Instagram] Retrying with instagramAccountId endpoint...`);
    const retryResult = await graphRequest(
      `/${instagramAccountId}/messages`,
      accessToken,
      'POST',
      {
        recipient: { id: recipientId },
        message: { text: truncatedMessage },
      },
      isInstagramToken
    );

    if (retryResult.success) {
      await recordSentMessage(recipientId, 'dm', account?.id);
      console.log(`[Instagram] DM sent successfully via instagramAccountId endpoint`);
      return true;
    }

    // Last resort: try the other API (fallback)
    console.log(`[Instagram] Trying fallback with ${isInstagramToken ? 'Facebook' : 'Instagram'} API...`);
    const fallbackResult = await graphRequest(
      `/${instagramAccountId}/messages`,
      accessToken,
      'POST',
      {
        recipient: { id: recipientId },
        message: { text: truncatedMessage },
      },
      !isInstagramToken  // Try opposite API
    );

    if (fallbackResult.success) {
      await recordSentMessage(recipientId, 'dm', account?.id);
      console.log(`[Instagram] DM sent successfully via fallback API`);
      return true;
    }

    console.error(`[Instagram] All attempts failed:`, fallbackResult.error);
    return false;
  } catch (error) {
    console.error(`[Instagram] Exception sending DM:`, error);
    return false;
  }
}

/**
 * Send a DM with quick reply buttons
 */
export async function sendQuickReplyDM(
  recipientId: string,
  message: string,
  quickReplies: { title: string; payload: string }[],
  account?: InstagramAccount
): Promise<boolean> {
  const rateLimit = await checkRateLimit(account?.id);
  if (!rateLimit.allowed) {
    await queueMessage(recipientId, message, account?.id, account?.userId);
    return false;
  }

  let accessToken: string;
  let pageId: string;

  if (account) {
    accessToken = await getAccessToken(account);
    pageId = account.pageId;
  } else {
    const config = await getLegacyConfig();
    if (!config) return false;
    accessToken = config.accessToken;
    pageId = config.pageId;
  }

  const result = await graphRequest(
    `/${pageId}/messages`,
    accessToken,
    'POST',
    {
      recipient: { id: recipientId },
      message: {
        text: truncateMessage(message),
        quick_replies: quickReplies.map(qr => ({
          content_type: 'text',
          title: qr.title.substring(0, 20), // Max 20 chars
          payload: qr.payload,
        })),
      },
    }
  );

  if (result.success) {
    await recordSentMessage(recipientId, 'dm', account?.id);
    return true;
  }

  return false;
}

/**
 * Get Instagram user profile
 */
export async function getInstagramUser(
  userId: string,
  account?: InstagramAccount
): Promise<{
  id: string;
  username: string;
  name?: string;
} | null> {
  let accessToken: string;

  if (account) {
    accessToken = await getAccessToken(account);
  } else {
    const config = await getLegacyConfig();
    if (!config) return null;
    accessToken = config.accessToken;
  }

  // Detect token type
  const isInstagramToken = accessToken?.startsWith('IGAA') || accessToken?.startsWith('IG');

  // Try Instagram API first for Instagram tokens
  const result = await graphRequest(
    `/${userId}?fields=id,username,name`,
    accessToken,
    'GET',
    undefined,
    isInstagramToken
  );

  if (result.success && result.data) {
    console.log(`[Instagram] Got user info for ${userId}: @${result.data.username}`);
    return result.data;
  }

  console.log(`[Instagram] Failed to get user info for ${userId}: ${result.error}`);

  // Try the other API as fallback
  const fallbackResult = await graphRequest(
    `/${userId}?fields=id,username,name`,
    accessToken,
    'GET',
    undefined,
    !isInstagramToken
  );

  if (fallbackResult.success && fallbackResult.data) {
    console.log(`[Instagram] Got user info via fallback for ${userId}: @${fallbackResult.data.username}`);
    return fallbackResult.data;
  }

  console.log(`[Instagram] All attempts to get user info failed for ${userId}`);
  return null;
}

/**
 * Get followers list (limited)
 */
export async function getFollowers(
  account: InstagramAccount,
  limit: number = 100
): Promise<{ id: string; username: string }[]> {
  const accessToken = await getAccessToken(account);

  const result = await graphRequest(
    `/${account.instagramAccountId}/followers?limit=${limit}&fields=id,username`,
    accessToken
  );

  if (result.success && result.data?.data) {
    return result.data.data;
  }

  return [];
}

/**
 * Get comments on a media post
 */
export async function getMediaComments(
  mediaId: string,
  account?: InstagramAccount
): Promise<any[]> {
  let accessToken: string;

  if (account) {
    accessToken = await getAccessToken(account);
  } else {
    const config = await getLegacyConfig();
    if (!config) return [];
    accessToken = config.accessToken;
  }

  const result = await graphRequest(
    `/${mediaId}/comments?fields=id,text,from,timestamp`,
    accessToken
  );

  if (result.success && result.data?.data) {
    return result.data.data;
  }

  return [];
}

/**
 * Reply to a comment
 */
export async function replyToComment(
  commentId: string,
  message: string,
  account?: InstagramAccount
): Promise<boolean> {
  let accessToken: string;

  if (account) {
    accessToken = await getAccessToken(account);
  } else {
    const config = await getLegacyConfig();
    if (!config) return false;
    accessToken = config.accessToken;
  }

  const result = await graphRequest(
    `/${commentId}/replies`,
    accessToken,
    'POST',
    { message: truncateMessage(message, 300) }
  );

  return result.success;
}

/**
 * Queue message for later delivery (when rate limited)
 */
async function queueMessage(
  recipientId: string,
  message: string,
  accountId?: string,
  userId?: string
): Promise<void> {
  await db.collection('message_queue').add({
    recipientId,
    message,
    accountId: accountId || null,
    userId: userId || null,
    status: 'pending',
    createdAt: new Date(),
    attempts: 0,
  });
  console.log(`Message queued for ${recipientId} (account: ${accountId || 'legacy'})`);
}

/**
 * Process queued messages for a specific account or all accounts
 */
export async function processMessageQueue(accountId?: string): Promise<number> {
  const rateLimit = await checkRateLimit(accountId);
  if (!rateLimit.allowed) {
    return 0;
  }

  let query: FirebaseFirestore.Query = db.collection('message_queue')
    .where('status', '==', 'pending')
    .orderBy('createdAt', 'asc')
    .limit(Math.min(rateLimit.remaining, 50));

  if (accountId) {
    query = query.where('accountId', '==', accountId);
  }

  const queue = await query.get();

  let processed = 0;

  for (const doc of queue.docs) {
    const { recipientId, message, accountId: msgAccountId, attempts } = doc.data();

    // Check rate limit before each send
    const currentLimit = await checkRateLimit(msgAccountId);
    if (!currentLimit.allowed) {
      break;
    }

    // Get account if specified
    let account: InstagramAccount | undefined;
    if (msgAccountId) {
      const acc = await getAccountByInstagramId(msgAccountId);
      if (acc) account = acc;
    }

    const sent = await sendInstagramDM(recipientId, message, account);

    if (sent) {
      await doc.ref.update({ status: 'sent', sentAt: new Date() });
      processed++;
    } else if (attempts >= 3) {
      await doc.ref.update({ status: 'failed', failedAt: new Date() });
    } else {
      await doc.ref.update({ attempts: attempts + 1 });
    }
  }

  return processed;
}

/**
 * Refresh access token for all accounts or a specific one
 */
export async function refreshAccessToken(accountId?: string): Promise<boolean> {
  if (accountId) {
    // Refresh specific account
    const { refreshAccountToken } = await import('../auth/instagram-oauth');
    return await refreshAccountToken(accountId);
  }

  // Legacy: refresh global config token
  const configDoc = await db.collection('config').doc('instagram').get();
  if (!configDoc.exists) {
    return false;
  }

  const config = configDoc.data() as InstagramConfig;
  const currentToken = decrypt(config.accessToken);

  const appId = process.env.INSTAGRAM_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;

  if (!appId || !appSecret) {
    console.error('Missing Instagram app credentials');
    return false;
  }

  try {
    const response = await fetch(
      `${FACEBOOK_GRAPH_API_BASE}/oauth/access_token?` +
      `grant_type=fb_exchange_token&` +
      `client_id=${appId}&` +
      `client_secret=${appSecret}&` +
      `fb_exchange_token=${currentToken}`
    );

    const data = await response.json();

    if (data.access_token) {
      const { encrypt } = await import('../utils/encryption');
      const encryptedToken = encrypt(data.access_token);

      // Token expires in ~60 days
      const expiresAt = new Date(Date.now() + (data.expires_in || 5184000) * 1000);

      await db.collection('config').doc('instagram').update({
        accessToken: encryptedToken,
        tokenExpiresAt: expiresAt,
      });

      console.log('Access token refreshed successfully');
      return true;
    }

    console.error('Token refresh failed:', data);
    return false;
  } catch (error) {
    console.error('Token refresh error:', error);
    return false;
  }
}

/**
 * Verify account connection is still valid
 */
export async function verifyAccountConnection(account: InstagramAccount): Promise<boolean> {
  try {
    const accessToken = await getAccessToken(account);

    const result = await graphRequest(
      `/me?fields=id,name`,
      accessToken
    );

    return result.success;
  } catch (error) {
    console.error('Error verifying account connection:', error);
    return false;
  }
}
