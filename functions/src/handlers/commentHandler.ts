import { db, Automation, InstagramAccount } from '../firebase';
import { sendInstagramDM, getInstagramUser } from '../services/instagram';
import { generateAIResponse } from '../services/ai';
import { buildSystemPrompt } from '../services/accounts';
import { containsKeyword, sanitizeInput } from '../utils/validators';
import * as admin from 'firebase-admin';

export interface InstagramCommentEvent {
  id: string;
  media: {
    id: string;
    media_product_type: string;
  };
  from: {
    id: string;
    username: string;
  };
  text: string;
  timestamp: string;
}

/**
 * Handle incoming comment webhook events
 * @param event - The Instagram comment event
 * @param account - The Instagram account that received the comment
 */
export async function handleComment(
  event: InstagramCommentEvent,
  account: InstagramAccount
): Promise<void> {
  const commentText = sanitizeInput(event.text);
  const userId = event.from.id;
  const username = event.from.username;
  const mediaId = event.media.id;

  console.log(`Comment from ${username} on media ${mediaId}: ${commentText.substring(0, 50)}...`);
  console.log(`Account: ${account.username} (${account.id})`);

  // Check for comment-to-DM automations for this account
  const automations = await db.collection('automations')
    .where('accountId', '==', account.id)
    .where('type', '==', 'comment_to_dm')
    .where('isActive', '==', true)
    .get();

  for (const doc of automations.docs) {
    const automation = { id: doc.id, ...doc.data() } as Automation;

    // Check if automation is limited to specific posts
    if (automation.trigger.postIds && automation.trigger.postIds.length > 0) {
      if (!automation.trigger.postIds.includes(mediaId)) {
        continue;
      }
    }

    // Check for keyword match
    const matchedKeyword = containsKeyword(commentText, automation.trigger.keywords);

    if (matchedKeyword) {
      console.log(`Keyword "${matchedKeyword}" matched in comment, triggering DM to ${username}`);
      await triggerCommentToDM(userId, username, automation, commentText, mediaId, account);
      return;
    }
  }

  console.log('No automation triggered for this comment');
}

/**
 * Trigger comment-to-DM automation
 */
async function triggerCommentToDM(
  userId: string,
  username: string,
  automation: Automation,
  commentText: string,
  mediaId: string,
  account: InstagramAccount
): Promise<void> {
  // Check if we've already DMed this user recently for this automation
  const recentDMs = await db.collection('comment_dm_log')
    .where('userId', '==', userId)
    .where('accountId', '==', account.id)
    .where('automationId', '==', automation.id)
    .where('createdAt', '>', new Date(Date.now() - 24 * 60 * 60 * 1000))
    .limit(1)
    .get();

  if (!recentDMs.empty) {
    console.log(`Already sent DM to ${username} for this automation in last 24 hours, skipping`);
    return;
  }

  let message: string;

  if (automation.response.type === 'static' && automation.response.staticMessage) {
    // Use static message, but personalize with username
    message = automation.response.staticMessage.replace('{username}', username);
  } else if (automation.response.type === 'ai' && automation.response.aiPrompt) {
    // Generate AI response with account personality
    const systemPrompt = automation.response.aiPrompt + '\n\n' + buildSystemPrompt(account);

    message = await generateAIResponse(
      systemPrompt,
      [{
        role: 'user',
        content: `User @${username} commented: "${commentText}"`,
      }],
      { maxTokens: 200 }
    );
  } else {
    // Fallback message
    message = `Hey ${username}! Thanks for your comment! I'll send you more info.`;
  }

  // Send the DM
  const sent = await sendInstagramDM(userId, message, account);

  if (sent) {
    // Log this DM to prevent spam
    await db.collection('comment_dm_log').add({
      userId,
      username,
      accountId: account.id,
      automationId: automation.id,
      mediaId,
      commentText: commentText.substring(0, 200),
      messageSent: message,
      createdAt: admin.firestore.Timestamp.now(),
    });

    // Create or update conversation
    await createConversationFromComment(userId, username, automation, commentText, message, account);

    console.log(`Comment-to-DM sent to ${username}`);
  }
}

/**
 * Create a conversation record from a comment trigger
 */
async function createConversationFromComment(
  userId: string,
  username: string,
  automation: Automation,
  commentText: string,
  sentMessage: string,
  account: InstagramAccount
): Promise<void> {
  const conversationRef = db.collection('conversations').doc();

  await conversationRef.set({
    id: conversationRef.id,
    userId: account.userId,
    accountId: account.id,
    instagramUserId: userId,
    username,
    currentAutomationId: automation.id,
    conversationState: automation.collectEmail ? 'ai_chat' : 'completed',
    collectedData: {},
    messages: [
      {
        role: 'user',
        content: `[Comment] ${commentText}`,
        timestamp: admin.firestore.Timestamp.now(),
      },
      {
        role: 'assistant',
        content: sentMessage,
        timestamp: admin.firestore.Timestamp.now(),
      },
    ],
    source: 'comment_to_dm',
    lastMessageAt: admin.firestore.Timestamp.now(),
    createdAt: admin.firestore.Timestamp.now(),
  });
}

/**
 * Get comment automation stats for an account
 */
export async function getCommentAutomationStats(
  accountId: string,
  automationId?: string
): Promise<{
  total: number;
  last24Hours: number;
  last7Days: number;
  uniqueUsers: number;
}> {
  let query: FirebaseFirestore.Query = db.collection('comment_dm_log')
    .where('accountId', '==', accountId);

  if (automationId) {
    query = query.where('automationId', '==', automationId);
  }

  const allDocs = await query.get();
  const logs = allDocs.docs.map(doc => doc.data());

  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

  const uniqueUsers = new Set(logs.map(l => l.userId)).size;

  return {
    total: logs.length,
    last24Hours: logs.filter(l => l.createdAt.toMillis() > oneDayAgo).length,
    last7Days: logs.filter(l => l.createdAt.toMillis() > sevenDaysAgo).length,
    uniqueUsers,
  };
}
