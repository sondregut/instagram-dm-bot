import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const functions = getFunctions(app);
const db = getFirestore(app);

// Auth helpers
export async function login(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function signup(email: string, password: string) {
  return createUserWithEmailAndPassword(auth, email, password);
}

export async function logout() {
  return signOut(auth);
}

export function onAuthChange(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

// ============================================
// TYPES
// ============================================

export interface DashboardStats {
  leads: {
    total: number;
    withEmail: number;
    withPhone: number;
    bySource: Record<string, number>;
    last24Hours: number;
    last7Days: number;
  };
  followers: {
    totalWelcomed: number;
    last24Hours: number;
    last7Days: number;
  };
  conversations: {
    total: number;
    active: number;
  };
  rateLimit: {
    used: number;
    limit: number;
    remaining: number;
    windowMinutes: number;
  };
}

export type LeadSource = 'comment_to_dm' | 'keyword_dm' | 'new_follower' | 'story_reply' | 'story_mention' | 'flow' | 'manual';

export interface Lead {
  id: string;
  userId: string;
  accountId: string;
  instagramUserId: string;
  username: string;
  email?: string;
  phone?: string;
  name?: string;
  source: LeadSource;
  automationId?: string;
  flowId?: string;
  tags?: string[];
  notes?: string;
  createdAt: { _seconds: number };
}

export interface GetLeadsParams {
  accountId?: string;
  source?: string;
  hasEmail?: boolean;
  hasPhone?: boolean;
  limit?: number;
  startAfter?: string;
}

export interface GetLeadsResult {
  leads: Lead[];
  lastDoc?: string;
}

export interface ExportLeadsParams {
  accountId?: string;
  source?: string;
  startDate?: string;
  endDate?: string;
}

export type AutomationType = 'comment_to_dm' | 'keyword_dm' | 'new_follower' | 'story_reply' | 'story_mention';

export interface Automation {
  id: string;
  userId: string;
  accountId: string;
  type: AutomationType;
  trigger: {
    keywords: string[];
    postIds?: string[];
    storyIds?: string[];
  };
  response: {
    type: 'static' | 'ai';
    staticMessage?: string;
    aiPrompt?: string;
  };
  collectEmail: boolean;
  isActive: boolean;
  createdAt: { _seconds: number };
}

export interface AutomationInput {
  id?: string;
  accountId: string;
  type: AutomationType;
  trigger: {
    keywords: string[];
    postIds?: string[];
    storyIds?: string[];
  };
  response: {
    type: 'static' | 'ai';
    staticMessage?: string;
    aiPrompt?: string;
  };
  collectEmail: boolean;
  isActive: boolean;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: { _seconds: number };
}

export interface Conversation {
  id: string;
  userId: string;
  accountId: string;
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
  lastMessageAt: { _seconds: number };
  createdAt: { _seconds: number };
}

export interface GetConversationsParams {
  accountId?: string;
  state?: string;
  limit?: number;
  startAfter?: string;
}

export interface GetConversationsResult {
  conversations: Conversation[];
  lastDoc?: string;
}

export interface InstagramConfigInput {
  accessToken: string;
  pageId: string;
  instagramAccountId: string;
}

// ============================================
// INSTAGRAM ACCOUNT TYPES
// ============================================

export interface AIPersonality {
  name: string;
  description: string;
  systemPrompt: string;
  tone: 'friendly' | 'professional' | 'casual' | 'enthusiastic';
  goals: string[];
  customInstructions?: string;
  exampleConversations?: { userMessage: string; assistantResponse: string }[];
  forbiddenTopics?: string[];
  handoffKeywords?: string[];
}

export interface AccountSettings {
  maxResponseLength: number;
  collectEmail: boolean;
  collectPhone: boolean;
  autoWelcomeNewFollowers: boolean;
  welcomeMessage?: string;
  businessHoursOnly: boolean;
  businessHours?: {
    timezone: string;
    start: string;
    end: string;
    days: number[];
  };
  outOfHoursMessage?: string;
  emailPrompt?: string;
  phonePrompt?: string;
  thankYouMessage?: string;
  notifyOnNewLead: boolean;
  notifyOnHandoff: boolean;
  notificationEmail?: string;
}

export interface InstagramAccount {
  id: string;
  username: string;
  instagramAccountId: string;
  pageName?: string;
  aiPersonality: AIPersonality;
  settings: AccountSettings;
  connectionStatus: 'connected' | 'expired' | 'error';
  tokenExpiresAt?: string;
  createdAt?: string;
}

// ============================================
// KNOWLEDGE BASE TYPES
// ============================================

export interface KnowledgeFAQ {
  id: string;
  question: string;
  answer: string;
  keywords?: string[];
}

export interface KnowledgeWebsite {
  id: string;
  url: string;
  title?: string;
}

export interface KnowledgeBase {
  id: string;
  name: string;
  description?: string;
  faqs: KnowledgeFAQ[];
  websites: KnowledgeWebsite[];
  status: 'processing' | 'ready' | 'error';
}

// ============================================
// USER TYPES
// ============================================

export interface UserProfile {
  id: string;
  email: string;
  displayName?: string;
  subscription: 'free' | 'starter' | 'pro' | 'enterprise';
}

// ============================================
// CLOUD FUNCTIONS CALLABLE WRAPPERS
// ============================================

export const cloudFunctions = {
  // Dashboard & Stats
  getDashboardStats: httpsCallable<{ accountId?: string }, DashboardStats>(functions, 'getDashboardStats'),

  // Leads
  getLeads: httpsCallable<GetLeadsParams, GetLeadsResult>(functions, 'getLeadsApi'),
  exportLeads: httpsCallable<ExportLeadsParams, { csv: string }>(functions, 'exportLeads'),
  deleteLead: httpsCallable<{ leadId: string }, { success: boolean }>(functions, 'deleteLeadApi'),

  // Automations
  getAutomations: httpsCallable<{ accountId?: string }, Automation[]>(functions, 'getAutomations'),
  saveAutomation: httpsCallable<AutomationInput, { id: string; success: boolean }>(functions, 'saveAutomation'),
  deleteAutomation: httpsCallable<{ id: string }, { success: boolean }>(functions, 'deleteAutomation'),

  // Conversations
  getConversations: httpsCallable<GetConversationsParams, GetConversationsResult>(functions, 'getConversations'),
  getConversation: httpsCallable<{ id: string }, Conversation>(functions, 'getConversation'),

  // Legacy Instagram Config (deprecated)
  saveInstagramConfig: httpsCallable<InstagramConfigInput, { success: boolean }>(functions, 'saveInstagramConfig'),

  // ============================================
  // OAUTH & ACCOUNTS
  // ============================================
  getInstagramOAuthUrl: httpsCallable<{ redirectUrl?: string }, { url: string; state: string }>(functions, 'getInstagramOAuthUrl'),
  getUserAccounts: httpsCallable<void, InstagramAccount[]>(functions, 'getUserAccounts'),
  disconnectInstagramAccount: httpsCallable<{ accountId: string }, { success: boolean }>(functions, 'disconnectInstagramAccount'),
  updateAccountSettings: httpsCallable<{
    accountId: string;
    aiPersonality?: Partial<AIPersonality>;
    settings?: Partial<AccountSettings>;
  }, { success: boolean }>(functions, 'updateAccountSettings'),

  // ============================================
  // KNOWLEDGE BASE
  // ============================================
  getKnowledgeBase: httpsCallable<{ accountId: string }, KnowledgeBase>(functions, 'getKnowledgeBaseApi'),
  addFAQ: httpsCallable<{
    knowledgeBaseId: string;
    question: string;
    answer: string;
    keywords?: string[];
  }, { success: boolean; faq: KnowledgeFAQ }>(functions, 'addFAQ'),
  removeFAQ: httpsCallable<{ knowledgeBaseId: string; faqId: string }, { success: boolean }>(functions, 'removeFAQ'),
  updateFAQs: httpsCallable<{
    knowledgeBaseId: string;
    faqs: KnowledgeFAQ[];
  }, { success: boolean; faqs: KnowledgeFAQ[] }>(functions, 'updateFAQs'),
  addWebsite: httpsCallable<{
    knowledgeBaseId: string;
    url: string;
    title?: string;
  }, { success: boolean; website: KnowledgeWebsite }>(functions, 'addWebsite'),
  removeWebsite: httpsCallable<{ knowledgeBaseId: string; websiteId: string }, { success: boolean }>(functions, 'removeWebsite'),
  deleteKnowledgeBase: httpsCallable<{ knowledgeBaseId: string }, { success: boolean }>(functions, 'deleteKnowledgeBase'),
  generateAIPersonalityFromWebsite: httpsCallable<
    { url: string },
    {
      name: string;
      description: string;
      systemPrompt: string;
      goals: string[];
      customInstructions: string;
      tone: 'friendly' | 'professional' | 'casual' | 'enthusiastic';
    }
  >(functions, 'generateAIPersonalityFromWebsite'),

  // ============================================
  // USER PROFILE
  // ============================================
  getUserProfile: httpsCallable<void, UserProfile>(functions, 'getUserProfile'),
  saveUserProfile: httpsCallable<{ displayName?: string }, { success: boolean }>(functions, 'saveUserProfile'),

  // ============================================
  // FLOWS
  // ============================================
  getFlows: httpsCallable<{ accountId?: string }, import('./flowTypes').Flow[]>(functions, 'getFlows'),
  getFlow: httpsCallable<{ id: string }, import('./flowTypes').Flow>(functions, 'getFlow'),
  createFlow: httpsCallable<import('./flowTypes').FlowInput, { id: string; success: boolean }>(functions, 'createFlow'),
  updateFlow: httpsCallable<
    { id: string } & Partial<import('./flowTypes').FlowInput>,
    { id: string; success: boolean }
  >(functions, 'updateFlow'),
  deleteFlow: httpsCallable<{ id: string }, { success: boolean }>(functions, 'deleteFlow'),
  toggleFlowActive: httpsCallable<{ id: string; isActive: boolean }, { success: boolean; isActive: boolean }>(functions, 'toggleFlowActive'),
  getFlowStats: httpsCallable<
    { flowId?: string; accountId?: string },
    import('./flowTypes').FlowStats
  >(functions, 'getFlowStats'),
};

export { auth, db, functions };
