import { db, Automation } from '../firebase';
import { sendInstagramDM, getFollowers } from '../services/instagram';
import { generateWelcomeMessage } from '../services/ai';
import * as admin from 'firebase-admin';

/**
 * Check for new followers and send welcome DMs
 * This is called by a scheduled Cloud Function
 */
export async function checkNewFollowers(): Promise<{
  newFollowers: number;
  dmsSent: number;
}> {
  // Get Instagram config
  const configDoc = await db.collection('config').doc('instagram').get();
  if (!configDoc.exists) {
    console.log('Instagram config not found');
    return { newFollowers: 0, dmsSent: 0 };
  }

  const config = configDoc.data();
  const instagramAccountId = config?.instagramAccountId;
  const lastCheckedFollowers: string[] = config?.lastCheckedFollowers || [];

  if (!instagramAccountId) {
    console.log('Instagram account ID not configured');
    return { newFollowers: 0, dmsSent: 0 };
  }

  // Get new follower automation
  const automations = await db.collection('automations')
    .where('type', '==', 'new_follower')
    .where('isActive', '==', true)
    .limit(1)
    .get();

  if (automations.empty) {
    console.log('No active new follower automation');
    return { newFollowers: 0, dmsSent: 0 };
  }

  const automation = { id: automations.docs[0].id, ...automations.docs[0].data() } as Automation;

  // Get current followers (limited to recent 100)
  const currentFollowers = await getFollowers(instagramAccountId, 100);

  if (currentFollowers.length === 0) {
    console.log('Could not fetch followers or no followers');
    return { newFollowers: 0, dmsSent: 0 };
  }

  // Find new followers
  const currentFollowerIds = currentFollowers.map(f => f.id);
  const newFollowers = currentFollowers.filter(
    f => !lastCheckedFollowers.includes(f.id)
  );

  console.log(`Found ${newFollowers.length} new followers`);

  let dmsSent = 0;

  // Send welcome DM to each new follower
  for (const follower of newFollowers) {
    const sent = await sendWelcomeDM(follower.id, follower.username, automation);
    if (sent) {
      dmsSent++;
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Update last checked followers list
  await db.collection('config').doc('instagram').update({
    lastCheckedFollowers: currentFollowerIds,
    lastFollowerCheckAt: admin.firestore.Timestamp.now(),
  });

  return {
    newFollowers: newFollowers.length,
    dmsSent,
  };
}

/**
 * Send welcome DM to a new follower
 */
async function sendWelcomeDM(
  userId: string,
  username: string,
  automation: Automation
): Promise<boolean> {
  // Check if we've already welcomed this user
  const existingWelcome = await db.collection('follower_welcomes')
    .where('userId', '==', userId)
    .limit(1)
    .get();

  if (!existingWelcome.empty) {
    console.log(`Already welcomed ${username}, skipping`);
    return false;
  }

  let message: string;

  if (automation.response.type === 'static' && automation.response.staticMessage) {
    message = automation.response.staticMessage
      .replace('{username}', username)
      .replace('{name}', username);
  } else if (automation.response.type === 'ai' && automation.response.aiPrompt) {
    message = await generateWelcomeMessage(username, automation.response.aiPrompt);
  } else {
    message = `Hey ${username}! Thanks for following! Let me know if you have any questions.`;
  }

  const sent = await sendInstagramDM(userId, message);

  if (sent) {
    // Log the welcome
    await db.collection('follower_welcomes').add({
      userId,
      username,
      automationId: automation.id,
      messageSent: message,
      createdAt: admin.firestore.Timestamp.now(),
    });

    // Create conversation record
    await createFollowerConversation(userId, username, automation, message);

    console.log(`Welcome DM sent to ${username}`);
    return true;
  }

  return false;
}

/**
 * Create a conversation record for a new follower
 */
async function createFollowerConversation(
  userId: string,
  username: string,
  automation: Automation,
  welcomeMessage: string
): Promise<void> {
  const conversationRef = db.collection('conversations').doc();

  await conversationRef.set({
    id: conversationRef.id,
    instagramUserId: userId,
    username,
    currentAutomationId: automation.id,
    conversationState: automation.collectEmail ? 'ai_chat' : 'greeting',
    collectedData: {},
    messages: [
      {
        role: 'assistant',
        content: welcomeMessage,
        timestamp: admin.firestore.Timestamp.now(),
      },
    ],
    source: 'new_follower',
    lastMessageAt: admin.firestore.Timestamp.now(),
    createdAt: admin.firestore.Timestamp.now(),
  });
}

/**
 * Get follower automation stats
 */
export async function getFollowerStats(): Promise<{
  totalWelcomed: number;
  last24Hours: number;
  last7Days: number;
}> {
  const allWelcomes = await db.collection('follower_welcomes').get();
  const welcomes = allWelcomes.docs.map(doc => doc.data());

  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

  return {
    totalWelcomed: welcomes.length,
    last24Hours: welcomes.filter(w => w.createdAt.toMillis() > oneDayAgo).length,
    last7Days: welcomes.filter(w => w.createdAt.toMillis() > sevenDaysAgo).length,
  };
}

/**
 * Manually welcome a specific user (for testing)
 */
export async function manualWelcomeUser(
  userId: string,
  username: string
): Promise<boolean> {
  const automations = await db.collection('automations')
    .where('type', '==', 'new_follower')
    .where('isActive', '==', true)
    .limit(1)
    .get();

  if (automations.empty) {
    console.log('No active new follower automation');
    return false;
  }

  const automation = { id: automations.docs[0].id, ...automations.docs[0].data() } as Automation;

  return await sendWelcomeDM(userId, username, automation);
}
