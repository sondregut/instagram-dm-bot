import { db, Automation, Conversation, ConversationMessage, InstagramAccount } from '../firebase';
import { sendInstagramDM, sendQuickReplyDM, getInstagramUser } from '../services/instagram';
import { generateAIResponse, analyzeIntent } from '../services/ai';
import { createOrUpdateLead } from '../services/leads';
import { buildSystemPrompt, buildExampleMessages, isWithinBusinessHours } from '../services/accounts';
import { containsKeyword, isValidEmail, extractEmail, isValidPhone, extractPhone, sanitizeInput } from '../utils/validators';
import * as admin from 'firebase-admin';

export interface InstagramMessageEvent {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: {
    mid: string;
    text?: string;
    quick_reply?: { payload: string };
    attachments?: any[];
  };
  postback?: {
    payload: string;
  };
}

/**
 * Main message handler - routes incoming DMs
 * @param event - The Instagram message event
 * @param account - The Instagram account that received the message
 */
export async function handleMessage(
  event: InstagramMessageEvent,
  account: InstagramAccount
): Promise<void> {
  const senderId = event.sender.id;
  const messageText = sanitizeInput(event.message?.text || '');
  const quickReplyPayload = event.message?.quick_reply?.payload || event.postback?.payload;

  console.log(`[DEBUG] Received message from ${senderId}: ${messageText.substring(0, 50)}...`);
  console.log(`[DEBUG] Account: ${account.username} (${account.id})`);

  // Check if we're within business hours
  if (!isWithinBusinessHours(account)) {
    const outOfHoursMessage = account.settings.outOfHoursMessage ||
      "Thanks for reaching out! We're currently outside business hours but will respond soon.";
    await sendInstagramDM(senderId, outOfHoursMessage, account);
    return;
  }

  // Handle quick reply payloads
  if (quickReplyPayload) {
    console.log('[DEBUG] Handling quick reply');
    await handleQuickReply(senderId, quickReplyPayload, account);
    return;
  }

  // Skip if no text content
  if (!messageText) {
    console.log('[DEBUG] No text content in message, skipping');
    return;
  }

  // Get or create conversation
  console.log('[DEBUG] Getting or creating conversation...');
  const conversation = await getOrCreateConversation(senderId, account);
  console.log('[DEBUG] Conversation state:', conversation.conversationState);

  // Check for handoff keywords first
  if (account.aiPersonality.handoffKeywords && account.aiPersonality.handoffKeywords.length > 0) {
    const handoffMatch = containsKeyword(messageText, account.aiPersonality.handoffKeywords);
    if (handoffMatch) {
      await handleHandoff(senderId, conversation, account, messageText);
      return;
    }
  }

  // Check for keyword triggers
  console.log('[DEBUG] Checking keyword triggers...');
  const triggeredAutomation = await checkKeywordTriggers(messageText, account.id);
  console.log('[DEBUG] Triggered automation:', triggeredAutomation?.id || 'none');

  if (triggeredAutomation && !conversation.currentAutomationId) {
    // Start new automation flow
    await startAutomation(senderId, conversation, triggeredAutomation, messageText, account);
    return;
  }

  // Handle based on conversation state
  switch (conversation.conversationState) {
    case 'collecting_email':
      await handleEmailCollection(senderId, conversation, messageText, account);
      break;

    case 'collecting_phone':
      await handlePhoneCollection(senderId, conversation, messageText, account);
      break;

    case 'ai_chat':
      await handleAIConversation(senderId, conversation, messageText, account);
      break;

    case 'greeting':
    case 'completed':
    default:
      // Check if there's an active automation, otherwise handle with AI
      if (conversation.currentAutomationId) {
        await handleAIConversation(senderId, conversation, messageText, account);
      } else {
        // No active automation - check for any keyword triggers again or use default response
        const automation = await checkKeywordTriggers(messageText, account.id);
        if (automation) {
          await startAutomation(senderId, conversation, automation, messageText, account);
        } else {
          await sendDefaultResponse(senderId, messageText, account);
        }
      }
  }
}

/**
 * Get or create a conversation record
 */
async function getOrCreateConversation(
  instagramUserId: string,
  account: InstagramAccount
): Promise<Conversation> {
  // Look for existing conversation for this user + account
  const conversations = await db.collection('conversations')
    .where('accountId', '==', account.id)
    .where('instagramUserId', '==', instagramUserId)
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();

  if (!conversations.empty) {
    const doc = conversations.docs[0];
    return { id: doc.id, ...doc.data() } as Conversation;
  }

  // Get user info
  const userInfo = await getInstagramUser(instagramUserId, account);

  // Use username if available, otherwise use truncated ID as fallback
  const username = userInfo?.username || `user_${instagramUserId.slice(-8)}`;

  // Create new conversation
  const conversationRef = db.collection('conversations').doc();
  const newConversation: Conversation = {
    id: conversationRef.id,
    userId: account.userId,
    accountId: account.id,
    instagramUserId,
    username,
    currentAutomationId: null,
    conversationState: 'greeting',
    collectedData: {},
    messages: [],
    lastMessageAt: admin.firestore.Timestamp.now(),
    createdAt: admin.firestore.Timestamp.now(),
  };

  await conversationRef.set(newConversation);

  return newConversation;
}

/**
 * Check if message matches any keyword triggers for this account
 */
async function checkKeywordTriggers(
  messageText: string,
  accountId: string
): Promise<Automation | null> {
  const automations = await db.collection('automations')
    .where('accountId', '==', accountId)
    .where('type', 'in', ['keyword_dm', 'comment_to_dm'])
    .where('isActive', '==', true)
    .get();

  for (const doc of automations.docs) {
    const automation = { id: doc.id, ...doc.data() } as Automation;
    const matchedKeyword = containsKeyword(messageText, automation.trigger.keywords);

    if (matchedKeyword) {
      console.log(`Keyword "${matchedKeyword}" matched automation: ${automation.id}`);
      return automation;
    }
  }

  return null;
}

/**
 * Start an automation flow
 */
async function startAutomation(
  senderId: string,
  conversation: Conversation,
  automation: Automation,
  triggerMessage: string,
  account: InstagramAccount
): Promise<void> {
  // Record the trigger message
  await addMessageToConversation(conversation.id, 'user', triggerMessage);

  // Update conversation state
  await db.collection('conversations').doc(conversation.id).update({
    currentAutomationId: automation.id,
    conversationState: automation.collectEmail ? 'ai_chat' : 'ai_chat',
    lastMessageAt: admin.firestore.Timestamp.now(),
  });

  // Send initial response
  if (automation.response.type === 'static' && automation.response.staticMessage) {
    await sendInstagramDM(senderId, automation.response.staticMessage, account);
    await addMessageToConversation(conversation.id, 'assistant', automation.response.staticMessage);

    // If collecting email, prompt for it
    if (automation.collectEmail) {
      const emailPrompt = account.settings.emailPrompt ||
        "I'd love to send you more info! What's your email address?";
      await sendInstagramDM(senderId, emailPrompt, account);
      await addMessageToConversation(conversation.id, 'assistant', emailPrompt);

      await db.collection('conversations').doc(conversation.id).update({
        conversationState: 'collecting_email',
      });
    }
  } else if (automation.response.type === 'ai' && automation.response.aiPrompt) {
    // Start AI conversation with automation-specific prompt
    const systemPrompt = automation.response.aiPrompt + '\n\n' + buildSystemPrompt(account);
    const exampleMessages = buildExampleMessages(account);

    const aiResponse = await generateAIResponse(
      systemPrompt,
      [...exampleMessages, { role: 'user', content: triggerMessage }]
    );

    await sendInstagramDM(senderId, aiResponse, account);
    await addMessageToConversation(conversation.id, 'assistant', aiResponse);

    await db.collection('conversations').doc(conversation.id).update({
      conversationState: 'ai_chat',
    });
  }
}

/**
 * Handle AI-powered conversation
 */
async function handleAIConversation(
  senderId: string,
  conversation: Conversation,
  userMessage: string,
  account: InstagramAccount
): Promise<void> {
  // Record user message
  await addMessageToConversation(conversation.id, 'user', userMessage);

  // Build system prompt from account settings
  let systemPrompt = buildSystemPrompt(account);

  // If there's an active automation, add its prompt
  if (conversation.currentAutomationId) {
    const automationDoc = await db.collection('automations')
      .doc(conversation.currentAutomationId)
      .get();

    if (automationDoc.exists) {
      const automation = automationDoc.data() as Automation;
      if (automation.response.aiPrompt) {
        systemPrompt = automation.response.aiPrompt + '\n\n' + systemPrompt;
      }
    }
  }

  // Check if user provided email
  const emailMatch = extractEmail(userMessage);
  if (emailMatch && isValidEmail(emailMatch)) {
    await handleEmailProvided(senderId, conversation, emailMatch, account);
    return;
  }

  // Check if user provided phone
  const phoneMatch = extractPhone(userMessage);
  if (phoneMatch && isValidPhone(phoneMatch)) {
    await handlePhoneProvided(senderId, conversation, phoneMatch, account);
    return;
  }

  // Build conversation history
  const exampleMessages = buildExampleMessages(account);
  const historyMessages = conversation.messages.map(m => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  const messages = [
    ...exampleMessages,
    ...historyMessages,
    { role: 'user' as const, content: userMessage },
  ];

  // Generate AI response
  const aiResponse = await generateAIResponse(systemPrompt, messages);

  await sendInstagramDM(senderId, aiResponse, account);
  await addMessageToConversation(conversation.id, 'assistant', aiResponse);

  // Update last message time
  await db.collection('conversations').doc(conversation.id).update({
    lastMessageAt: admin.firestore.Timestamp.now(),
  });
}

/**
 * Handle email collection state
 */
async function handleEmailCollection(
  senderId: string,
  conversation: Conversation,
  userMessage: string,
  account: InstagramAccount
): Promise<void> {
  await addMessageToConversation(conversation.id, 'user', userMessage);

  const email = extractEmail(userMessage);

  if (email && isValidEmail(email)) {
    await handleEmailProvided(senderId, conversation, email, account);
  } else {
    // Invalid email, ask again
    const response = "Hmm, that doesn't look like a valid email. Could you try again?";
    await sendInstagramDM(senderId, response, account);
    await addMessageToConversation(conversation.id, 'assistant', response);
  }
}

/**
 * Handle when user provides a valid email
 */
async function handleEmailProvided(
  senderId: string,
  conversation: Conversation,
  email: string,
  account: InstagramAccount
): Promise<void> {
  // Save email
  await db.collection('conversations').doc(conversation.id).update({
    'collectedData.email': email,
    lastMessageAt: admin.firestore.Timestamp.now(),
  });

  // Create/update lead
  await createOrUpdateLead({
    userId: account.userId,
    accountId: account.id,
    instagramUserId: conversation.instagramUserId,
    username: conversation.username,
    email,
    source: 'keyword_dm',
    automationId: conversation.currentAutomationId || undefined,
  });

  // Send thank you message
  const thankYou = account.settings.thankYouMessage ||
    "Thanks! I've got your email. You'll hear from us soon!";
  await sendInstagramDM(senderId, thankYou, account);
  await addMessageToConversation(conversation.id, 'assistant', thankYou);

  // Check if we should also collect phone
  if (account.settings.collectPhone) {
    const phonePrompt = account.settings.phonePrompt ||
      "Would you also like to share your phone number for faster communication?";
    await sendInstagramDM(senderId, phonePrompt, account);
    await addMessageToConversation(conversation.id, 'assistant', phonePrompt);

    await db.collection('conversations').doc(conversation.id).update({
      conversationState: 'collecting_phone',
    });
  } else {
    // Mark conversation as completed
    await db.collection('conversations').doc(conversation.id).update({
      conversationState: 'completed',
    });
  }
}

/**
 * Handle phone collection state
 */
async function handlePhoneCollection(
  senderId: string,
  conversation: Conversation,
  userMessage: string,
  account: InstagramAccount
): Promise<void> {
  await addMessageToConversation(conversation.id, 'user', userMessage);

  const phone = extractPhone(userMessage);

  if (phone && isValidPhone(phone)) {
    await handlePhoneProvided(senderId, conversation, phone, account);
  } else {
    const response = "I couldn't recognize that as a phone number. Could you try again?";
    await sendInstagramDM(senderId, response, account);
    await addMessageToConversation(conversation.id, 'assistant', response);
  }
}

/**
 * Handle when user provides a valid phone number
 */
async function handlePhoneProvided(
  senderId: string,
  conversation: Conversation,
  phone: string,
  account: InstagramAccount
): Promise<void> {
  await db.collection('conversations').doc(conversation.id).update({
    'collectedData.phone': phone,
    conversationState: 'completed',
    lastMessageAt: admin.firestore.Timestamp.now(),
  });

  await createOrUpdateLead({
    userId: account.userId,
    accountId: account.id,
    instagramUserId: conversation.instagramUserId,
    username: conversation.username,
    phone,
    source: 'keyword_dm',
    automationId: conversation.currentAutomationId || undefined,
  });

  const thankYou = "Got it! Thanks for sharing your number.";
  await sendInstagramDM(senderId, thankYou, account);
  await addMessageToConversation(conversation.id, 'assistant', thankYou);
}

/**
 * Handle handoff to human
 */
async function handleHandoff(
  senderId: string,
  conversation: Conversation,
  account: InstagramAccount,
  userMessage: string
): Promise<void> {
  await addMessageToConversation(conversation.id, 'user', userMessage);

  const handoffMessage = "I'll have a team member reach out to you directly about this. They'll be in touch soon!";
  await sendInstagramDM(senderId, handoffMessage, account);
  await addMessageToConversation(conversation.id, 'assistant', handoffMessage);

  // Update conversation state
  await db.collection('conversations').doc(conversation.id).update({
    conversationState: 'completed',
    'collectedData.needsHandoff': true,
    lastMessageAt: admin.firestore.Timestamp.now(),
  });

  // TODO: Send notification to account owner about handoff
  console.log(`[Handoff] User ${conversation.username} needs human followup for account ${account.username}`);
}

/**
 * Handle quick reply button clicks
 */
async function handleQuickReply(
  senderId: string,
  payload: string,
  account: InstagramAccount
): Promise<void> {
  console.log(`Quick reply from ${senderId}: ${payload}`);

  const conversation = await getOrCreateConversation(senderId, account);

  // Parse payload (format: action:data)
  const [action, data] = payload.split(':');

  switch (action) {
    case 'learn_more':
      await sendInstagramDM(senderId, "Great! What would you like to know more about?", account);
      break;

    case 'get_started':
      const emailPrompt = account.settings.emailPrompt ||
        "Awesome! Let me get your email to send you our starter guide.";
      await sendInstagramDM(senderId, emailPrompt, account);
      await db.collection('conversations').doc(conversation.id).update({
        conversationState: 'collecting_email',
      });
      break;

    case 'talk_to_human':
      await handleHandoff(senderId, conversation, account, '[Quick Reply: Talk to Human]');
      break;

    default:
      console.log(`Unknown quick reply action: ${action}`);
  }
}

/**
 * Send default response when no automation matches
 */
async function sendDefaultResponse(
  senderId: string,
  userMessage: string,
  account: InstagramAccount
): Promise<void> {
  // Use account's AI personality for default responses
  const systemPrompt = buildSystemPrompt(account);
  const exampleMessages = buildExampleMessages(account);

  const response = await generateAIResponse(systemPrompt, [
    ...exampleMessages,
    { role: 'user', content: userMessage },
  ]);

  await sendInstagramDM(senderId, response, account);
}

/**
 * Add a message to conversation history
 */
async function addMessageToConversation(
  conversationId: string,
  role: 'user' | 'assistant',
  content: string
): Promise<void> {
  const message: ConversationMessage = {
    role,
    content,
    timestamp: admin.firestore.Timestamp.now(),
  };

  await db.collection('conversations').doc(conversationId).update({
    messages: admin.firestore.FieldValue.arrayUnion(message),
    lastMessageAt: admin.firestore.Timestamp.now(),
  });
}
