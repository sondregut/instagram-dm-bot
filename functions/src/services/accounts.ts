import { db, InstagramAccount, AIPersonality, AccountSettings } from '../firebase';
import { decrypt } from '../utils/encryption';
import * as admin from 'firebase-admin';

// Cache for account configs (to avoid repeated Firestore reads)
const accountCache: Map<string, { account: InstagramAccount; timestamp: number }> = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get Instagram account configuration by Instagram Account ID
 * This is the ID that appears in webhook events as recipient.id
 */
export async function getAccountByInstagramId(instagramAccountId: string): Promise<InstagramAccount | null> {
  // Check cache first
  const cached = accountCache.get(instagramAccountId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.account;
  }

  // Query Firestore
  const snapshot = await db.collection('accounts')
    .where('instagramAccountId', '==', instagramAccountId)
    .where('isActive', '==', true)
    .limit(1)
    .get();

  if (snapshot.empty) {
    // Fallback: check old config format for backwards compatibility
    const oldConfig = await db.collection('config').doc('instagram').get();
    if (oldConfig.exists) {
      const data = oldConfig.data();
      if (data?.instagramAccountId === instagramAccountId) {
        // Convert old format to new format (legacy support)
        const legacyAccount: InstagramAccount = {
          id: 'legacy',
          userId: 'legacy', // Will need to be updated manually
          username: 'legacy_account',
          instagramAccountId: data.instagramAccountId,
          pageId: data.pageId,
          accessToken: data.accessToken,
          aiPersonality: {
            name: 'Assistant',
            description: 'Instagram DM Assistant',
            systemPrompt: `You are a friendly Instagram DM assistant.
Keep responses brief, helpful, and conversational.
Maximum 200 characters per response.
Be warm and authentic, not robotic.`,
            tone: 'friendly',
            goals: ['Answer questions', 'Be helpful'],
          },
          settings: {
            maxResponseLength: 200,
            collectEmail: false,
            collectPhone: false,
            autoWelcomeNewFollowers: false,
            businessHoursOnly: false,
            notifyOnNewLead: false,
            notifyOnHandoff: false,
          },
          isActive: true,
          connectionStatus: 'connected',
          createdAt: admin.firestore.Timestamp.now(),
        };
        return legacyAccount;
      }
    }
    return null;
  }

  const doc = snapshot.docs[0];
  const account = { id: doc.id, ...doc.data() } as InstagramAccount;

  // Update cache
  accountCache.set(instagramAccountId, { account, timestamp: Date.now() });

  return account;
}

/**
 * Get account by document ID
 */
export async function getAccountById(accountId: string): Promise<InstagramAccount | null> {
  const doc = await db.collection('accounts').doc(accountId).get();

  if (!doc.exists) {
    return null;
  }

  return { id: doc.id, ...doc.data() } as InstagramAccount;
}

/**
 * Get Instagram account by username
 */
export async function getAccountByUsername(username: string): Promise<InstagramAccount | null> {
  const snapshot = await db.collection('accounts')
    .where('username', '==', username.toLowerCase().replace('@', ''))
    .where('isActive', '==', true)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() } as InstagramAccount;
}

/**
 * Get all accounts for a user
 */
export async function getAccountsByUserId(userId: string): Promise<InstagramAccount[]> {
  const snapshot = await db.collection('accounts')
    .where('userId', '==', userId)
    .where('isActive', '==', true)
    .get();

  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InstagramAccount));
}

/**
 * Get all active accounts (for scheduled functions)
 */
export async function getAllActiveAccounts(): Promise<InstagramAccount[]> {
  const snapshot = await db.collection('accounts')
    .where('isActive', '==', true)
    .where('connectionStatus', '==', 'connected')
    .get();

  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InstagramAccount));
}

/**
 * Get decrypted access token for an account
 */
export async function getAccountAccessToken(accountId: string): Promise<string | null> {
  const account = await getAccountById(accountId);

  if (!account) {
    return null;
  }

  // Decrypt token if it looks encrypted (contains colons from our format)
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
 * Update account's last webhook timestamp
 */
export async function updateAccountWebhookTimestamp(accountId: string): Promise<void> {
  if (accountId === 'legacy') return; // Skip for legacy accounts

  await db.collection('accounts').doc(accountId).update({
    lastWebhookAt: admin.firestore.Timestamp.now(),
  });
}

/**
 * Create or update an Instagram account
 */
export async function saveAccount(
  userId: string,
  account: Partial<InstagramAccount> & { username: string }
): Promise<string> {
  const username = account.username.toLowerCase().replace('@', '');

  // Check if account exists for this user
  const existing = await db.collection('accounts')
    .where('userId', '==', userId)
    .where('username', '==', username)
    .limit(1)
    .get();

  const accountData = {
    ...account,
    userId,
    username,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (!existing.empty) {
    const existingDoc = existing.docs[0];
    await existingDoc.ref.update(accountData);
    // Clear cache
    const existingData = existingDoc.data() as InstagramAccount;
    if (existingData.instagramAccountId) {
      accountCache.delete(existingData.instagramAccountId);
    }
    return existingDoc.id;
  } else {
    const docRef = await db.collection('accounts').add({
      ...accountData,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      isActive: true,
      connectionStatus: 'connected',
    });
    return docRef.id;
  }
}

/**
 * Build the system prompt for an account
 * Combines AI personality settings into a complete prompt
 */
export function buildSystemPrompt(account: InstagramAccount): string {
  const { aiPersonality, settings } = account;

  // Start with identity (name and description)
  let prompt = `You are ${aiPersonality.name}.`;

  if (aiPersonality.description) {
    prompt += ` ${aiPersonality.description}`;
  }

  // Add the main system prompt
  prompt += `\n\n${aiPersonality.systemPrompt}`;

  // Add goals
  if (aiPersonality.goals.length > 0) {
    prompt += `\n\nYour goals:\n${aiPersonality.goals.map((g, i) => `${i + 1}. ${g}`).join('\n')}`;
  }

  // Add tone guidance
  const toneGuides: Record<string, string> = {
    friendly: 'Be warm, approachable, and use casual language.',
    professional: 'Be polite, formal, and business-appropriate.',
    casual: 'Be relaxed, use slang when appropriate, like chatting with a friend.',
    enthusiastic: 'Be energetic, use exclamations, show excitement!',
  };
  prompt += `\n\nTone: ${toneGuides[aiPersonality.tone] || toneGuides.friendly}`;

  // Add custom instructions if provided
  if (aiPersonality.customInstructions) {
    prompt += `\n\nAdditional instructions:\n${aiPersonality.customInstructions}`;
  }

  // Add forbidden topics if provided
  if (aiPersonality.forbiddenTopics && aiPersonality.forbiddenTopics.length > 0) {
    prompt += `\n\nDo NOT discuss: ${aiPersonality.forbiddenTopics.join(', ')}`;
  }

  // Add handoff keywords if provided
  if (aiPersonality.handoffKeywords && aiPersonality.handoffKeywords.length > 0) {
    prompt += `\n\nIf the user mentions any of these topics, inform them a human will follow up: ${aiPersonality.handoffKeywords.join(', ')}`;
  }

  // Add response length limit and formatting rules
  prompt += `\n\nIMPORTANT: Keep responses under ${settings.maxResponseLength} characters. Do NOT use emojis in your responses.`;

  // Add lead collection instructions
  if (settings.collectEmail) {
    const emailPrompt = settings.emailPrompt || 'When appropriate, ask for their email to send more information.';
    prompt += `\n\n${emailPrompt}`;
  }
  if (settings.collectPhone) {
    const phonePrompt = settings.phonePrompt || 'For scheduling or urgent matters, ask for their phone number.';
    prompt += `\n\n${phonePrompt}`;
  }

  return prompt;
}

/**
 * Build few-shot examples for AI context
 */
export function buildExampleMessages(account: InstagramAccount): { role: 'user' | 'assistant'; content: string }[] {
  const examples: { role: 'user' | 'assistant'; content: string }[] = [];

  if (account.aiPersonality.exampleConversations) {
    for (const example of account.aiPersonality.exampleConversations) {
      examples.push({ role: 'user', content: example.userMessage });
      examples.push({ role: 'assistant', content: example.assistantResponse });
    }
  }

  return examples;
}

/**
 * Check if it's within business hours for an account
 */
export function isWithinBusinessHours(account: InstagramAccount): boolean {
  if (!account.settings.businessHoursOnly) {
    return true;
  }

  const businessHours = account.settings.businessHours;
  if (!businessHours) {
    return true;
  }

  try {
    // Get current time in account's timezone
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: businessHours.timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      weekday: 'short',
    });

    const parts = formatter.formatToParts(now);
    const hourPart = parts.find(p => p.type === 'hour');
    const minutePart = parts.find(p => p.type === 'minute');
    const dayPart = parts.find(p => p.type === 'weekday');

    if (!hourPart || !minutePart) {
      return true;
    }

    const currentTime = `${hourPart.value}:${minutePart.value}`;
    const currentDay = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(dayPart?.value || 'Mon');

    // Check day of week
    if (businessHours.days && !businessHours.days.includes(currentDay)) {
      return false;
    }

    // Check time range
    return currentTime >= businessHours.start && currentTime <= businessHours.end;
  } catch (error) {
    console.error('Error checking business hours:', error);
    return true; // Default to allowing messages
  }
}

/**
 * Clear account cache (call after updates)
 */
export function clearAccountCache(instagramAccountId?: string): void {
  if (instagramAccountId) {
    accountCache.delete(instagramAccountId);
  } else {
    accountCache.clear();
  }
}

/**
 * Example account configurations for different use cases
 */
export const EXAMPLE_ACCOUNTS = {
  athlete: {
    aiPersonality: {
      name: "Athlete's Assistant",
      description: "Professional athlete's Instagram assistant",
      systemPrompt: `You are an Instagram DM assistant for a professional athlete.

You help manage their DMs by:
- Warmly greeting fans and answering questions about their sport
- Sharing info about upcoming competitions when asked
- Handling sponsorship/business inquiries by collecting contact info
- Directing coaching inquiries appropriately

Always be friendly, authentic, and represent their professional athletic brand.
Never make up specific competition dates or results - say you'll have them follow up.`,
      tone: 'friendly' as const,
      goals: [
        'Engage warmly with fans',
        'Answer sport-related questions',
        'Collect emails for business inquiries',
        'Direct serious inquiries to the athlete',
      ],
    },
    settings: {
      maxResponseLength: 200,
      collectEmail: true,
      collectPhone: false,
      autoWelcomeNewFollowers: true,
      welcomeMessage: "Hey! Thanks for the follow! Feel free to reach out if you have any questions!",
      businessHoursOnly: false,
      notifyOnNewLead: true,
      notifyOnHandoff: true,
    },
  },

  business: {
    aiPersonality: {
      name: "Customer Support",
      description: "Business customer support assistant",
      systemPrompt: `You are a helpful customer support assistant for an online business.

You help by:
- Answering product questions
- Helping with order inquiries (ask for order number)
- Directing complex issues to human support
- Collecting emails for follow-up

Be friendly but efficient. If you can't help, offer to have a team member follow up.`,
      tone: 'professional' as const,
      goals: [
        'Answer product questions',
        'Help with order issues',
        'Collect contact info for follow-up',
        'Escalate complex issues',
      ],
    },
    settings: {
      maxResponseLength: 250,
      collectEmail: true,
      collectPhone: true,
      autoWelcomeNewFollowers: false,
      businessHoursOnly: true,
      businessHours: {
        timezone: 'America/New_York',
        start: '09:00',
        end: '18:00',
        days: [1, 2, 3, 4, 5], // Mon-Fri
      },
      outOfHoursMessage: "Thanks for reaching out! Our team is currently offline but we'll respond first thing in the morning.",
      notifyOnNewLead: true,
      notifyOnHandoff: true,
    },
  },

  creator: {
    aiPersonality: {
      name: "Content Creator Assistant",
      description: "Social media content creator assistant",
      systemPrompt: `You are an assistant for a content creator/influencer.

You help by:
- Thanking followers for their support
- Answering FAQs about content and collaborations
- Collecting emails for exclusive content access
- Routing brand deal inquiries appropriately

Be authentic and match the creator's voice. Keep it real, not corporate.`,
      tone: 'casual' as const,
      goals: [
        'Thank and engage followers',
        'Answer content FAQs',
        'Collect emails for exclusives',
        'Route business inquiries',
      ],
    },
    settings: {
      maxResponseLength: 200,
      collectEmail: true,
      collectPhone: false,
      autoWelcomeNewFollowers: true,
      welcomeMessage: "Hey! Thanks for following! Got any questions? Feel free to ask!",
      businessHoursOnly: false,
      notifyOnNewLead: true,
      notifyOnHandoff: false,
    },
  },
};
