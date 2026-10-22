import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { db, InstagramAccount, OAuthState } from '../firebase';
import { encrypt } from '../utils/encryption';
import { generateToken } from '../utils/encryption';

/** Preserve numeric provider IDs before JSON.parse can round 64-bit integers. */
function parseInstagramJson(raw: string): any {
  return JSON.parse(raw.replace(/([,{]\s*"user_id"\s*:\s*)(\d+)(?=\s*[,}])/g, '$1"$2"'));
}

function exactInstagramUserId(value: unknown): string | null {
  const id = typeof value === 'string' ? value
    : typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : '';
  return /^\d{1,30}$/.test(id) ? id : null;
}

/** Token shape is separate from identity, which must be verified through /me. */
function parseInstagramCodeExchange(value: unknown, httpOk: boolean): { accessToken: string } | null {
  if (!httpOk || !value || typeof value !== 'object') return null;
  const root = value as Record<string, unknown>;
  if (root.error || root.error_type || root.error_message) return null;
  let item = root;
  if ('data' in root) {
    if (!Array.isArray(root.data) || root.data.length !== 1 || !root.data[0] || typeof root.data[0] !== 'object') return null;
    item = root.data[0] as Record<string, unknown>;
    if (item.error || item.error_type || item.error_message) return null;
  }
  if (typeof item.access_token !== 'string' || !item.access_token.trim() || /\s/.test(item.access_token)) return null;
  return { accessToken: item.access_token };
}

// Instagram Graph API version
const GRAPH_API_VERSION = 'v21.0';

// OAuth Configuration from environment variables (functions/.env)
const getOAuthConfig = () => ({
  appId: process.env.INSTAGRAM_APP_ID || '',
  appSecret: process.env.INSTAGRAM_APP_SECRET || '',
  redirectUri: process.env.OAUTH_REDIRECT_URI || '',
  webUrl: process.env.WEB_URL || 'https://athlete-mindset-dm-bot.vercel.app',
});

// Required permissions for Instagram Business Login
// These must match permissions enabled in Meta App Dashboard
const OAUTH_SCOPES = [
  'instagram_business_basic',
  'instagram_business_manage_messages',
  'instagram_business_manage_comments',
].join(',');

const INSTAGRAM_WEBHOOK_FIELDS = [
  'messages',
  'messaging_postbacks',
  'comments',
  'mentions',
].join(',');

async function subscribeInstagramAccountToWebhooks(
  instagramAccountId: string,
  accessToken: string
): Promise<boolean> {
  const subscriptionUrl = new URL(
    `https://graph.instagram.com/${GRAPH_API_VERSION}/${encodeURIComponent(instagramAccountId)}/subscribed_apps`
  );
  subscriptionUrl.searchParams.set('subscribed_fields', INSTAGRAM_WEBHOOK_FIELDS);

  try {
    const response = await fetch(subscriptionUrl.toString(), {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await response.json() as {
      success?: boolean;
      error?: { code?: number; type?: string };
    };
    if (response.ok && data.success === true) return true;

    console.error('[Instagram OAuth] Webhook subscription failed', {
      status: response.status,
      code: data.error?.code,
      type: data.error?.type,
    });
    return false;
  } catch (error) {
    console.error(
      '[Instagram OAuth] Webhook subscription request failed:',
      error instanceof Error ? error.message : 'unknown'
    );
    return false;
  }
}

/**
 * Generate OAuth URL for Instagram Business Login
 * This is a callable function that returns the OAuth URL
 */
export const getInstagramOAuthUrl = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const userId = context.auth.uid;
  const config = getOAuthConfig();

  if (!config.appId || !config.redirectUri) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'OAuth not configured. Set INSTAGRAM_APP_ID and OAUTH_REDIRECT_URI in functions/.env'
    );
  }

  // Generate secure state token for CSRF protection
  const stateToken = generateToken(32);

  // Store state in Firestore for verification
  const stateRef = db.collection('oauth_state').doc();
  const oauthState: OAuthState = {
    id: stateRef.id,
    userId,
    state: stateToken,
    redirectUrl: data?.redirectUrl || '/settings',
    createdAt: admin.firestore.Timestamp.now(),
    expiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 10 * 60 * 1000)), // 10 min expiry
  };
  await stateRef.set(oauthState);

  // Build Instagram Business Login OAuth URL
  const oauthUrl = new URL('https://www.instagram.com/oauth/authorize');
  oauthUrl.searchParams.set('client_id', config.appId);
  oauthUrl.searchParams.set('redirect_uri', config.redirectUri);
  oauthUrl.searchParams.set('scope', OAUTH_SCOPES);
  oauthUrl.searchParams.set('state', stateToken);
  oauthUrl.searchParams.set('response_type', 'code');
  // Enable all permissions in consent screen
  oauthUrl.searchParams.set('enable_fb_login', '0');
  oauthUrl.searchParams.set('force_authentication', '1');

  return {
    url: oauthUrl.toString(),
    state: stateToken,
  };
});

/**
 * OAuth callback handler - HTTP endpoint
 * Instagram redirects here after user authorizes
 */
export const instagramOAuthCallback = functions.https.onRequest(async (req, res) => {
  const config = getOAuthConfig();
  const { code, state, error, error_description } = req.query;

  // Handle OAuth errors
  if (error) {
    console.error('OAuth error:', error, error_description);
    res.redirect(`${config.webUrl}/settings?error=${encodeURIComponent(error as string)}`);
    return;
  }

  if (!code || !state) {
    console.error('Missing code or state');
    res.redirect(`${config.webUrl}/settings?error=missing_params`);
    return;
  }

  try {
    // Verify state token
    const stateQuery = await db.collection('oauth_state')
      .where('state', '==', state)
      .limit(1)
      .get();

    if (stateQuery.empty) {
      console.error('Invalid state token');
      res.redirect(`${config.webUrl}/settings?error=invalid_state`);
      return;
    }

    const stateDoc = stateQuery.docs[0];
    const oauthState = stateDoc.data() as OAuthState;

    // Check if state is expired
    if (oauthState.expiresAt.toDate() < new Date()) {
      await stateDoc.ref.delete();
      res.redirect(`${config.webUrl}/settings?error=state_expired`);
      return;
    }

    const userId = oauthState.userId;
    const redirectUrl = oauthState.redirectUrl || '/settings';

    // Delete used state token
    await stateDoc.ref.delete();

    // Exchange code for short-lived access token (Instagram Business Login)
    // This uses form-urlencoded POST to Instagram's token endpoint
    const tokenResponse = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: config.appId,
        client_secret: config.appSecret,
        grant_type: 'authorization_code',
        redirect_uri: config.redirectUri,
        code: code as string,
      }).toString(),
    });

    const tokenData = parseInstagramJson(await tokenResponse.text());

    const parsedToken = parseInstagramCodeExchange(tokenData, tokenResponse.ok);
    if (!parsedToken) {
      console.error('[Instagram OAuth] Invalid code exchange response', {
        httpStatus: tokenResponse.status,
        hasDataEnvelope: Array.isArray(tokenData?.data),
        hasTopLevelToken: typeof tokenData?.access_token === 'string',
      });
      res.redirect(`${config.webUrl}/settings?error=token_exchange_failed`);
      return;
    }

    console.log('[Instagram OAuth] Code exchange accepted', {
      responseShape: Array.isArray(tokenData?.data) ? 'data' : 'flat',
    });
    const shortLivedToken = parsedToken.accessToken;

    // Exchange for long-lived token (60 days) using Instagram Graph API
    const longLivedResponse = await fetch(
      `https://graph.instagram.com/access_token?` +
      `grant_type=ig_exchange_token&` +
      `client_secret=${config.appSecret}&` +
      `access_token=${shortLivedToken}`
    );

    const longLivedData = await longLivedResponse.json();

    if (longLivedData.error) {
      console.error('Long-lived token error:', longLivedData.error);
      // Fall back to short-lived token if long-lived exchange fails
      console.log('Using short-lived token as fallback');
    }

    const accessToken = longLivedData.access_token || shortLivedToken;
    const expiresIn = longLivedData.expires_in || 3600; // Default 1 hour for short-lived

    // Get Instagram user info
    const userResponse = await fetch(
      `https://graph.instagram.com/${GRAPH_API_VERSION}/me?` +
      `fields=user_id,username,name,account_type,profile_picture_url&` +
      `access_token=${accessToken}`
    );

    const userData = parseInstagramJson(await userResponse.text());
    const accountId = exactInstagramUserId(userData?.user_id);
    const username = userData?.username;

    if (!userResponse.ok || userData?.error || !accountId
      || typeof username !== 'string' || !/^[A-Za-z0-9._]{1,30}$/.test(username)) {
      console.error('[Instagram OAuth] Invalid verified profile', {
        httpStatus: userResponse.status,
        hasExactUserId: Boolean(accountId),
        hasUsername: typeof username === 'string',
        providerErrorCode: typeof userData?.error?.code === 'number' ? userData.error.code : null,
      });
      res.redirect(`${config.webUrl}/settings?error=user_info_failed`);
      return;
    }

    // Check if this Instagram account is already connected
    const existingAccount = await db.collection('accounts')
      .where('instagramAccountId', '==', accountId.toString())
      .limit(1)
      .get();

    if (!existingAccount.empty) {
      const existingOwner = (existingAccount.docs[0].data() as InstagramAccount).userId;
      if (existingOwner !== userId) {
        console.error('[Instagram OAuth] Account is already connected to another dashboard owner');
        res.redirect(`${config.webUrl}${redirectUrl}?error=account_already_connected`);
        return;
      }
    }

    const webhookSubscribed = await subscribeInstagramAccountToWebhooks(
      accountId.toString(),
      accessToken
    );
    const webhookSubscribedAt = webhookSubscribed
      ? admin.firestore.Timestamp.now()
      : undefined;

    if (!existingAccount.empty) {
      // Update existing account with new token
      const existingDoc = existingAccount.docs[0];
      await existingDoc.ref.update({
        username,
        pageName: userData.name || username,
        accessToken: encrypt(accessToken),
        tokenExpiresAt: admin.firestore.Timestamp.fromDate(
          new Date(Date.now() + expiresIn * 1000)
        ),
        webhookSubscribed,
        ...(webhookSubscribedAt ? { webhookSubscribedAt } : {}),
        isActive: true,
        connectionStatus: 'connected',
        updatedAt: admin.firestore.Timestamp.now(),
      });
    } else {
      // Create new account
      const accountRef = db.collection('accounts').doc();
      const newAccount: InstagramAccount = {
        id: accountRef.id,
        userId,
        username: username,
        instagramAccountId: accountId.toString(),
        pageId: '', // Not used in Instagram Business Login flow
        pageName: userData.name || username,
        accessToken: encrypt(accessToken),
        tokenExpiresAt: admin.firestore.Timestamp.fromDate(
          new Date(Date.now() + expiresIn * 1000)
        ),
        webhookSubscribed,
        ...(webhookSubscribedAt ? { webhookSubscribedAt } : {}),
        aiPersonality: {
          name: `${username}'s Assistant`,
          description: 'Instagram DM Assistant',
          systemPrompt: `You are a friendly Instagram DM assistant for @${username}.
Keep responses brief, helpful, and conversational.
Maximum 200 characters per response.
Be warm and authentic, not robotic.`,
          tone: 'friendly',
          goals: ['Answer questions', 'Be helpful', 'Collect contact info when appropriate'],
        },
        settings: {
          maxResponseLength: 200,
          collectEmail: false,
          collectPhone: false,
          autoWelcomeNewFollowers: false,
          businessHoursOnly: false,
          notifyOnNewLead: true,
          notifyOnHandoff: true,
        },
        isActive: true,
        connectionStatus: 'connected',
        createdAt: admin.firestore.Timestamp.now(),
      };

      await accountRef.set(newAccount);
    }

    // Redirect back to settings with success
    res.redirect(
      `${config.webUrl}${redirectUrl}?success=true&accounts=1&subscribed=${webhookSubscribed ? 1 : 0}`
    );
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.redirect(`${config.webUrl}/settings?error=internal_error`);
  }
});

/**
 * Disconnect an Instagram account
 */
export const disconnectInstagramAccount = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const { accountId } = data;
  if (!accountId) {
    throw new functions.https.HttpsError('invalid-argument', 'Account ID required');
  }

  const userId = context.auth.uid;

  // Verify ownership
  const accountDoc = await db.collection('accounts').doc(accountId).get();

  if (!accountDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Account not found');
  }

  const account = accountDoc.data() as InstagramAccount;

  if (account.userId !== userId) {
    throw new functions.https.HttpsError('permission-denied', 'Not your account');
  }

  // Deactivate account (don't delete to preserve history)
  await accountDoc.ref.update({
    isActive: false,
    connectionStatus: 'expired',
    updatedAt: admin.firestore.Timestamp.now(),
  });

  return { success: true };
});

/**
 * Refresh access token for an account (Instagram Business Login)
 * Long-lived tokens can be refreshed if they haven't expired yet
 */
export async function refreshAccountToken(accountId: string): Promise<boolean> {
  const config = getOAuthConfig();

  const accountDoc = await db.collection('accounts').doc(accountId).get();
  if (!accountDoc.exists) {
    return false;
  }

  const account = accountDoc.data() as InstagramAccount;
  const { decrypt } = await import('../utils/encryption');
  const currentToken = decrypt(account.accessToken);

  try {
    // Refresh long-lived token using Instagram Graph API
    const response = await fetch(
      `https://graph.instagram.com/refresh_access_token?` +
      `grant_type=ig_refresh_token&` +
      `access_token=${currentToken}`
    );

    const data = await response.json();

    if (data.access_token) {
      await accountDoc.ref.update({
        accessToken: encrypt(data.access_token),
        tokenExpiresAt: admin.firestore.Timestamp.fromDate(
          new Date(Date.now() + (data.expires_in || 5184000) * 1000)
        ),
        connectionStatus: 'connected',
        updatedAt: admin.firestore.Timestamp.now(),
      });
      return true;
    }

    // Token refresh failed, mark as expired
    console.error('Token refresh failed:', data.error);
    await accountDoc.ref.update({
      connectionStatus: 'expired',
      updatedAt: admin.firestore.Timestamp.now(),
    });
    return false;
  } catch (error) {
    console.error('Token refresh error:', error);
    await accountDoc.ref.update({
      connectionStatus: 'error',
      updatedAt: admin.firestore.Timestamp.now(),
    });
    return false;
  }
}

/**
 * Get all user's Instagram accounts
 */
export const getUserAccounts = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const userId = context.auth.uid;

  const accounts = await db.collection('accounts')
    .where('userId', '==', userId)
    .where('isActive', '==', true)
    .get();

  return accounts.docs.map(doc => {
    const account = doc.data() as InstagramAccount;
    // Don't send access token to client
    return {
      id: doc.id,
      username: account.username,
      instagramAccountId: account.instagramAccountId,
      pageName: account.pageName,
      aiPersonality: account.aiPersonality,
      settings: account.settings,
      connectionStatus: account.connectionStatus,
      webhookSubscribed: account.webhookSubscribed,
      tokenExpiresAt: account.tokenExpiresAt?.toDate().toISOString(),
      createdAt: account.createdAt?.toDate().toISOString(),
    };
  });
});

/**
 * Update account settings (AI personality, response settings, etc.)
 */
export const updateAccountSettings = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const { accountId, aiPersonality, settings } = data;

  if (!accountId) {
    throw new functions.https.HttpsError('invalid-argument', 'Account ID required');
  }

  const userId = context.auth.uid;

  // Verify ownership
  const accountDoc = await db.collection('accounts').doc(accountId).get();

  if (!accountDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Account not found');
  }

  const account = accountDoc.data() as InstagramAccount;

  if (account.userId !== userId) {
    throw new functions.https.HttpsError('permission-denied', 'Not your account');
  }

  // Build update object
  const updates: any = {
    updatedAt: admin.firestore.Timestamp.now(),
  };

  if (aiPersonality) {
    updates.aiPersonality = {
      ...account.aiPersonality,
      ...aiPersonality,
    };
  }

  if (settings) {
    updates.settings = {
      ...account.settings,
      ...settings,
    };
  }

  await accountDoc.ref.update(updates);

  return { success: true };
});
