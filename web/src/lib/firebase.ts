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

// Cloud Functions callable wrappers
export const cloudFunctions = {
  getDashboardStats: httpsCallable<void, DashboardStats>(functions, 'getDashboardStats'),
  getLeads: httpsCallable<GetLeadsParams, GetLeadsResult>(functions, 'getLeadsApi'),
  exportLeads: httpsCallable<ExportLeadsParams, { csv: string }>(functions, 'exportLeads'),
  deleteLead: httpsCallable<{ leadId: string }, { success: boolean }>(functions, 'deleteLeadApi'),
  getAutomations: httpsCallable<void, Automation[]>(functions, 'getAutomations'),
  saveAutomation: httpsCallable<AutomationInput, { id: string; success: boolean }>(functions, 'saveAutomation'),
  deleteAutomation: httpsCallable<{ id: string }, { success: boolean }>(functions, 'deleteAutomation'),
  getConversations: httpsCallable<GetConversationsParams, GetConversationsResult>(functions, 'getConversations'),
  getConversation: httpsCallable<{ id: string }, Conversation>(functions, 'getConversation'),
  saveInstagramConfig: httpsCallable<InstagramConfigInput, { success: boolean }>(functions, 'saveInstagramConfig'),
};

// Types
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

export interface Lead {
  id: string;
  instagramUserId: string;
  username: string;
  email?: string;
  phone?: string;
  name?: string;
  source: 'comment_to_dm' | 'keyword_dm' | 'new_follower' | 'manual';
  automationId?: string;
  createdAt: { _seconds: number };
}

export interface GetLeadsParams {
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
  source?: string;
  startDate?: string;
  endDate?: string;
}

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
  createdAt: { _seconds: number };
}

export interface AutomationInput {
  id?: string;
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
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: { _seconds: number };
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
  lastMessageAt: { _seconds: number };
  createdAt: { _seconds: number };
}

export interface GetConversationsParams {
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

export { auth, db, functions };
