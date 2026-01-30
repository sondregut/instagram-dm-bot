import { db, Automation, Conversation, ConversationMessage } from '../firebase';
import { sendInstagramDM, sendQuickReplyDM, getInstagramUser } from '../services/instagram';
import { generateAIResponse, analyzeIntent } from '../services/ai';
import { createOrUpdateLead } from '../services/leads';
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
 */
export async function handleMessage(event: InstagramMessageEvent): Promise<void> {
  const senderId = event.sender.id;
  const messageText = sanitizeInput(event.message?.text || '');
  const quickReplyPayload = event.message?.quick_reply?.payload || event.postback?.payload;

  console.log(`[DEBUG] Received message from ${senderId}: ${messageText.substring(0, 50)}...`);
  console.log(`[DEBUG] Full event:`, JSON.stringify(event));

  // Handle quick reply payloads
  if (quickReplyPayload) {
    console.log('[DEBUG] Handling quick reply');
    await handleQuickReply(senderId, quickReplyPayload);
    return;
  }

  // Skip if no text content
  if (!messageText) {
    console.log('[DEBUG] No text content in message, skipping');
    return;
  }

  // Get or create conversation
  console.log('[DEBUG] Getting or creating conversation...');
  const conversation = await getOrCreateConversation(senderId);
  console.log('[DEBUG] Conversation state:', conversation.conversationState);

  // Check for keyword triggers first
  console.log('[DEBUG] Checking keyword triggers...');
  const triggeredAutomation = await checkKeywordTriggers(messageText);
  console.log('[DEBUG] Triggered automation:', triggeredAutomation?.id || 'none');

  if (triggeredAutomation && !conversation.currentAutomationId) {
    // Start new automation flow
    await startAutomation(senderId, conversation, triggeredAutomation, messageText);
    return;
  }

  // Handle based on conversation state
  switch (conversation.conversationState) {
    case 'collecting_email':
      await handleEmailCollection(senderId, conversation, messageText);
      break;

    case 'collecting_phone':
      await handlePhoneCollection(senderId, conversation, messageText);
      break;

    case 'ai_chat':
      await handleAIConversation(senderId, conversation, messageText);
      break;

    case 'greeting':
    case 'completed':
    default:
      // Check if there's an active automation, otherwise handle with AI
      if (conversation.currentAutomationId) {
        await handleAIConversation(senderId, conversation, messageText);
      } else {
        // No active automation - check for any keyword triggers again or use default response
        const automation = await checkKeywordTriggers(messageText);
        if (automation) {
          await startAutomation(senderId, conversation, automation, messageText);
        } else {
          await sendDefaultResponse(senderId, messageText);
        }
      }
  }
}

/**
 * Get or create a conversation record
 */
async function getOrCreateConversation(instagramUserId: string): Promise<Conversation> {
  const conversations = await db.collection('conversations')
    .where('instagramUserId', '==', instagramUserId)
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();

  if (!conversations.empty) {
    const doc = conversations.docs[0];
    return { id: doc.id, ...doc.data() } as Conversation;
  }

  // Get user info
  const userInfo = await getInstagramUser(instagramUserId);

  // Create new conversation
  const conversationRef = db.collection('conversations').doc();
  const newConversation: Conversation = {
    id: conversationRef.id,
    instagramUserId,
    username: userInfo?.username || 'unknown',
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
 * Check if message matches any keyword triggers
 */
async function checkKeywordTriggers(messageText: string): Promise<Automation | null> {
  const automations = await db.collection('automations')
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
  triggerMessage: string
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
    await sendInstagramDM(senderId, automation.response.staticMessage);
    await addMessageToConversation(conversation.id, 'assistant', automation.response.staticMessage);

    // If collecting email, prompt for it
    if (automation.collectEmail) {
      const emailPrompt = "I'd love to send you more info! What's your email address?";
      await sendInstagramDM(senderId, emailPrompt);
      await addMessageToConversation(conversation.id, 'assistant', emailPrompt);

      await db.collection('conversations').doc(conversation.id).update({
        conversationState: 'collecting_email',
      });
    }
  } else if (automation.response.type === 'ai' && automation.response.aiPrompt) {
    // Start AI conversation
    const aiResponse = await generateAIResponse(
      automation.response.aiPrompt,
      [{ role: 'user', content: triggerMessage }]
    );

    await sendInstagramDM(senderId, aiResponse);
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
  userMessage: string
): Promise<void> {
  // Record user message
  await addMessageToConversation(conversation.id, 'user', userMessage);

  // Get automation prompt
  let systemPrompt = "You are a helpful Instagram DM assistant. Keep responses under 200 characters.";

  if (conversation.currentAutomationId) {
    const automationDoc = await db.collection('automations')
      .doc(conversation.currentAutomationId)
      .get();

    if (automationDoc.exists) {
      const automation = automationDoc.data() as Automation;
      systemPrompt = automation.response.aiPrompt || systemPrompt;
    }
  }

  // Check if user provided email
  const emailMatch = extractEmail(userMessage);
  if (emailMatch && isValidEmail(emailMatch)) {
    await handleEmailProvided(senderId, conversation, emailMatch);
    return;
  }

  // Check if user provided phone
  const phoneMatch = extractPhone(userMessage);
  if (phoneMatch && isValidPhone(phoneMatch)) {
    await handlePhoneProvided(senderId, conversation, phoneMatch);
    return;
  }

  // Build conversation history
  const messages = conversation.messages.map(m => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));
  messages.push({ role: 'user', content: userMessage });

  // Generate AI response
  const aiResponse = await generateAIResponse(systemPrompt, messages);

  await sendInstagramDM(senderId, aiResponse);
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
  userMessage: string
): Promise<void> {
  await addMessageToConversation(conversation.id, 'user', userMessage);

  const email = extractEmail(userMessage);

  if (email && isValidEmail(email)) {
    await handleEmailProvided(senderId, conversation, email);
  } else {
    // Invalid email, ask again
    const response = "Hmm, that doesn't look like a valid email. Could you try again?";
    await sendInstagramDM(senderId, response);
    await addMessageToConversation(conversation.id, 'assistant', response);
  }
}

/**
 * Handle when user provides a valid email
 */
async function handleEmailProvided(
  senderId: string,
  conversation: Conversation,
  email: string
): Promise<void> {
  // Save email
  await db.collection('conversations').doc(conversation.id).update({
    'collectedData.email': email,
    lastMessageAt: admin.firestore.Timestamp.now(),
  });

  // Create/update lead
  await createOrUpdateLead({
    instagramUserId: conversation.instagramUserId,
    username: conversation.username,
    email,
    source: 'keyword_dm',
    automationId: conversation.currentAutomationId || undefined,
  });

  // Check if we should also collect phone
  const automation = conversation.currentAutomationId
    ? await db.collection('automations').doc(conversation.currentAutomationId).get()
    : null;

  const automationData = automation?.data() as Automation | undefined;

  // Send thank you message
  const thankYou = "Thanks! I've got your email. You'll hear from us soon!";
  await sendInstagramDM(senderId, thankYou);
  await addMessageToConversation(conversation.id, 'assistant', thankYou);

  // Mark conversation as completed
  await db.collection('conversations').doc(conversation.id).update({
    conversationState: 'completed',
  });
}

/**
 * Handle phone collection state
 */
async function handlePhoneCollection(
  senderId: string,
  conversation: Conversation,
  userMessage: string
): Promise<void> {
  await addMessageToConversation(conversation.id, 'user', userMessage);

  const phone = extractPhone(userMessage);

  if (phone && isValidPhone(phone)) {
    await handlePhoneProvided(senderId, conversation, phone);
  } else {
    const response = "I couldn't recognize that as a phone number. Could you try again?";
    await sendInstagramDM(senderId, response);
    await addMessageToConversation(conversation.id, 'assistant', response);
  }
}

/**
 * Handle when user provides a valid phone number
 */
async function handlePhoneProvided(
  senderId: string,
  conversation: Conversation,
  phone: string
): Promise<void> {
  await db.collection('conversations').doc(conversation.id).update({
    'collectedData.phone': phone,
    conversationState: 'completed',
    lastMessageAt: admin.firestore.Timestamp.now(),
  });

  await createOrUpdateLead({
    instagramUserId: conversation.instagramUserId,
    username: conversation.username,
    phone,
    source: 'keyword_dm',
    automationId: conversation.currentAutomationId || undefined,
  });

  const thankYou = "Got it! Thanks for sharing your number.";
  await sendInstagramDM(senderId, thankYou);
  await addMessageToConversation(conversation.id, 'assistant', thankYou);
}

/**
 * Handle quick reply button clicks
 */
async function handleQuickReply(senderId: string, payload: string): Promise<void> {
  console.log(`Quick reply from ${senderId}: ${payload}`);

  const conversation = await getOrCreateConversation(senderId);

  // Parse payload (format: action:data)
  const [action, data] = payload.split(':');

  switch (action) {
    case 'learn_more':
      await sendInstagramDM(senderId, "Great! What would you like to know more about?");
      break;

    case 'get_started':
      await sendInstagramDM(senderId, "Awesome! Let me get your email to send you our starter guide.");
      await db.collection('conversations').doc(conversation.id).update({
        conversationState: 'collecting_email',
      });
      break;

    case 'talk_to_human':
      await sendInstagramDM(senderId, "No problem! A team member will reach out to you shortly.");
      break;

    default:
      console.log(`Unknown quick reply action: ${action}`);
  }
}

/**
 * Send default response when no automation matches
 */
async function sendDefaultResponse(senderId: string, userMessage: string): Promise<void> {
  const defaultPrompt = `You are a friendly Instagram DM assistant.
Keep responses brief and helpful (under 200 characters).
If the user seems to want information, politely let them know you'll get back to them.`;

  const response = await generateAIResponse(defaultPrompt, [
    { role: 'user', content: userMessage },
  ]);

  await sendInstagramDM(senderId, response);
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
