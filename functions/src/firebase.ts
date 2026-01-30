import * as admin from 'firebase-admin';

admin.initializeApp();

export const db = admin.firestore();
export const auth = admin.auth();
export const storage = admin.storage();

// Firestore collection references
export const collections = {
  users: db.collection('users'),
  accounts: db.collection('accounts'),
  automations: db.collection('automations'),
  conversations: db.collection('conversations'),
  leads: db.collection('leads'),
  config: db.collection('config'),
  sentMessages: db.collection('sent_messages'),
  knowledgeBase: db.collection('knowledge_base'),
  flows: db.collection('flows'),
  flowExecutions: db.collection('flow_executions'),
  scheduledExecutions: db.collection('scheduled_executions'),
};

// ============================================
// USER TYPES
// ============================================

export interface User {
  id: string;
  email: string;
  displayName?: string;
  subscription: 'free' | 'starter' | 'pro' | 'enterprise';
  subscriptionExpiresAt?: admin.firestore.Timestamp;
  createdAt: admin.firestore.Timestamp;
  updatedAt?: admin.firestore.Timestamp;
}

// ============================================
// AUTOMATION TYPES
// ============================================

export interface Automation {
  id: string;
  userId: string;      // Owner of this automation
  accountId: string;   // Which Instagram account this belongs to
  type: 'comment_to_dm' | 'keyword_dm' | 'new_follower' | 'story_reply' | 'story_mention';
  trigger: {
    keywords: string[];
    postIds?: string[];
    storyIds?: string[]; // For story-specific triggers
  };
  response: {
    type: 'static' | 'ai';
    staticMessage?: string;
    aiPrompt?: string;
  };
  collectEmail: boolean;
  isActive: boolean;
  createdAt: admin.firestore.Timestamp;
  updatedAt?: admin.firestore.Timestamp;
}

// ============================================
// CONVERSATION TYPES
// ============================================

export interface Conversation {
  id: string;
  userId: string;      // Owner of this conversation
  accountId: string;   // Which Instagram account this belongs to
  instagramUserId: string;
  username: string;
  currentAutomationId: string | null;
  conversationState: 'greeting' | 'collecting_email' | 'collecting_phone' | 'ai_chat' | 'completed';
  collectedData: {
    email?: string;
    phone?: string;
    name?: string;
  };
  messages: ConversationMessage[];
  lastMessageAt: admin.firestore.Timestamp;
  createdAt: admin.firestore.Timestamp;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: admin.firestore.Timestamp;
}

// ============================================
// LEAD TYPES
// ============================================

export interface Lead {
  id: string;
  userId: string;      // Owner of this lead
  accountId: string;   // Which Instagram account this came from
  instagramUserId: string;
  username: string;
  email?: string;
  phone?: string;
  name?: string;
  source: 'comment_to_dm' | 'keyword_dm' | 'new_follower' | 'story_reply' | 'story_mention' | 'flow' | 'manual';
  automationId?: string;
  flowId?: string;     // If lead came from a flow
  tags?: string[];
  notes?: string;
  createdAt: admin.firestore.Timestamp;
  updatedAt?: admin.firestore.Timestamp;
}

// ============================================
// INSTAGRAM CONFIG TYPES (Legacy - for backwards compatibility)
// ============================================

export interface InstagramConfig {
  accessToken: string;
  pageId: string;
  instagramAccountId: string;
  tokenExpiresAt: admin.firestore.Timestamp;
  lastCheckedFollowers: string[];
}

// ============================================
// INSTAGRAM ACCOUNT TYPES (Multi-Tenant)
// ============================================

/**
 * Instagram Account Configuration (Multi-Account Support)
 * Each account has its own settings, token, and AI personality
 */
export interface InstagramAccount {
  id: string;
  userId: string;      // Owner of this account (Firebase Auth UID)

  // Account identifiers
  username: string;
  instagramAccountId: string;
  pageId: string;
  pageName?: string;
  accessToken: string;  // Encrypted
  tokenExpiresAt?: admin.firestore.Timestamp;

  // AI Personality & Behavior
  aiPersonality: AIPersonality;

  // Knowledge Base reference (for RAG)
  knowledgeBaseId?: string;

  // Response settings
  settings: AccountSettings;

  // Status
  isActive: boolean;
  connectionStatus: 'connected' | 'expired' | 'error';
  lastWebhookAt?: admin.firestore.Timestamp;
  createdAt: admin.firestore.Timestamp;
  updatedAt?: admin.firestore.Timestamp;
}

export interface AIPersonality {
  name: string;           // e.g., "Sondre's Assistant"
  description: string;    // Brief description of the account/brand
  systemPrompt: string;   // The main AI prompt defining behavior
  tone: 'friendly' | 'professional' | 'casual' | 'enthusiastic';
  goals: string[];        // e.g., ["Answer questions", "Collect emails", "Schedule calls"]

  // Advanced AI customization
  customInstructions?: string;  // Additional instructions from user
  exampleConversations?: ExampleConversation[];  // Few-shot examples
  forbiddenTopics?: string[];   // Topics to avoid
  handoffKeywords?: string[];   // Keywords that trigger human handoff
}

export interface ExampleConversation {
  userMessage: string;
  assistantResponse: string;
}

export interface AccountSettings {
  maxResponseLength: number;  // Max characters (default 200 for IG)
  collectEmail: boolean;
  collectPhone: boolean;
  autoWelcomeNewFollowers: boolean;
  welcomeMessage?: string;
  businessHoursOnly: boolean;
  businessHours?: {
    timezone: string;
    start: string;  // e.g., "09:00"
    end: string;    // e.g., "17:00"
    days: number[]; // 0-6, Sunday-Saturday
  };
  outOfHoursMessage?: string;

  // Lead capture settings
  emailPrompt?: string;
  phonePrompt?: string;
  thankYouMessage?: string;

  // Notification settings
  notifyOnNewLead: boolean;
  notifyOnHandoff: boolean;
  notificationEmail?: string;
}

// ============================================
// KNOWLEDGE BASE TYPES (For AI Customization)
// ============================================

export interface KnowledgeBase {
  id: string;
  userId: string;
  accountId: string;
  name: string;
  description?: string;

  // Content sources
  documents: KnowledgeDocument[];
  websites: KnowledgeWebsite[];
  faqs: KnowledgeFAQ[];

  // Processing status
  status: 'processing' | 'ready' | 'error';
  lastProcessedAt?: admin.firestore.Timestamp;

  createdAt: admin.firestore.Timestamp;
  updatedAt?: admin.firestore.Timestamp;
}

export interface KnowledgeDocument {
  id: string;
  name: string;
  type: 'pdf' | 'txt' | 'docx' | 'md';
  storagePath: string;  // Firebase Storage path
  content?: string;     // Extracted text content
  chunks?: string[];    // Chunked content for RAG
  uploadedAt: admin.firestore.Timestamp;
}

export interface KnowledgeWebsite {
  id: string;
  url: string;
  title?: string;
  content?: string;     // Scraped content
  chunks?: string[];    // Chunked content for RAG
  lastScrapedAt?: admin.firestore.Timestamp;
}

export interface KnowledgeFAQ {
  id: string;
  question: string;
  answer: string;
  keywords?: string[];  // For better matching
}

// ============================================
// OAUTH STATE TYPES
// ============================================

export interface OAuthState {
  id: string;
  userId: string;
  state: string;        // Random state token for CSRF protection
  redirectUrl?: string; // Where to redirect after OAuth
  createdAt: admin.firestore.Timestamp;
  expiresAt: admin.firestore.Timestamp;
}
