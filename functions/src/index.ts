import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin (done in firebase.ts, but ensure it's loaded)
import './firebase';

// Import webhook handler
import { instagramWebhook } from './webhooks/instagram';
import { facebookWebhook } from './webhooks/facebook';

// Import handlers for scheduled functions
import { checkNewFollowers, getFollowerStats } from './handlers/followerHandler';

// Import services for API endpoints
import { processMessageQueue, refreshAccessToken, getUserPosts } from './services/instagram';
import { getLeads, getLeadStats, exportLeadsToCSV, deleteLead } from './services/leads';
import { cleanupRateLimitRecords, getRateLimitStatus } from './utils/rateLimiter';
import { getAllActiveAccounts } from './services/accounts';
import { db } from './firebase';

// Import OAuth handlers
import {
  getInstagramOAuthUrl,
  instagramOAuthCallback,
  disconnectInstagramAccount,
  getUserAccounts,
  updateAccountSettings,
} from './auth/instagram-oauth';
import {
  facebookOAuthCallback,
  getFacebookOAuthUrl,
} from './auth/facebook-oauth';

// Import knowledge base functions
import {
  addFAQ,
  removeFAQ,
  updateFAQs,
  addWebsite,
  removeWebsite,
  getKnowledgeBaseApi,
  deleteKnowledgeBase,
  generateAIPersonalityFromWebsite,
} from './services/knowledge';

// Import flow types and executor
import { Flow, FlowInput, validateFlow } from './models/flow';
import { processScheduledExecutions } from './services/flowExecutor';
import {
  processMindsetFollowUps,
  recordMindsetActivationLinkClick,
  recordMindsetActivationEvent,
  recordMindsetConversionEvent,
  recordMindsetDownloadClick,
} from './handlers/mindsetHandler';
import { getMindsetConversionSecret } from './services/mindsetConversionAuth';
import {
  hasValidBearerAuthorization,
  MindsetActivationEvent,
  MindsetConversionEvent,
} from './services/mindsetTrackingLogic';
import { isLegacyAutomationEnabled, isMindsetModeActive } from './utils/runtimeMode';
import {
  getMindsetCampaignsApi,
  getMindsetInbox,
  getMindsetOverview,
  saveMindsetCampaignApi,
  sendMindsetHumanReplyApi,
  setMindsetAutomationApi,
  simulateMindsetConversationApi,
} from './services/mindsetOperations';
import { refreshStaleMindsetLeadProfiles } from './services/mindsetProfiles';
import { shouldRefreshProfilePicture } from './services/instagramProfileLogic';

// ============================================
// WEBHOOK ENDPOINT
// ============================================

/**
 * Main Instagram webhook endpoint
 * URL: https://<region>-<project>.cloudfunctions.net/instagramWebhook
 */
export { instagramWebhook };
export { facebookWebhook };

// ============================================
// OAUTH ENDPOINTS
// ============================================

/**
 * Get OAuth URL for Instagram connection
 */
export { getInstagramOAuthUrl };

/**
 * OAuth callback handler (HTTP endpoint)
 */
export { instagramOAuthCallback };

/**
 * Disconnect an Instagram account
 */
export { disconnectInstagramAccount };

/**
 * Get user's connected accounts
 */
export { getUserAccounts };

/**
 * Update account settings (AI personality, etc.)
 */
export { updateAccountSettings };

/** Connect a Facebook Page and subscribe it to the isolated Page webhook. */
export { getFacebookOAuthUrl, facebookOAuthCallback };

// ============================================
// KNOWLEDGE BASE ENDPOINTS
// ============================================

export { addFAQ, removeFAQ, updateFAQs, addWebsite, removeWebsite, getKnowledgeBaseApi, deleteKnowledgeBase, generateAIPersonalityFromWebsite };

// Athlete Mindset operator dashboard
export {
  getMindsetCampaignsApi,
  getMindsetInbox,
  getMindsetOverview,
  saveMindsetCampaignApi,
  sendMindsetHumanReplyApi,
  setMindsetAutomationApi,
  simulateMindsetConversationApi,
};

// ============================================
// SCHEDULED FUNCTIONS
// ============================================

/**
 * Check for new followers every 15 minutes (all accounts)
 */
export const scheduledFollowerCheck = functions.pubsub
  .schedule('every 15 minutes')
  .onRun(async () => {
    if (!isLegacyAutomationEnabled()) {
      console.log('[Scheduled] Legacy follower checks are disabled');
      return null;
    }
    console.log('Running scheduled follower check for all accounts...');
    const result = await checkNewFollowers();
    console.log(`Follower check complete: ${result.accountsProcessed} accounts, ${result.totalNewFollowers} new followers, ${result.totalDmsSent} DMs sent`);
    return null;
  });

/**
 * Process queued messages every 5 minutes
 */
export const scheduledMessageQueueProcess = functions.pubsub
  .schedule('every 5 minutes')
  .onRun(async () => {
    if (!isLegacyAutomationEnabled()) {
      console.log('[Scheduled] Legacy message queue is disabled');
      return null;
    }
    console.log('Processing message queue...');
    const processed = await processMessageQueue();
    console.log(`Processed ${processed} queued messages`);
    return null;
  });

/**
 * Refresh access tokens weekly for all accounts
 */
export const scheduledTokenRefresh = functions.pubsub
  .schedule('every monday 03:00')
  .timeZone('UTC')
  .onRun(async () => {
    console.log('Refreshing access tokens for all accounts...');

    const accounts = await getAllActiveAccounts();
    let refreshed = 0;
    let failed = 0;

    for (const account of accounts) {
      try {
        const success = await refreshAccessToken(account.id);
        if (success) {
          refreshed++;
        } else {
          failed++;
        }
      } catch (error) {
        console.error(`Error refreshing token for account ${account.id}:`, error);
        failed++;
      }
    }

    console.log(`Token refresh complete: ${refreshed} refreshed, ${failed} failed`);
    return null;
  });

/**
 * Clean up old rate limit records daily
 */
export const scheduledRateLimitCleanup = functions.pubsub
  .schedule('every day 04:00')
  .timeZone('UTC')
  .onRun(async () => {
    console.log('Cleaning up rate limit records...');
    const deleted = await cleanupRateLimitRecords();
    console.log(`Deleted ${deleted} old rate limit records`);
    return null;
  });

/**
 * Refresh profile pictures for active contacts daily
 * Instagram profile picture URLs expire, so we need to refresh them periodically
 */
export const scheduledProfilePictureRefresh = functions.pubsub
  .schedule('every day 05:00')
  .timeZone('UTC')
  .onRun(async () => {
    console.log('Refreshing profile pictures for active contacts...');

    const { getInstagramUser } = await import('./services/instagram');

    // Get all active accounts
    const accounts = await getAllActiveAccounts();

    let totalRefreshed = 0;
    let totalFailed = 0;
    let mindsetProfilesAttempted = 0;
    let mindsetProfilesUpdated = 0;

    for (const account of accounts) {
      try {
        // Firestore `field == null` queries exclude older documents where the
        // field is absent entirely. Read this account's bounded contact set and
        // evaluate missing, failed, and stale profile data in code instead.
        const contactSnapshot = await db.collection('conversations')
          .where('accountId', '==', account.id)
          .limit(500)
          .get();
        const nowMillis = Date.now();
        const contactsToUpdate = contactSnapshot.docs
          .filter((doc) => {
            const data = doc.data();
            return shouldRefreshProfilePicture(
              data.profilePictureUpdatedAt?.toMillis?.(),
              data.profilePictureRefreshAttemptedAt?.toMillis?.(),
              nowMillis
            );
          })
          .sort((first, second) => {
            const firstData = first.data();
            const secondData = second.data();
            const missingDifference = Number(!secondData.profilePictureUrl)
              - Number(!firstData.profilePictureUrl);
            if (missingDifference !== 0) return missingDifference;
            return (secondData.lastMessageAt?.toMillis?.() || 0)
              - (firstData.lastMessageAt?.toMillis?.() || 0);
          })
          .slice(0, 50); // Bound Meta API work per account and daily run.

        for (const doc of contactsToUpdate) {
          const docId = doc.id;
          const contactData = doc.data();
          const instagramUserId = contactData?.instagramUserId;

          if (!instagramUserId) continue;

          const attemptedAt = admin.firestore.Timestamp.now();
          try {
            const userInfo = await getInstagramUser(instagramUserId, account);

            if (userInfo?.profile_picture_url) {
              await db.collection('conversations').doc(docId).update({
                profilePictureUrl: userInfo.profile_picture_url,
                profilePictureUpdatedAt: attemptedAt,
                profilePictureRefreshAttemptedAt: attemptedAt,
                username: userInfo.username || contactData.username,
                // Also update name if we have it
                ...(userInfo.name && { 'collectedData.name': userInfo.name }),
              });
              totalRefreshed++;
            } else {
              await db.collection('conversations').doc(docId).update({
                profilePictureRefreshAttemptedAt: attemptedAt,
              });
              totalFailed++;
            }

            // Small delay to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 200));
          } catch (error) {
            console.error(`Failed to refresh profile for ${instagramUserId}:`, error);
            await db.collection('conversations').doc(docId).update({
              profilePictureRefreshAttemptedAt: attemptedAt,
            }).catch(() => undefined);
            totalFailed++;
          }
        }

        const mindsetRefresh = await refreshStaleMindsetLeadProfiles(account);
        mindsetProfilesAttempted += mindsetRefresh.attempted;
        mindsetProfilesUpdated += mindsetRefresh.updated;
      } catch (error) {
        console.error(`Error processing account ${account.id}:`, error);
      }
    }

    console.log(
      `Profile picture refresh complete: ${totalRefreshed} contacts refreshed, `
      + `${totalFailed} contact failures, ${mindsetProfilesUpdated}/${mindsetProfilesAttempted} `
      + 'Athlete Mindset profiles updated'
    );
    return null;
  });

/**
 * Process scheduled flow executions every minute
 */
export const scheduledFlowExecutionProcess = functions.pubsub
  .schedule('every 1 minutes')
  .onRun(async () => {
    if (!isLegacyAutomationEnabled()) {
      console.log('[Scheduled] Legacy flow executions are disabled');
      return null;
    }
    console.log('Processing scheduled flow executions...');
    const processed = await processScheduledExecutions();
    console.log(`Processed ${processed} scheduled executions`);
    return null;
  });

/**
 * Process only Athlete Mindset follow-ups. Test mode remains account- and
 * keyword-allowlisted inside the handler.
 */
export const scheduledMindsetFollowUps = functions.pubsub
  .schedule('every 5 minutes')
  .onRun(async () => {
    if (!isMindsetModeActive()) {
      console.log('[Scheduled] Athlete Mindset follow-ups are disabled');
      return null;
    }
    const processed = await processMindsetFollowUps();
    console.log(`[Scheduled] Processed ${processed} Athlete Mindset follow-ups`);
    return null;
  });

/** Record the download-link click before redirecting to the public app route. */
export const mindsetDownload = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'GET') {
    res.sendStatus(405);
    return;
  }
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  const destination = await recordMindsetDownloadClick(token);
  if (!destination) {
    res.status(404).send('This download link is invalid or expired.');
    return;
  }
  res.redirect(302, destination);
});

function escapeMindsetHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function serializeMindsetScriptValue(value: string): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function mindsetOpenDocument(appUrl: string, fallbackUrl: string): string {
  const safeAppUrl = escapeMindsetHtml(appUrl);
  const safeFallbackUrl = escapeMindsetHtml(fallbackUrl);
  const serializedAppUrl = serializeMindsetScriptValue(appUrl);
  return `<!doctype html>
<html lang="en" data-waiting="false">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="robots" content="noindex, nofollow">
  <title>Opening Athlete Mindset…</title>
  <style>
    :root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #12243b; background: #f7f3eb; }
    * { box-sizing: border-box; }
    body { min-height: 100dvh; margin: 0; padding: 24px; display: grid; place-items: center; }
    main { width: min(100%, 420px); padding: 34px 26px 28px; border: 1px solid rgba(18,36,59,.12); border-radius: 26px; background: #fffdf8; box-shadow: 0 24px 60px rgba(18,36,59,.12); text-align: center; }
    h1 { margin: 0; font-size: clamp(1.8rem, 8vw, 2.45rem); letter-spacing: -.055em; line-height: 1; }
    p { margin: 13px auto 0; max-width: 31ch; color: #647386; line-height: 1.45; }
    .actions { margin-top: 26px; display: grid; gap: 10px; }
    a { min-height: 50px; padding: 0 18px; display: grid; place-items: center; border-radius: 14px; font-weight: 750; text-decoration: none; }
    .primary { background: #12243b; color: #fffdf8; }
    .secondary { border: 1px solid rgba(18,36,59,.14); color: #12243b; }
    .waiting { display: none; font-size: .84rem; }
    html[data-waiting="true"] .waiting { display: block; }
  </style>
</head>
<body>
  <main>
    <h1>Open Athlete Mindset</h1>
    <p>Continue straight to your first mental rep.</p>
    <div class="actions">
      <a class="primary" href="${safeAppUrl}">Open Athlete Mindset</a>
      <a class="secondary" href="${safeFallbackUrl}">Get the app</a>
      <p class="waiting">If Instagram keeps you here, tap <strong>Open Athlete Mindset</strong> above.</p>
    </div>
  </main>
  <script>
    (() => {
      const appUrl = ${serializedAppUrl};
      window.setTimeout(() => { window.location.href = appUrl; }, 100);
      window.setTimeout(() => { document.documentElement.dataset.waiting = "true"; }, 1400);
    })();
  </script>
</body>
</html>`;
}

/** Instagram-safe handoff into the installed app, with App Store fallback. */
export const mindsetOpen = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'GET') {
    res.sendStatus(405);
    return;
  }
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  const destination = await recordMindsetActivationLinkClick(token);
  if (!destination) {
    res.status(404).send('This app link is invalid or expired.');
    return;
  }
  res.set({
    'Cache-Control': 'private, no-store',
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'",
    'X-Robots-Tag': 'noindex, nofollow',
  });
  res.status(200).send(mindsetOpenDocument(destination.appUrl, destination.fallbackUrl));
});

/** Accept monotonic in-app activation milestones for an opaque DM lead token. */
export const mindsetActivationEvent = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.sendStatus(405);
    return;
  }
  const token = typeof req.body?.token === 'string' ? req.body.token : '';
  const event = req.body?.event;
  if (!['app_opened', 'first_rep_started', 'first_rep_completed', 'paywall_viewed'].includes(event)) {
    res.status(400).json({ ok: false });
    return;
  }
  const ok = await recordMindsetActivationEvent(token, event as MindsetActivationEvent);
  res.status(ok ? 200 : 404).json({ ok });
});

/** Accept RevenueCat-verified trial and paid events from the Athlete Mindset backend. */
export const mindsetConversionEvent = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.sendStatus(405);
    return;
  }

  const expectedSecret = await getMindsetConversionSecret();
  if (!expectedSecret) {
    res.status(503).json({ ok: false });
    return;
  }
  if (!hasValidBearerAuthorization(req.headers.authorization, expectedSecret)) {
    res.status(401).json({ ok: false });
    return;
  }

  const token = typeof req.body?.token === 'string' ? req.body.token : '';
  const event = req.body?.event;
  const sourceEventId = typeof req.body?.sourceEventId === 'string' ? req.body.sourceEventId : undefined;
  if (!['trial_started', 'subscribed'].includes(event)) {
    res.status(400).json({ ok: false });
    return;
  }

  const ok = await recordMindsetConversionEvent(
    token,
    event as MindsetConversionEvent,
    sourceEventId
  );
  res.status(ok ? 200 : 404).json({ ok });
});

// ============================================
// API ENDPOINTS (for dashboard)
// ============================================

/**
 * Get dashboard statistics (filtered by user and optionally account)
 */
export const getDashboardStats = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const userId = context.auth.uid;
  const { accountId } = data || {};

  const [leadStats, followerStats, rateLimit] = await Promise.all([
    getLeadStats(userId, accountId),
    getFollowerStats(accountId),
    getRateLimitStatus(accountId),
  ]);

  // Get conversation stats for user/account
  let conversationQuery: FirebaseFirestore.Query = db.collection('conversations')
    .where('userId', '==', userId);

  if (accountId) {
    conversationQuery = conversationQuery.where('accountId', '==', accountId);
  }

  const allConversations = await conversationQuery.get();
  const activeConversations = allConversations.docs.filter(doc => {
    const data = doc.data();
    return ['ai_chat', 'collecting_email', 'collecting_phone'].includes(data.conversationState);
  });

  return {
    leads: leadStats,
    followers: followerStats,
    conversations: {
      total: allConversations.size,
      active: activeConversations.length,
    },
    rateLimit,
  };
});

/**
 * Get leads with pagination (filtered by user)
 */
export const getLeadsApi = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const userId = context.auth.uid;
  const { accountId, source, automationId, hasEmail, hasPhone, limit, startAfter } = data || {};

  return await getLeads(userId, {
    accountId,
    source,
    automationId,
    hasEmail,
    hasPhone,
    limit: limit || 50,
    startAfter,
  });
});

/**
 * Export leads to CSV
 */
export const exportLeads = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const userId = context.auth.uid;
  const { accountId, source, automationId, hasEmail, startDate, endDate } = data || {};

  const csv = await exportLeadsToCSV(userId, {
    accountId,
    source,
    automationId,
    hasEmail,
    startDate: startDate ? new Date(startDate) : undefined,
    endDate: endDate ? new Date(endDate) : undefined,
  });

  return { csv };
});

/**
 * Delete a lead
 */
export const deleteLeadApi = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const userId = context.auth.uid;
  const { leadId } = data;

  if (!leadId) {
    throw new functions.https.HttpsError('invalid-argument', 'Lead ID required');
  }

  const success = await deleteLead(leadId, userId);
  return { success };
});

/**
 * Get automations (filtered by user and optionally account)
 */
export const getAutomations = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const userId = context.auth.uid;
  const { accountId } = data || {};

  let query: FirebaseFirestore.Query = db.collection('automations')
    .where('userId', '==', userId);

  if (accountId) {
    query = query.where('accountId', '==', accountId);
  }

  const automations = await query.orderBy('createdAt', 'desc').get();

  return automations.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  }));
});

/**
 * Create or update automation
 */
export const saveAutomation = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const userId = context.auth.uid;
  const { id, accountId, type, trigger, response, collectEmail, isActive } = data;

  if (!accountId) {
    throw new functions.https.HttpsError('invalid-argument', 'Account ID required');
  }

  // Verify account ownership
  const accountDoc = await db.collection('accounts').doc(accountId).get();
  if (!accountDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Account not found');
  }

  const account = accountDoc.data();
  if (account?.userId !== userId) {
    throw new functions.https.HttpsError('permission-denied', 'Not your account');
  }

  const automationData = {
    userId,
    accountId,
    type,
    trigger,
    response,
    collectEmail: collectEmail || false,
    isActive: isActive !== false,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (id) {
    // Verify ownership before updating
    const existingDoc = await db.collection('automations').doc(id).get();
    if (existingDoc.exists && existingDoc.data()?.userId !== userId) {
      throw new functions.https.HttpsError('permission-denied', 'Not your automation');
    }

    await db.collection('automations').doc(id).update(automationData);
    return { id, success: true };
  } else {
    const docRef = await db.collection('automations').add({
      ...automationData,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { id: docRef.id, success: true };
  }
});

/**
 * Delete automation
 */
export const deleteAutomation = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const userId = context.auth.uid;
  const { id } = data;

  if (!id) {
    throw new functions.https.HttpsError('invalid-argument', 'Automation ID required');
  }

  // Verify ownership
  const automationDoc = await db.collection('automations').doc(id).get();
  if (!automationDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Automation not found');
  }

  if (automationDoc.data()?.userId !== userId) {
    throw new functions.https.HttpsError('permission-denied', 'Not your automation');
  }

  await db.collection('automations').doc(id).delete();
  return { success: true };
});

/**
 * Get conversations with pagination (filtered by user)
 */
export const getConversations = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const userId = context.auth.uid;
  const { accountId, state, limit, startAfter } = data || {};

  let query: FirebaseFirestore.Query = db.collection('conversations')
    .where('userId', '==', userId);

  if (accountId) {
    query = query.where('accountId', '==', accountId);
  }

  if (state) {
    query = query.where('conversationState', '==', state);
  }

  query = query.orderBy('lastMessageAt', 'desc');

  if (startAfter) {
    const startDoc = await db.collection('conversations').doc(startAfter).get();
    if (startDoc.exists) {
      query = query.startAfter(startDoc);
    }
  }

  query = query.limit(limit || 50);

  const snapshot = await query.get();

  return {
    conversations: snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })),
    lastDoc: snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1].id : null,
  };
});

/**
 * Get single conversation detail
 */
export const getConversation = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const userId = context.auth.uid;
  const { id } = data;

  if (!id) {
    throw new functions.https.HttpsError('invalid-argument', 'Conversation ID required');
  }

  const doc = await db.collection('conversations').doc(id).get();

  if (!doc.exists) {
    throw new functions.https.HttpsError('not-found', 'Conversation not found');
  }

  const conversation = doc.data();

  // Verify ownership
  if (conversation?.userId !== userId) {
    throw new functions.https.HttpsError('permission-denied', 'Not your conversation');
  }

  return { id: doc.id, ...conversation };
});

// ============================================
// CONTACTS ENDPOINTS
// ============================================

/**
 * Get contacts (conversations) with filtering and pagination
 */
export const getContacts = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const userId = context.auth.uid;
  const { accountId, source, tags, hasEmail, search, limit, startAfter } = data || {};

  let query: FirebaseFirestore.Query = db.collection('conversations')
    .where('userId', '==', userId);

  if (accountId) {
    query = query.where('accountId', '==', accountId);
  }

  if (source) {
    query = query.where('source', '==', source);
  }

  // Note: Firestore doesn't support array-contains-any with other array operators
  // So we filter tags in memory after fetching
  if (hasEmail) {
    query = query.where('collectedData.email', '!=', null);
  }

  query = query.orderBy('lastMessageAt', 'desc');

  if (startAfter) {
    const startDoc = await db.collection('conversations').doc(startAfter).get();
    if (startDoc.exists) {
      query = query.startAfter(startDoc);
    }
  }

  // Fetch more than limit if we need to filter by tags/search
  const fetchLimit = (tags?.length > 0 || search) ? (limit || 200) * 2 : (limit || 200);
  query = query.limit(fetchLimit);

  const snapshot = await query.get();

  let contacts = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  }));

  // Filter by tags in memory
  if (tags && tags.length > 0) {
    contacts = contacts.filter(c => {
      const contactTags = (c as any).tags || [];
      return tags.some((tag: string) => contactTags.includes(tag));
    });
  }

  // Filter by search in memory
  if (search) {
    const searchLower = search.toLowerCase();
    contacts = contacts.filter(c => {
      const contact = c as any;
      return (
        contact.username?.toLowerCase().includes(searchLower) ||
        contact.collectedData?.name?.toLowerCase().includes(searchLower) ||
        contact.collectedData?.email?.toLowerCase().includes(searchLower)
      );
    });
  }

  // Apply final limit
  contacts = contacts.slice(0, limit || 200);

  return {
    contacts,
    lastDoc: contacts.length > 0 ? contacts[contacts.length - 1].id : null,
    totalCount: snapshot.size,
  };
});

/**
 * Bulk tag contacts
 */
export const bulkTagContacts = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const userId = context.auth.uid;
  const { contactIds, tagsToAdd, tagsToRemove } = data;

  if (!contactIds || contactIds.length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Contact IDs required');
  }

  if (contactIds.length > 500) {
    throw new functions.https.HttpsError('invalid-argument', 'Maximum 500 contacts at once');
  }

  let updated = 0;
  const batch = db.batch();

  for (const contactId of contactIds) {
    const docRef = db.collection('conversations').doc(contactId);
    const doc = await docRef.get();

    if (!doc.exists) continue;
    if (doc.data()?.userId !== userId) continue;

    const currentTags: string[] = doc.data()?.tags || [];
    let newTags = [...currentTags];

    // Add new tags
    if (tagsToAdd && tagsToAdd.length > 0) {
      for (const tag of tagsToAdd) {
        if (!newTags.includes(tag)) {
          newTags.push(tag);
        }
      }
    }

    // Remove tags
    if (tagsToRemove && tagsToRemove.length > 0) {
      newTags = newTags.filter(t => !tagsToRemove.includes(t));
    }

    batch.update(docRef, { tags: newTags });
    updated++;
  }

  await batch.commit();

  return { success: true, updated };
});

/**
 * Bulk DM contacts
 */
export const bulkDMContacts = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const userId = context.auth.uid;
  const { contactIds, message, accountId } = data;

  if (!contactIds || contactIds.length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Contact IDs required');
  }

  if (!message || !message.trim()) {
    throw new functions.https.HttpsError('invalid-argument', 'Message required');
  }

  if (!accountId) {
    throw new functions.https.HttpsError('invalid-argument', 'Account ID required');
  }

  if (contactIds.length > 100) {
    throw new functions.https.HttpsError('invalid-argument', 'Maximum 100 contacts at once for DMs');
  }

  // Verify account ownership
  const accountDoc = await db.collection('accounts').doc(accountId).get();
  if (!accountDoc.exists || accountDoc.data()?.userId !== userId) {
    throw new functions.https.HttpsError('permission-denied', 'Not your account');
  }

  const account = { ...accountDoc.data(), id: accountDoc.id } as Parameters<typeof import('./services/instagram').sendInstagramDM>[2];

  // Import sendInstagramDM
  const { sendInstagramDM } = await import('./services/instagram');

  let sent = 0;
  let failed = 0;

  for (const contactId of contactIds) {
    const docRef = db.collection('conversations').doc(contactId);
    const doc = await docRef.get();

    if (!doc.exists) {
      failed++;
      continue;
    }

    const contactData = doc.data();
    if (contactData?.userId !== userId || contactData?.accountId !== accountId) {
      failed++;
      continue;
    }

    const instagramUserId = contactData?.instagramUserId;
    if (!instagramUserId) {
      failed++;
      continue;
    }

    try {
      const success = await sendInstagramDM(instagramUserId, message, account);
      if (success) {
        sent++;
      } else {
        failed++;
      }
    } catch (error) {
      console.error(`Failed to send DM to ${instagramUserId}:`, error);
      failed++;
    }

    // Add delay between messages to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return { success: true, sent, failed };
});

/**
 * Export contacts to CSV
 */
export const exportContacts = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const userId = context.auth.uid;
  const { accountId, contactIds, source, tags } = data || {};

  let query: FirebaseFirestore.Query = db.collection('conversations')
    .where('userId', '==', userId);

  if (accountId) {
    query = query.where('accountId', '==', accountId);
  }

  if (source) {
    query = query.where('source', '==', source);
  }

  query = query.orderBy('lastMessageAt', 'desc');

  const snapshot = await query.get();

  let contacts = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  }));

  // Filter by specific IDs if provided
  if (contactIds && contactIds.length > 0) {
    contacts = contacts.filter(c => contactIds.includes(c.id));
  }

  // Filter by tags
  if (tags && tags.length > 0) {
    contacts = contacts.filter(c => {
      const contactTags = (c as any).tags || [];
      return tags.some((tag: string) => contactTags.includes(tag));
    });
  }

  // Build CSV
  const headers = ['Username', 'Name', 'Email', 'Phone', 'Source', 'Tags', 'Last Active', 'Created'];
  const rows = contacts.map(c => {
    const contact = c as any;
    return [
      contact.username || '',
      contact.collectedData?.name || '',
      contact.collectedData?.email || '',
      contact.collectedData?.phone || '',
      contact.source || '',
      (contact.tags || []).join('; '),
      contact.lastMessageAt ? new Date(contact.lastMessageAt._seconds * 1000).toISOString() : '',
      contact.createdAt ? new Date(contact.createdAt._seconds * 1000).toISOString() : '',
    ];
  });

  const csv = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
  ].join('\n');

  return { csv };
});

/**
 * Get all unique tags for contacts
 */
export const getContactTags = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const userId = context.auth.uid;
  const { accountId } = data || {};

  let query: FirebaseFirestore.Query = db.collection('conversations')
    .where('userId', '==', userId);

  if (accountId) {
    query = query.where('accountId', '==', accountId);
  }

  const snapshot = await query.get();

  const tagsSet = new Set<string>();
  snapshot.docs.forEach(doc => {
    const tags = doc.data()?.tags || [];
    tags.forEach((tag: string) => tagsSet.add(tag));
  });

  return { tags: Array.from(tagsSet).sort() };
});

/**
 * Create or update user profile
 */
export const saveUserProfile = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const userId = context.auth.uid;
  const { displayName } = data || {};

  const userRef = db.collection('users').doc(userId);
  const userDoc = await userRef.get();

  if (userDoc.exists) {
    // Update existing user
    await userRef.update({
      displayName,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } else {
    // Create new user
    await userRef.set({
      id: userId,
      email: context.auth.token.email,
      displayName: displayName || context.auth.token.name,
      subscription: 'free',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  return { success: true };
});

/**
 * Get user profile
 */
export const getUserProfile = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const userId = context.auth.uid;
  const userDoc = await db.collection('users').doc(userId).get();

  if (!userDoc.exists) {
    // Create default profile
    const defaultProfile = {
      id: userId,
      email: context.auth.token.email,
      displayName: context.auth.token.name,
      subscription: 'free',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection('users').doc(userId).set(defaultProfile);

    return defaultProfile;
  }

  return { id: userDoc.id, ...userDoc.data() };
});

// ============================================
// LEGACY ENDPOINTS (deprecated but kept for backwards compatibility)
// ============================================

/**
 * Save Instagram configuration (DEPRECATED - use OAuth instead)
 * @deprecated Use getInstagramOAuthUrl and OAuth flow instead
 */
export const saveInstagramConfig = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const { accessToken, pageId, instagramAccountId } = data;

  if (!accessToken || !pageId || !instagramAccountId) {
    throw new functions.https.HttpsError('invalid-argument', 'All fields required');
  }

  // Encrypt the access token
  const { encrypt } = await import('./utils/encryption');
  const encryptedToken = encrypt(accessToken);

  await db.collection('config').doc('instagram').set({
    accessToken: encryptedToken,
    pageId,
    instagramAccountId,
    tokenExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days
    lastCheckedFollowers: [],
  });

  return { success: true };
});

// ============================================
// FLOW ENDPOINTS
// ============================================

/**
 * Get all flows for an account
 */
export const getFlows = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const userId = context.auth.uid;
  const { accountId } = data || {};

  let query: FirebaseFirestore.Query = db.collection('flows')
    .where('userId', '==', userId);

  if (accountId) {
    query = query.where('accountId', '==', accountId);
  }

  const flows = await query.orderBy('createdAt', 'desc').get();

  return flows.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  }));
});

/**
 * Get a single flow by ID
 */
export const getFlow = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const userId = context.auth.uid;
  const { id } = data;

  if (!id) {
    throw new functions.https.HttpsError('invalid-argument', 'Flow ID required');
  }

  const flowDoc = await db.collection('flows').doc(id).get();

  if (!flowDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Flow not found');
  }

  const flow = flowDoc.data();

  if (flow?.userId !== userId) {
    throw new functions.https.HttpsError('permission-denied', 'Not your flow');
  }

  return { id: flowDoc.id, ...flow };
});

/**
 * Create a new flow
 */
export const createFlow = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const userId = context.auth.uid;
  const flowInput: FlowInput = data;

  if (!flowInput.accountId) {
    throw new functions.https.HttpsError('invalid-argument', 'Account ID required');
  }

  if (!flowInput.name) {
    throw new functions.https.HttpsError('invalid-argument', 'Flow name required');
  }

  // Verify account ownership
  const accountDoc = await db.collection('accounts').doc(flowInput.accountId).get();
  if (!accountDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Account not found');
  }

  const account = accountDoc.data();
  if (account?.userId !== userId) {
    throw new functions.https.HttpsError('permission-denied', 'Not your account');
  }

  // Validate flow structure
  const validation = validateFlow(flowInput);
  if (!validation.valid) {
    throw new functions.https.HttpsError('invalid-argument', validation.errors.join(', '));
  }

  const flowRef = db.collection('flows').doc();
  const flow: Flow = {
    id: flowRef.id,
    userId,
    accountId: flowInput.accountId,
    name: flowInput.name,
    description: flowInput.description || '',
    nodes: flowInput.nodes,
    edges: flowInput.edges,
    isActive: flowInput.isActive ?? false,
    triggerCount: 0,
    createdAt: admin.firestore.Timestamp.now(),
  };

  await flowRef.set(flow);

  return { id: flowRef.id, success: true };
});

/**
 * Update an existing flow
 */
export const updateFlow = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const userId = context.auth.uid;
  const { id, ...flowInput } = data;

  if (!id) {
    throw new functions.https.HttpsError('invalid-argument', 'Flow ID required');
  }

  // Verify ownership
  const flowDoc = await db.collection('flows').doc(id).get();
  if (!flowDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Flow not found');
  }

  const existingFlow = flowDoc.data();
  if (existingFlow?.userId !== userId) {
    throw new functions.https.HttpsError('permission-denied', 'Not your flow');
  }

  // Validate flow structure if nodes/edges provided
  if (flowInput.nodes && flowInput.edges) {
    const validation = validateFlow(flowInput as FlowInput);
    if (!validation.valid) {
      throw new functions.https.HttpsError('invalid-argument', validation.errors.join(', '));
    }
  }

  const updateData: Record<string, unknown> = {
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (flowInput.name !== undefined) updateData.name = flowInput.name;
  if (flowInput.description !== undefined) updateData.description = flowInput.description;
  if (flowInput.nodes !== undefined) updateData.nodes = flowInput.nodes;
  if (flowInput.edges !== undefined) updateData.edges = flowInput.edges;
  if (flowInput.isActive !== undefined) updateData.isActive = flowInput.isActive;

  await db.collection('flows').doc(id).update(updateData);

  return { id, success: true };
});

/**
 * Delete a flow
 */
export const deleteFlow = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const userId = context.auth.uid;
  const { id } = data;

  if (!id) {
    throw new functions.https.HttpsError('invalid-argument', 'Flow ID required');
  }

  // Verify ownership
  const flowDoc = await db.collection('flows').doc(id).get();
  if (!flowDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Flow not found');
  }

  if (flowDoc.data()?.userId !== userId) {
    throw new functions.https.HttpsError('permission-denied', 'Not your flow');
  }

  // Delete the flow
  await db.collection('flows').doc(id).delete();

  // Also delete any pending executions for this flow
  const executionsDocs = await db.collection('flow_executions')
    .where('flowId', '==', id)
    .where('status', 'in', ['active', 'waiting'])
    .get();

  const batch = db.batch();
  executionsDocs.docs.forEach(doc => {
    batch.update(doc.ref, { status: 'failed', lastError: 'Flow deleted' });
  });
  await batch.commit();

  return { success: true };
});

/**
 * Toggle flow active status
 */
export const toggleFlowActive = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const userId = context.auth.uid;
  const { id, isActive } = data;

  if (!id) {
    throw new functions.https.HttpsError('invalid-argument', 'Flow ID required');
  }

  if (typeof isActive !== 'boolean') {
    throw new functions.https.HttpsError('invalid-argument', 'isActive must be a boolean');
  }

  // Verify ownership
  const flowDoc = await db.collection('flows').doc(id).get();
  if (!flowDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Flow not found');
  }

  if (flowDoc.data()?.userId !== userId) {
    throw new functions.https.HttpsError('permission-denied', 'Not your flow');
  }

  await db.collection('flows').doc(id).update({
    isActive,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { success: true, isActive };
});

/**
 * Get Instagram posts for an account
 */
export const getUserInstagramPosts = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const userId = context.auth.uid;
  const { accountId, limit } = data || {};

  if (!accountId) {
    throw new functions.https.HttpsError('invalid-argument', 'Account ID required');
  }

  // Verify account ownership
  const accountDoc = await db.collection('accounts').doc(accountId).get();
  if (!accountDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Account not found');
  }

  const account = accountDoc.data();
  if (account?.userId !== userId) {
    throw new functions.https.HttpsError('permission-denied', 'Not your account');
  }

  // Get posts
  const posts = await getUserPosts(
    { id: accountDoc.id, ...account } as Parameters<typeof getUserPosts>[0],
    limit || 25
  );

  return { posts };
});

/**
 * Get flow execution stats
 */
export const getFlowStats = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const userId = context.auth.uid;
  const { flowId, accountId } = data || {};

  // Build query
  let query: FirebaseFirestore.Query = db.collection('flow_executions')
    .where('userId', '==', userId);

  if (flowId) {
    query = query.where('flowId', '==', flowId);
  }

  if (accountId) {
    query = query.where('accountId', '==', accountId);
  }

  const executions = await query.get();

  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

  const stats = {
    total: executions.size,
    completed: 0,
    active: 0,
    failed: 0,
    last24Hours: 0,
    last7Days: 0,
  };

  executions.docs.forEach(doc => {
    const execData = doc.data();
    const createdAt = execData.createdAt?.toMillis() || 0;

    if (execData.status === 'completed') stats.completed++;
    else if (execData.status === 'active' || execData.status === 'waiting') stats.active++;
    else if (execData.status === 'failed') stats.failed++;

    if (createdAt > oneDayAgo) stats.last24Hours++;
    if (createdAt > sevenDaysAgo) stats.last7Days++;
  });

  return stats;
});

// NovaSpeed-only lead/message outbox; existing runtime identity, no automatic email.
export { syncNovaSpeedSheet } from "./services/novaSpeedSheetSync";
