import { db, Automation, InstagramAccount } from '../firebase';
import { sendInstagramDM } from '../services/instagram';
import { generateAIResponse } from '../services/ai';
import { buildSystemPrompt } from '../services/accounts';
import { containsKeyword, sanitizeInput } from '../utils/validators';
import * as admin from 'firebase-admin';

// ============================================
// STORY EVENT INTERFACES
// ============================================

export interface InstagramStoryMentionEvent {
  sender: {
    id: string;
  };
  recipient: {
    id: string;
  };
  timestamp: number;
  story_mention: {
    link: string;
    id: string;
  };
}

export interface InstagramStoryReplyEvent {
  sender: {
    id: string;
  };
  recipient: {
    id: string;
  };
  timestamp: number;
  message: {
    mid: string;
    text?: string;
    attachments?: Array<{
      type: string;
      payload: {
        url: string;
      };
    }>;
  };
  // Story context - present when replying to a story
  story_reply?: {
    story_id: string;
  };
}

// ============================================
// STORY MENTION HANDLER
// ============================================

/**
 * Handle when someone mentions the account in their story
 * @param event - The story mention event from Instagram
 * @param account - The Instagram account that was mentioned
 */
export async function handleStoryMention(
  event: InstagramStoryMentionEvent,
  account: InstagramAccount
): Promise<void> {
  const senderId = event.sender.id;
  const storyId = event.story_mention.id;
  const storyLink = event.story_mention.link;

  console.log(`[StoryHandler] Story mention from ${senderId} in story ${storyId}`);
  console.log(`[StoryHandler] Account: ${account.username} (${account.id})`);

  // Check for story_mention automations for this account
  const automations = await db.collection('automations')
    .where('accountId', '==', account.id)
    .where('type', '==', 'story_mention')
    .where('isActive', '==', true)
    .get();

  if (automations.empty) {
    console.log('[StoryHandler] No active story_mention automations found');
    return;
  }

  // Get sender info
  const senderInfo = await getSenderInfo(senderId, account);
  const username = senderInfo?.username || 'there';

  for (const doc of automations.docs) {
    const automation = { id: doc.id, ...doc.data() } as Automation;

    // Story mentions don't typically have keywords to match
    // They trigger whenever someone mentions the account
    console.log(`[StoryHandler] Triggering automation ${automation.id} for story mention`);
    await triggerStoryAutomation(
      senderId,
      username,
      automation,
      `[Mentioned you in their story]`,
      storyId,
      account
    );
    return; // Only trigger the first matching automation
  }
}

// ============================================
// STORY REPLY HANDLER
// ============================================

/**
 * Handle when someone replies to the account's story
 * @param event - The story reply event from Instagram
 * @param account - The Instagram account that owns the story
 */
export async function handleStoryReply(
  event: InstagramStoryReplyEvent,
  account: InstagramAccount
): Promise<void> {
  const senderId = event.sender.id;
  const replyText = sanitizeInput(event.message.text || '');
  const storyId = event.story_reply?.story_id;

  console.log(`[StoryHandler] Story reply from ${senderId}: ${replyText.substring(0, 50)}...`);
  console.log(`[StoryHandler] Account: ${account.username} (${account.id})`);
  console.log(`[StoryHandler] Story ID: ${storyId || 'unknown'}`);

  // Check for story_reply automations for this account
  const automations = await db.collection('automations')
    .where('accountId', '==', account.id)
    .where('type', '==', 'story_reply')
    .where('isActive', '==', true)
    .get();

  if (automations.empty) {
    console.log('[StoryHandler] No active story_reply automations found');
    return;
  }

  // Get sender info
  const senderInfo = await getSenderInfo(senderId, account);
  const username = senderInfo?.username || 'there';

  for (const doc of automations.docs) {
    const automation = { id: doc.id, ...doc.data() } as Automation;

    // Check if automation is limited to specific stories
    if (automation.trigger.storyIds && automation.trigger.storyIds.length > 0) {
      if (!storyId || !automation.trigger.storyIds.includes(storyId)) {
        continue;
      }
    }

    // Check for keyword match if keywords are specified
    if (automation.trigger.keywords && automation.trigger.keywords.length > 0) {
      const matchedKeyword = containsKeyword(replyText, automation.trigger.keywords);
      if (!matchedKeyword) {
        continue;
      }
      console.log(`[StoryHandler] Keyword "${matchedKeyword}" matched in story reply`);
    }

    // Trigger the automation
    console.log(`[StoryHandler] Triggering automation ${automation.id} for story reply`);
    await triggerStoryAutomation(
      senderId,
      username,
      automation,
      replyText,
      storyId,
      account
    );
    return; // Only trigger the first matching automation
  }

  console.log('[StoryHandler] No automation triggered for this story reply');
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get sender information from Instagram API
 */
async function getSenderInfo(
  senderId: string,
  account: InstagramAccount
): Promise<{ id: string; username: string } | null> {
  try {
    const { getInstagramUser } = await import('../services/instagram');
    return await getInstagramUser(senderId, account);
  } catch (error) {
    console.error('[StoryHandler] Failed to get sender info:', error);
    return null;
  }
}

/**
 * Trigger a story automation (mention or reply)
 */
async function triggerStoryAutomation(
  senderId: string,
  username: string,
  automation: Automation,
  messageText: string,
  storyId: string | undefined,
  account: InstagramAccount
): Promise<void> {
  // Check if we've already responded to this user recently for this automation
  const recentResponses = await db.collection('story_dm_log')
    .where('senderId', '==', senderId)
    .where('accountId', '==', account.id)
    .where('automationId', '==', automation.id)
    .where('createdAt', '>', new Date(Date.now() - 24 * 60 * 60 * 1000))
    .limit(1)
    .get();

  if (!recentResponses.empty) {
    console.log(`[StoryHandler] Already responded to ${username} for this automation in last 24 hours`);
    return;
  }

  let message: string;

  if (automation.response.type === 'static' && automation.response.staticMessage) {
    // Use static message with personalization
    message = automation.response.staticMessage
      .replace('{username}', username)
      .replace('{name}', username);
  } else if (automation.response.type === 'ai' && automation.response.aiPrompt) {
    // Generate AI response with account personality
    const systemPrompt = automation.response.aiPrompt + '\n\n' + buildSystemPrompt(account);

    const contextMessage = automation.type === 'story_mention'
      ? `User @${username} mentioned you in their story.`
      : `User @${username} replied to your story: "${messageText}"`;

    message = await generateAIResponse(
      systemPrompt,
      [{
        role: 'user',
        content: contextMessage,
      }],
      { maxTokens: 200 }
    );
  } else {
    // Fallback message
    message = automation.type === 'story_mention'
      ? `Hey ${username}! Thanks for the shoutout in your story! 🙌`
      : `Hey ${username}! Thanks for your message! I'll get back to you soon.`;
  }

  // Send the DM
  const sent = await sendInstagramDM(senderId, message, account);

  if (sent) {
    // Log this response to prevent spam
    await db.collection('story_dm_log').add({
      senderId,
      username,
      accountId: account.id,
      automationId: automation.id,
      automationType: automation.type,
      storyId: storyId || null,
      originalMessage: messageText.substring(0, 200),
      responseSent: message,
      createdAt: admin.firestore.Timestamp.now(),
    });

    // Create or update conversation
    await createConversationFromStory(
      senderId,
      username,
      automation,
      messageText,
      message,
      storyId,
      account
    );

    console.log(`[StoryHandler] Response sent to ${username}`);
  } else {
    console.error(`[StoryHandler] Failed to send response to ${username}`);
  }
}

/**
 * Create a conversation record from a story trigger
 */
async function createConversationFromStory(
  senderId: string,
  username: string,
  automation: Automation,
  originalMessage: string,
  sentMessage: string,
  storyId: string | undefined,
  account: InstagramAccount
): Promise<void> {
  const conversationRef = db.collection('conversations').doc();

  const source = automation.type === 'story_mention'
    ? '[Story Mention]'
    : '[Story Reply]';

  await conversationRef.set({
    id: conversationRef.id,
    userId: account.userId,
    accountId: account.id,
    instagramUserId: senderId,
    username,
    currentAutomationId: automation.id,
    conversationState: automation.collectEmail ? 'ai_chat' : 'completed',
    collectedData: {},
    messages: [
      {
        role: 'user',
        content: `${source} ${originalMessage}`,
        timestamp: admin.firestore.Timestamp.now(),
      },
      {
        role: 'assistant',
        content: sentMessage,
        timestamp: admin.firestore.Timestamp.now(),
      },
    ],
    source: automation.type,
    storyId: storyId || null,
    lastMessageAt: admin.firestore.Timestamp.now(),
    createdAt: admin.firestore.Timestamp.now(),
  });
}

/**
 * Get story automation stats for an account
 */
export async function getStoryAutomationStats(
  accountId: string,
  automationType?: 'story_mention' | 'story_reply'
): Promise<{
  total: number;
  last24Hours: number;
  last7Days: number;
  uniqueUsers: number;
}> {
  let query: FirebaseFirestore.Query = db.collection('story_dm_log')
    .where('accountId', '==', accountId);

  if (automationType) {
    query = query.where('automationType', '==', automationType);
  }

  const allDocs = await query.get();
  const logs = allDocs.docs.map(doc => doc.data());

  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

  const uniqueUsers = new Set(logs.map(l => l.senderId)).size;

  return {
    total: logs.length,
    last24Hours: logs.filter(l => l.createdAt.toMillis() > oneDayAgo).length,
    last7Days: logs.filter(l => l.createdAt.toMillis() > sevenDaysAgo).length,
    uniqueUsers,
  };
}

/**
 * Check if an event is a story reply (has story context)
 */
export function isStoryReplyEvent(event: any): boolean {
  return !!(event.message && event.story_reply);
}

/**
 * Check if an event is a story mention
 */
export function isStoryMentionEvent(event: any): boolean {
  return !!event.story_mention;
}
