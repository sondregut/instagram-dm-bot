import { db, InstagramConfig } from '../firebase';
import { checkRateLimit, recordSentMessage } from '../utils/rateLimiter';
import { truncateMessage } from '../utils/validators';
import { decrypt } from '../utils/encryption';

const GRAPH_API_VERSION = 'v18.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

interface InstagramAPIResponse {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Get Instagram configuration from Firestore
 */
async function getConfig(): Promise<InstagramConfig> {
  const configDoc = await db.collection('config').doc('instagram').get();
  if (!configDoc.exists) {
    throw new Error('Instagram configuration not found');
  }
  const config = configDoc.data() as InstagramConfig;

  // Only decrypt if token looks encrypted (contains colons from our format)
  // If saved unencrypted, use as-is
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
 * Make authenticated request to Instagram Graph API
 */
async function graphRequest(
  endpoint: string,
  method: 'GET' | 'POST' = 'GET',
  body?: object
): Promise<InstagramAPIResponse> {
  const config = await getConfig();

  const url = `${GRAPH_API_BASE}${endpoint}`;
  console.log(`[GraphAPI] ${method} ${url}`);

  const options: RequestInit = {
    method,
    headers: {
      'Authorization': `Bearer ${config.accessToken}`,
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
 * Send a DM to an Instagram user
 */
export async function sendInstagramDM(
  recipientId: string,
  message: string
): Promise<boolean> {
  console.log(`[Instagram] Attempting to send DM to ${recipientId}`);

  // Check rate limit
  const rateLimit = await checkRateLimit();
  if (!rateLimit.allowed) {
    console.log(`Rate limit reached. Remaining: ${rateLimit.remaining}, resets at: ${rateLimit.resetAt}`);
    // Queue for later delivery
    await queueMessage(recipientId, message);
    return false;
  }

  try {
    const config = await getConfig();
    console.log(`[Instagram] Got config - pageId: ${config.pageId}, instagramAccountId: ${config.instagramAccountId}`);
    console.log(`[Instagram] Access token starts with: ${config.accessToken?.substring(0, 20)}...`);

    const truncatedMessage = truncateMessage(message);

    // Try using /me/messages endpoint (standard for Instagram Messaging API)
    const result = await graphRequest(
      `/me/messages`,
      'POST',
      {
        recipient: { id: recipientId },
        message: { text: truncatedMessage },
      }
    );

    if (result.success) {
      await recordSentMessage(recipientId, 'dm');
      console.log(`[Instagram] DM sent successfully to ${recipientId}`);
      return true;
    }

    console.error(`[Instagram] Failed to send DM to ${recipientId}:`, result.error);

    // If /me/messages failed, try with Instagram account ID
    console.log(`[Instagram] Retrying with instagramAccountId endpoint...`);
    const retryResult = await graphRequest(
      `/${config.instagramAccountId}/messages`,
      'POST',
      {
        recipient: { id: recipientId },
        message: { text: truncatedMessage },
      }
    );

    if (retryResult.success) {
      await recordSentMessage(recipientId, 'dm');
      console.log(`[Instagram] DM sent successfully via instagramAccountId endpoint`);
      return true;
    }

    console.error(`[Instagram] Retry also failed:`, retryResult.error);
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
  quickReplies: { title: string; payload: string }[]
): Promise<boolean> {
  const rateLimit = await checkRateLimit();
  if (!rateLimit.allowed) {
    await queueMessage(recipientId, message);
    return false;
  }

  const config = await getConfig();

  const result = await graphRequest(
    `/${config.pageId}/messages`,
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
    await recordSentMessage(recipientId, 'dm');
    return true;
  }

  return false;
}

/**
 * Get Instagram user profile
 */
export async function getInstagramUser(userId: string): Promise<{
  id: string;
  username: string;
  name?: string;
} | null> {
  const result = await graphRequest(
    `/${userId}?fields=id,username,name`
  );

  if (result.success && result.data) {
    return result.data;
  }

  return null;
}

/**
 * Get followers list (limited)
 */
export async function getFollowers(
  accountId: string,
  limit: number = 100
): Promise<{ id: string; username: string }[]> {
  const result = await graphRequest(
    `/${accountId}/followers?limit=${limit}&fields=id,username`
  );

  if (result.success && result.data?.data) {
    return result.data.data;
  }

  return [];
}

/**
 * Get comments on a media post
 */
export async function getMediaComments(mediaId: string): Promise<any[]> {
  const result = await graphRequest(
    `/${mediaId}/comments?fields=id,text,from,timestamp`
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
  message: string
): Promise<boolean> {
  const result = await graphRequest(
    `/${commentId}/replies`,
    'POST',
    { message: truncateMessage(message, 300) }
  );

  return result.success;
}

/**
 * Queue message for later delivery (when rate limited)
 */
async function queueMessage(recipientId: string, message: string): Promise<void> {
  await db.collection('message_queue').add({
    recipientId,
    message,
    status: 'pending',
    createdAt: new Date(),
    attempts: 0,
  });
  console.log(`Message queued for ${recipientId}`);
}

/**
 * Process queued messages (called by scheduled function)
 */
export async function processMessageQueue(): Promise<number> {
  const rateLimit = await checkRateLimit();
  if (!rateLimit.allowed) {
    return 0;
  }

  const queue = await db.collection('message_queue')
    .where('status', '==', 'pending')
    .orderBy('createdAt', 'asc')
    .limit(Math.min(rateLimit.remaining, 50))
    .get();

  let processed = 0;

  for (const doc of queue.docs) {
    const { recipientId, message, attempts } = doc.data();

    // Check rate limit before each send
    const currentLimit = await checkRateLimit();
    if (!currentLimit.allowed) {
      break;
    }

    const sent = await sendInstagramDM(recipientId, message);

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
 * Refresh access token before expiry
 */
export async function refreshAccessToken(): Promise<boolean> {
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
      `${GRAPH_API_BASE}/oauth/access_token?` +
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
