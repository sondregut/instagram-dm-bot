import * as admin from 'firebase-admin';

admin.initializeApp();

export const db = admin.firestore();
export const auth = admin.auth();

// Firestore collection references
export const collections = {
  automations: db.collection('automations'),
  conversations: db.collection('conversations'),
  leads: db.collection('leads'),
  config: db.collection('config'),
  sentMessages: db.collection('sent_messages'),
};

// Types for Firestore documents
export interface Automation {
  id: string;
  type: 'comment_to_dm' | 'keyword_dm' | 'new_follower';
  trigger: {
    keywords: string[];
    postIds?: string[];
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

export interface Conversation {
  id: string;
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

export interface Lead {
  id: string;
  instagramUserId: string;
  username: string;
  email?: string;
  phone?: string;
  name?: string;
  source: 'comment_to_dm' | 'keyword_dm' | 'new_follower' | 'manual';
  automationId?: string;
  createdAt: admin.firestore.Timestamp;
}

export interface InstagramConfig {
  accessToken: string;
  pageId: string;
  instagramAccountId: string;
  tokenExpiresAt: admin.firestore.Timestamp;
  lastCheckedFollowers: string[];
}
