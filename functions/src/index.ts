import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin (done in firebase.ts, but ensure it's loaded)
import './firebase';

// Import webhook handler
import { instagramWebhook } from './webhooks/instagram';

// Import handlers for scheduled functions
import { checkNewFollowers, getFollowerStats } from './handlers/followerHandler';

// Import services for API endpoints
import { processMessageQueue, refreshAccessToken } from './services/instagram';
import { getLeads, getLeadStats, exportLeadsToCSV, deleteLead } from './services/leads';
import { cleanupRateLimitRecords, getRateLimitStatus } from './utils/rateLimiter';
import { db } from './firebase';

// ============================================
// WEBHOOK ENDPOINT
// ============================================

/**
 * Main Instagram webhook endpoint
 * URL: https://<region>-<project>.cloudfunctions.net/instagramWebhook
 */
export { instagramWebhook };

// ============================================
// SCHEDULED FUNCTIONS
// ============================================

/**
 * Check for new followers every 15 minutes
 */
export const scheduledFollowerCheck = functions.pubsub
  .schedule('every 15 minutes')
  .onRun(async () => {
    console.log('Running scheduled follower check...');
    const result = await checkNewFollowers();
    console.log(`Follower check complete: ${result.newFollowers} new, ${result.dmsSent} DMs sent`);
    return null;
  });

/**
 * Process queued messages every 5 minutes
 */
export const scheduledMessageQueueProcess = functions.pubsub
  .schedule('every 5 minutes')
  .onRun(async () => {
    console.log('Processing message queue...');
    const processed = await processMessageQueue();
    console.log(`Processed ${processed} queued messages`);
    return null;
  });

/**
 * Refresh access token weekly (tokens last 60 days, refresh early)
 */
export const scheduledTokenRefresh = functions.pubsub
  .schedule('every monday 03:00')
  .timeZone('UTC')
  .onRun(async () => {
    console.log('Refreshing access token...');
    const success = await refreshAccessToken();
    console.log(`Token refresh ${success ? 'succeeded' : 'failed'}`);
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

// ============================================
// API ENDPOINTS (for dashboard)
// ============================================

/**
 * Get dashboard statistics
 */
export const getDashboardStats = functions.https.onCall(async (data, context) => {
  // Check authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const [leadStats, followerStats, rateLimit] = await Promise.all([
    getLeadStats(),
    getFollowerStats(),
    getRateLimitStatus(),
  ]);

  // Get conversation stats
  const conversationsRef = db.collection('conversations');
  const totalConversations = (await conversationsRef.count().get()).data().count;
  const activeConversations = (await conversationsRef
    .where('conversationState', 'in', ['ai_chat', 'collecting_email', 'collecting_phone'])
    .count()
    .get()
  ).data().count;

  return {
    leads: leadStats,
    followers: followerStats,
    conversations: {
      total: totalConversations,
      active: activeConversations,
    },
    rateLimit,
  };
});

/**
 * Get leads with pagination
 */
export const getLeadsApi = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const { source, hasEmail, hasPhone, limit, startAfter } = data || {};

  return await getLeads({
    source,
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

  const { source, startDate, endDate } = data || {};

  const csv = await exportLeadsToCSV({
    source,
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

  const { leadId } = data;
  if (!leadId) {
    throw new functions.https.HttpsError('invalid-argument', 'Lead ID required');
  }

  const success = await deleteLead(leadId);
  return { success };
});

/**
 * Get automations
 */
export const getAutomations = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const automations = await db.collection('automations')
    .orderBy('createdAt', 'desc')
    .get();

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

  const { id, type, trigger, response, collectEmail, isActive } = data;

  const automationData = {
    type,
    trigger,
    response,
    collectEmail: collectEmail || false,
    isActive: isActive !== false,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (id) {
    // Update existing
    await db.collection('automations').doc(id).update(automationData);
    return { id, success: true };
  } else {
    // Create new
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

  const { id } = data;
  if (!id) {
    throw new functions.https.HttpsError('invalid-argument', 'Automation ID required');
  }

  await db.collection('automations').doc(id).delete();
  return { success: true };
});

/**
 * Get conversations with pagination
 */
export const getConversations = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const { state, limit, startAfter } = data || {};

  let query: FirebaseFirestore.Query = db.collection('conversations')
    .orderBy('lastMessageAt', 'desc');

  if (state) {
    query = query.where('conversationState', '==', state);
  }

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

  const { id } = data;
  if (!id) {
    throw new functions.https.HttpsError('invalid-argument', 'Conversation ID required');
  }

  const doc = await db.collection('conversations').doc(id).get();

  if (!doc.exists) {
    throw new functions.https.HttpsError('not-found', 'Conversation not found');
  }

  return { id: doc.id, ...doc.data() };
});

/**
 * Save Instagram configuration
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
