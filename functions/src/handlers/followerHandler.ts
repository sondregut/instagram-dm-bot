import { db, Automation, InstagramAccount } from '../firebase';
import { sendInstagramDM, getFollowers } from '../services/instagram';
import { generateWelcomeMessage } from '../services/ai';
import { getAllActiveAccounts, buildSystemPrompt } from '../services/accounts';
import * as admin from 'firebase-admin';

/**
 * Check for new followers across all active accounts and send welcome DMs
 * This is called by a scheduled Cloud Function
 */
export async function checkNewFollowers(): Promise<{
  accountsProcessed: number;
  totalNewFollowers: number;
  totalDmsSent: number;
}> {
  // Get all active accounts
  const accounts = await getAllActiveAccounts();

  let totalNewFollowers = 0;
  let totalDmsSent = 0;

  for (const account of accounts) {
    try {
      const result = await checkAccountNewFollowers(account);
      totalNewFollowers += result.newFollowers;
      totalDmsSent += result.dmsSent;
    } catch (error) {
      console.error(`Error checking followers for account ${account.username}:`, error);
    }
  }

  return {
    accountsProcessed: accounts.length,
    totalNewFollowers,
    totalDmsSent,
  };
}

/**
 * Check for new followers on a specific account
 */
export async function checkAccountNewFollowers(account: InstagramAccount): Promise<{
  newFollowers: number;
  dmsSent: number;
}> {
  // Skip if auto-welcome is disabled
  if (!account.settings.autoWelcomeNewFollowers) {
    console.log(`Auto-welcome disabled for ${account.username}, skipping`);
    return { newFollowers: 0, dmsSent: 0 };
  }

  // Get stored follower list for this account
  const accountDoc = await db.collection('accounts').doc(account.id).get();
  const accountData = accountDoc.data();
  const lastCheckedFollowers: string[] = accountData?.lastCheckedFollowers || [];

  // Get new follower automation for this account
  const automations = await db.collection('automations')
    .where('accountId', '==', account.id)
    .where('type', '==', 'new_follower')
    .where('isActive', '==', true)
    .limit(1)
    .get();

  // If no automation but welcomeMessage is set, create a temporary automation-like object
  let automation: Automation | null = null;
  if (!automations.empty) {
    automation = { id: automations.docs[0].id, ...automations.docs[0].data() } as Automation;
  } else if (account.settings.welcomeMessage) {
    // Use default welcome message from settings
    automation = {
      id: 'default',
      userId: account.userId,
      accountId: account.id,
      type: 'new_follower',
      trigger: { keywords: [] },
      response: {
        type: 'static',
        staticMessage: account.settings.welcomeMessage,
      },
      collectEmail: account.settings.collectEmail,
      isActive: true,
      createdAt: admin.firestore.Timestamp.now(),
    };
  }

  if (!automation) {
    console.log(`No new follower automation for ${account.username}`);
    return { newFollowers: 0, dmsSent: 0 };
  }

  // Get current followers (limited to recent 100)
  const currentFollowers = await getFollowers(account, 100);

  if (currentFollowers.length === 0) {
    console.log(`Could not fetch followers or no followers for ${account.username}`);
    return { newFollowers: 0, dmsSent: 0 };
  }

  // Find new followers
  const currentFollowerIds = currentFollowers.map(f => f.id);
  const newFollowers = currentFollowers.filter(
    f => !lastCheckedFollowers.includes(f.id)
  );

  console.log(`Found ${newFollowers.length} new followers for ${account.username}`);

  let dmsSent = 0;

  // Send welcome DM to each new follower
  for (const follower of newFollowers) {
    const sent = await sendWelcomeDM(follower.id, follower.username, automation, account);
    if (sent) {
      dmsSent++;
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Update last checked followers list for this account
  await db.collection('accounts').doc(account.id).update({
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
  automation: Automation,
  account: InstagramAccount
): Promise<boolean> {
  // Check if we've already welcomed this user for this account
  const existingWelcome = await db.collection('follower_welcomes')
    .where('userId', '==', userId)
    .where('accountId', '==', account.id)
    .limit(1)
    .get();

  if (!existingWelcome.empty) {
    console.log(`Already welcomed ${username} for ${account.username}, skipping`);
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

  const sent = await sendInstagramDM(userId, message, account);

  if (sent) {
    // Log the welcome
    await db.collection('follower_welcomes').add({
      userId,
      username,
      accountId: account.id,
      automationId: automation.id,
      messageSent: message,
      createdAt: admin.firestore.Timestamp.now(),
    });

    // Create conversation record
    await createFollowerConversation(userId, username, automation, message, account);

    console.log(`Welcome DM sent to ${username} from ${account.username}`);
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
  welcomeMessage: string,
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
 * Get follower automation stats for an account
 */
export async function getFollowerStats(accountId?: string): Promise<{
  totalWelcomed: number;
  last24Hours: number;
  last7Days: number;
}> {
  let query: FirebaseFirestore.Query = db.collection('follower_welcomes');

  if (accountId) {
    query = query.where('accountId', '==', accountId);
  }

  const allWelcomes = await query.get();
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
  username: string,
  accountId: string
): Promise<boolean> {
  const accountDoc = await db.collection('accounts').doc(accountId).get();
  if (!accountDoc.exists) {
    console.log('Account not found');
    return false;
  }

  const account = { id: accountDoc.id, ...accountDoc.data() } as InstagramAccount;

  const automations = await db.collection('automations')
    .where('accountId', '==', accountId)
    .where('type', '==', 'new_follower')
    .where('isActive', '==', true)
    .limit(1)
    .get();

  if (automations.empty) {
    console.log('No active new follower automation');
    return false;
  }

  const automation = { id: automations.docs[0].id, ...automations.docs[0].data() } as Automation;

  return await sendWelcomeDM(userId, username, automation, account);
}
