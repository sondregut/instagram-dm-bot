import { db, InstagramAccount, InstagramConfig } from '../firebase';
import { checkRateLimit, recordSentMessage } from '../utils/rateLimiter';
import { truncateMessage } from '../utils/validators';
import { decrypt } from '../utils/encryption';
import { getAccountById, getAccountAccessToken } from './accounts';
import { isFollowerGateEnabled, protectFollowerOutbound, followerInboundExpiry, canDeliverFollowerProtectedContent } from './followerGatePolicy';
import {
  InstagramUserProfile,
  normalizeInstagramUserProfile,
} from './instagramProfileLogic';
import {
  buildMindsetConversationId,
  isMindsetConversationIdentityMatch,
} from './mindsetConversationIsolation';
import {
  getFacebookPagePosts,
  getFacebookUserProfile,
  isFacebookAccount,
  replyToFacebookComment,
  sendFacebookButtonDM,
  sendFacebookDM,
  sendFacebookPrivateReply,
  sendFacebookQuickReplyDM,
  verifyFacebookPageConnection,
} from './facebook';

const GRAPH_API_VERSION = 'v21.0';
// Instagram Business Login tokens use graph.instagram.com
const INSTAGRAM_GRAPH_API_BASE = `https://graph.instagram.com/${GRAPH_API_VERSION}`;
// Facebook Login tokens use graph.facebook.com (legacy)
const FACEBOOK_GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

interface InstagramAPIResponse {
  success: boolean;
  data?: any;
  error?: string;
  errorCode?: number;
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
    console.log('[GraphAPI] Request body prepared');
  }

  try {
    const response = await fetch(url, options);
    const data = await response.json();

    console.log(`[GraphAPI] Response status: ${response.status}`);
    if (!response.ok) {
      const errorCode = typeof data.error?.code === 'number' ? data.error.code : undefined;
      const endpointKind = /\/messages(?:\?|$)/.test(endpoint) ? 'messages'
        : /fields=id,username,name,profile_(?:pic|picture_url)/.test(endpoint) ? 'user_profile'
          : /\/replies(?:\?|$)/.test(endpoint) ? 'comment_reply' : 'other';
      console.error(JSON.stringify({ severity: 'ERROR', event: 'dm_graph_request_failed', method,
        endpointKind, host: useInstagramApi ? 'instagram' : 'facebook', httpStatus: response.status,
        errorCode: errorCode ?? null,
        errorSubcode: typeof data.error?.error_subcode === 'number' ? data.error.error_subcode : null,
        transient: data.error?.is_transient === true }));
      return {
        success: false,
        error: data.error?.message || 'Unknown API error',
        errorCode,
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
  account?: InstagramAccount,
  context?: { conversationId?: string }
): Promise<boolean> {
  if (account && isFollowerGateEnabled(account)) {
    return sendInstagramDMOnce(recipientId, message, account, followerInboundExpiry(account.id, recipientId));
  }
  if (account && isFacebookAccount(account)) {
    return sendFacebookDM(recipientId, message, account);
  }
  console.log(`[Instagram] Attempting to send DM to ${recipientId}`);

  // Check rate limit (global or per-account in future)
  const rateLimit = await checkRateLimit(account?.id);
  if (!rateLimit.allowed) {
    console.log(`Rate limit reached. Remaining: ${rateLimit.remaining}, resets at: ${rateLimit.resetAt}`);
    // Queue for later delivery
    await queueMessage(
      recipientId,
      message,
      account?.id,
      account?.userId,
      context?.conversationId
    );
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

/** Send an inbound-keyword reply once, without retries or delayed queue delivery. */
export async function sendInstagramDMOnce(
  recipientId: string,
  message: string,
  account: InstagramAccount,
  expiresAtMs: number,
  observeResult?: (accepted: boolean, messageId?: string) => void
): Promise<boolean> {
  if (isFacebookAccount(account) || !Number.isFinite(expiresAtMs) || Date.now() >= expiresAtMs) return false;
  if (!await protectFollowerOutbound(account, recipientId, message)) return false;
  const rateLimit = await checkRateLimit(account.id);
  if (!rateLimit.allowed) return false;
  const accessToken = await getAccessToken(account);
  if (Date.now() >= expiresAtMs || !canDeliverFollowerProtectedContent(account, recipientId, message)) return false;
  const result = await graphRequest('/me/messages', accessToken, 'POST', {
    recipient: { id: recipientId },
    message: { text: truncateMessage(message) },
  }, accessToken.startsWith('IG'));
  if (result.success) await recordSentMessage(recipientId, 'dm', account.id);
  // Optional observation is used only by the NovaSpeed conversation recorder.
  observeResult?.(result.success, typeof result.data?.message_id === 'string' ? result.data.message_id : undefined);
  // Ambiguous failures are not retried: Meta has no client idempotency key here.
  return result.success;
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
  if (account && isFollowerGateEnabled(account)) {
    return sendInstagramGatePromptOnce(recipientId, message, quickReplies, account, followerInboundExpiry(account.id, recipientId));
  }
  if (account && isFacebookAccount(account)) {
    return sendFacebookQuickReplyDM(recipientId, message, quickReplies, account);
  }
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

type InstagramRecipient = { id: string } | { comment_id: string };

/** Reserved comment event: one attempt, no host fallback, delayed queue or retry. */
export async function sendInstagramCommentPrivateReplyOnce(commentId: string, message: string,
  account: InstagramAccount, expiresAtMs: number,
  observeResult?: (accepted: boolean, messageId?: string) => void): Promise<boolean> {
  if (isFacebookAccount(account) || !Number.isFinite(expiresAtMs) || Date.now() >= expiresAtMs
    || !await protectFollowerOutbound(account, undefined, message)) return false;
  const rate = await checkRateLimit(account.id); if (!rate.allowed) return false;
  const token = await getAccessToken(account);
  if (Date.now() >= expiresAtMs) return false;
  const result = await graphRequest('/me/messages', token, 'POST',
    { recipient: { comment_id: commentId }, message: { text: truncateMessage(message) } }, true);
  if (result.success) await recordSentMessage(commentId, 'dm', account.id);
  observeResult?.(result.success, typeof result.data?.message_id === 'string' ? result.data.message_id : undefined);
  return result.success;
}

async function sendStructuredInstagramMessage(
  recipient: InstagramRecipient,
  message: object,
  account: InstagramAccount
): Promise<boolean> {
  const recipientId = 'id' in recipient ? recipient.id : undefined;
  if (!await protectFollowerOutbound(account, recipientId, message)) return false;
  const gated = isFollowerGateEnabled(account);
  if (gated && recipientId && Date.now() >= followerInboundExpiry(account.id, recipientId)) return false;
  const rateLimit = await checkRateLimit(account.id);
  if (!rateLimit.allowed) {
    console.warn(`[Instagram] Structured message blocked by rate limit for account ${account.id}`);
    return false;
  }

  const accessToken = await getAccessToken(account);
  const isInstagramToken = accessToken.startsWith('IGAA') || accessToken.startsWith('IG');
  const body = { recipient, message };
  const endpoints = ['/me/messages', `/${account.instagramAccountId}/messages`];

  for (const endpoint of endpoints) {
    const result = await graphRequest(endpoint, accessToken, 'POST', body, isInstagramToken);
    if (result.success) {
      const recipientKey = 'id' in recipient ? recipient.id : recipient.comment_id;
      await recordSentMessage(recipientKey, 'dm', account.id);
      return true;
    }
    if (gated) return false; // No ambiguous retry or alternate-host send for gated automation.
  }

  // Some older Facebook-login connections require the Facebook Graph host.
  const fallback = await graphRequest(
    `/${account.instagramAccountId}/messages`,
    accessToken,
    'POST',
    body,
    !isInstagramToken
  );

  if (fallback.success) {
    const recipientKey = 'id' in recipient ? recipient.id : recipient.comment_id;
    await recordSentMessage(recipientKey, 'dm', account.id);
    return true;
  }

  return false;
}

/** Gate prompts respond only to the initiating inbound event; never queue or retry. */
export async function sendInstagramGatePromptOnce(recipientId: string, message: string,
  quickReplies: { title: string; payload: string }[], account: InstagramAccount, expiresAtMs: number): Promise<boolean> {
  if (!Number.isFinite(expiresAtMs) || Date.now() >= expiresAtMs
    || !await protectFollowerOutbound(account, recipientId, message)) return false;
  const rate = await checkRateLimit(account.id); if (!rate.allowed) return false;
  const token = await getAccessToken(account);
  if (Date.now() >= expiresAtMs) return false;
  const result = await graphRequest('/me/messages', token, 'POST', { recipient: { id: recipientId },
    message: { text: truncateMessage(message), quick_replies: quickReplies.map(q => ({ content_type: 'text', title: q.title.substring(0, 20), payload: q.payload })) },
  }, token.startsWith('IG'));
  if (result.success) await recordSentMessage(recipientId, 'dm', account.id);
  return result.success;
}

/**
 * Send the one private reply allowed from an Instagram comment. The quick
 * reply opens the normal messaging window only after the person taps it.
 */
export async function sendInstagramPrivateReply(
  commentId: string,
  message: string,
  quickReplies: { title: string; payload: string }[],
  account: InstagramAccount
): Promise<boolean> {
  if (isFacebookAccount(account)) {
    return sendFacebookPrivateReply(commentId, message, account);
  }
  return sendStructuredInstagramMessage(
    { comment_id: commentId },
    {
      text: truncateMessage(message),
      quick_replies: quickReplies.map((reply) => ({
        content_type: 'text',
        title: reply.title.substring(0, 20),
        payload: reply.payload,
      })),
    },
    account
  );
}

export async function sendInstagramQuickReplyDM(
  recipientId: string,
  message: string,
  quickReplies: { title: string; payload: string }[],
  account: InstagramAccount
): Promise<boolean> {
  if (isFacebookAccount(account)) {
    return sendFacebookQuickReplyDM(recipientId, message, quickReplies, account);
  }
  return sendStructuredInstagramMessage(
    { id: recipientId },
    {
      text: truncateMessage(message),
      quick_replies: quickReplies.map((reply) => ({
        content_type: 'text',
        title: reply.title.substring(0, 20),
        payload: reply.payload,
      })),
    },
    account
  );
}

export async function sendInstagramButtonDM(
  recipientId: string,
  title: string,
  buttons: { title: string; url: string }[],
  account: InstagramAccount
): Promise<boolean> {
  if (isFacebookAccount(account)) {
    return sendFacebookButtonDM(recipientId, title, buttons, account);
  }
  return sendStructuredInstagramMessage(
    { id: recipientId },
    {
      attachment: {
        type: 'template',
        payload: {
          template_type: 'generic',
          elements: [{
            title: title.substring(0, 80),
            buttons: buttons.slice(0, 3).map((button) => ({
              type: 'web_url',
              title: button.title.substring(0, 20),
              url: button.url,
            })),
          }],
        },
      },
    },
    account
  );
}

/**
 * Get Instagram user profile (including profile picture)
 */
export async function getInstagramUser(
  userId: string,
  account?: InstagramAccount
): Promise<InstagramUserProfile | null> {
  if (account && isFacebookAccount(account)) {
    return getFacebookUserProfile(userId, account);
  }
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

  // Meta's messaging-user profile API currently returns profile_pic. Try the
  // matching Graph host first, then retain the older field as a compatibility
  // fallback for accounts still using Facebook Login.
  const profileFields = ['profile_pic', 'profile_picture_url'] as const;
  const graphHosts = [isInstagramToken, !isInstagramToken];
  let lastError = 'Unknown profile API error';

  for (const profileField of profileFields) {
    for (const useInstagramApi of graphHosts) {
      const result = await graphRequest(
        `/${userId}?fields=id,username,name,${profileField}`,
        accessToken,
        'GET',
        undefined,
        useInstagramApi
      );

      if (result.success && result.data) {
        const profile = normalizeInstagramUserProfile(result.data);
        if (profile) {
          console.log(`[Instagram] Got user info for ${userId}: @${profile.username}${profile.profile_picture_url ? ' (with profile pic)' : ''}`);
          return profile;
        }
        lastError = 'Profile response was missing an ID or username';
      } else {
        lastError = result.error || lastError;
        // These profile-access/auth failures are not fixed by changing hosts or fields.
        // Optional enrichment must not amplify one rejected GET into four requests.
        if (result.errorCode === 230 || result.errorCode === 190) return null;
      }
    }
  }

  console.log(`[Instagram] All attempts to get user info failed for ${userId}: ${lastError}`);
  return null;
}

/**
 * Get followers list (limited)
 */
export async function getFollowers(
  account: InstagramAccount,
  limit: number = 100
): Promise<{ id: string; username: string }[]> {
  if (isFacebookAccount(account)) return [];
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
  if (account && isFacebookAccount(account)) {
    return replyToFacebookComment(commentId, message, account);
  }
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
  userId?: string,
  conversationId?: string
): Promise<void> {
  await db.collection('message_queue').add({
    recipientId,
    message,
    accountId: accountId || null,
    userId: userId || null,
    conversationId: conversationId || null,
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
    const {
      recipientId,
      message,
      accountId: msgAccountId,
      userId: msgOwnerUserId,
      conversationId,
      attempts,
    } = doc.data();

    if (typeof recipientId !== 'string'
        || !recipientId
        || typeof message !== 'string'
        || !message) {
      await doc.ref.update({ status: 'failed_invalid_target', failedAt: new Date() });
      continue;
    }

    // Check rate limit before each send
    const currentLimit = await checkRateLimit(msgAccountId);
    if (!currentLimit.allowed) {
      break;
    }

    // Get account if specified
    let account: InstagramAccount | undefined;
    if (msgAccountId) {
      const acc = await getAccountById(msgAccountId);
      if (!acc || acc.id !== msgAccountId || acc.userId !== msgOwnerUserId) {
        await doc.ref.update({ status: 'cancelled_account_mismatch', failedAt: new Date() });
        continue;
      }
      account = acc;
    }

    if (conversationId) {
      if (!account
          || conversationId !== buildMindsetConversationId(account.id, recipientId)) {
        await doc.ref.update({ status: 'cancelled_isolation_violation', failedAt: new Date() });
        continue;
      }
      const leadSnapshot = await db.collection('mindset_leads').doc(conversationId).get();
      const lead = leadSnapshot.data();
      if (!leadSnapshot.exists || !lead || !isMindsetConversationIdentityMatch(lead, {
        documentId: conversationId,
        accountId: account.id,
        instagramUserId: recipientId,
        ownerUserId: account.userId,
      })) {
        await doc.ref.update({ status: 'cancelled_isolation_violation', failedAt: new Date() });
        continue;
      }
    }

    const sent = await sendInstagramDM(recipientId, message, account, { conversationId });

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
    const account = await getAccountById(accountId);
    if (account && isFacebookAccount(account)) {
      // Page tokens are renewed by reconnecting Facebook. The scheduled check
      // verifies the current token without running Instagram's refresh grant.
      return verifyFacebookPageConnection(account);
    }
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
    if (isFacebookAccount(account)) return verifyFacebookPageConnection(account);
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

/**
 * Instagram post data
 */
export interface InstagramPost {
  id: string;
  mediaType: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  mediaUrl?: string;
  thumbnailUrl?: string;
  caption?: string;
  timestamp: string;
  permalink?: string;
}

/**
 * Get user's Instagram posts/reels
 * Fetches posts from the Instagram Graph API with media info
 */
export async function getUserPosts(
  account: InstagramAccount,
  limit: number = 25
): Promise<InstagramPost[]> {
  if (isFacebookAccount(account)) return getFacebookPagePosts(account, limit);
  try {
    const accessToken = await getAccessToken(account);
    const isInstagramToken = accessToken?.startsWith('IGAA') || accessToken?.startsWith('IG');

    console.log(`[Instagram] Fetching posts for account ${account.username}`);

    // Fetch media list with fields
    const result = await graphRequest(
      `/${account.instagramAccountId}/media?fields=id,media_type,media_url,thumbnail_url,caption,timestamp,permalink&limit=${limit}`,
      accessToken,
      'GET',
      undefined,
      isInstagramToken
    );

    if (!result.success || !result.data?.data) {
      console.log(`[Instagram] Failed to fetch posts: ${result.error}`);

      // Try fallback with Facebook API
      const fallbackResult = await graphRequest(
        `/${account.instagramAccountId}/media?fields=id,media_type,media_url,thumbnail_url,caption,timestamp,permalink&limit=${limit}`,
        accessToken,
        'GET',
        undefined,
        !isInstagramToken
      );

      if (!fallbackResult.success || !fallbackResult.data?.data) {
        console.log(`[Instagram] Fallback also failed: ${fallbackResult.error}`);
        return [];
      }

      return formatPosts(fallbackResult.data.data);
    }

    return formatPosts(result.data.data);
  } catch (error) {
    console.error('[Instagram] Error fetching posts:', error);
    return [];
  }
}

/**
 * Format raw API response to InstagramPost objects
 */
function formatPosts(rawPosts: unknown[]): InstagramPost[] {
  return rawPosts.map((post: unknown) => {
    const p = post as {
      id: string;
      media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
      media_url?: string;
      thumbnail_url?: string;
      caption?: string;
      timestamp: string;
      permalink?: string;
    };
    return {
      id: p.id,
      mediaType: p.media_type,
      mediaUrl: p.media_url,
      thumbnailUrl: p.thumbnail_url || p.media_url, // Videos have thumbnail_url, images use media_url
      caption: p.caption,
      timestamp: p.timestamp,
      permalink: p.permalink,
    };
  });
}
