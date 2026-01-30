import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { db, InstagramAccount, OAuthState } from '../firebase';
import { encrypt } from '../utils/encryption';
import { generateToken } from '../utils/encryption';

// Instagram Graph API version
const GRAPH_API_VERSION = 'v21.0';

// OAuth Configuration from environment
const getOAuthConfig = () => {
  const config = functions.config();
  return {
    // Instagram App ID (from Instagram API setup, not Facebook App ID)
    appId: config.instagram?.app_id || process.env.INSTAGRAM_APP_ID,
    appSecret: config.instagram?.app_secret || process.env.INSTAGRAM_APP_SECRET,
    redirectUri: config.app?.oauth_redirect_uri || process.env.OAUTH_REDIRECT_URI,
    webUrl: config.app?.web_url || process.env.WEB_URL || 'https://instagram-dm-bot-app.web.app',
  };
};

// Required permissions for Instagram Business Login
// These must match permissions enabled in Meta App Dashboard
const OAUTH_SCOPES = [
  'instagram_business_basic',
  'instagram_business_manage_messages',
  'instagram_business_manage_comments',
].join(',');

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
      'OAuth not configured. Please set instagram.app_id and app.oauth_redirect_uri'
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

    const tokenData = await tokenResponse.json();

    if (tokenData.error_type || tokenData.error_message) {
      console.error('Token exchange error:', tokenData);
      res.redirect(`${config.webUrl}/settings?error=token_exchange_failed&details=${encodeURIComponent(tokenData.error_message || '')}`);
      return;
    }

    const shortLivedToken = tokenData.access_token;
    const instagramUserId = tokenData.user_id;

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

    const userData = await userResponse.json();

    if (userData.error) {
      console.error('User info error:', userData.error);
      res.redirect(`${config.webUrl}/settings?error=user_info_failed`);
      return;
    }

    const username = userData.username || `user_${instagramUserId}`;
    const accountId = userData.user_id || instagramUserId;

    // Check if this Instagram account is already connected
    const existingAccount = await db.collection('accounts')
      .where('instagramAccountId', '==', accountId.toString())
      .limit(1)
      .get();

    let savedAccountId: string;

    if (!existingAccount.empty) {
      // Update existing account with new token
      const existingDoc = existingAccount.docs[0];
      await existingDoc.ref.update({
        accessToken: encrypt(accessToken),
        tokenExpiresAt: admin.firestore.Timestamp.fromDate(
          new Date(Date.now() + expiresIn * 1000)
        ),
        connectionStatus: 'connected',
        updatedAt: admin.firestore.Timestamp.now(),
      });
      savedAccountId = existingDoc.id;
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
      savedAccountId = accountRef.id;
    }

    // Redirect back to settings with success
    res.redirect(
      `${config.webUrl}${redirectUrl}?success=true&accounts=1`
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
