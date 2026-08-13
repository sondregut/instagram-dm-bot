import { initializeApp, getApps } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  User,
} from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
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

const firebaseRuntime = globalThis as typeof globalThis & {
  __instagramDmFunctionsEmulatorConnected?: boolean;
};

if (
  process.env.NODE_ENV === 'development'
  && process.env.NEXT_PUBLIC_USE_FUNCTIONS_EMULATOR === 'true'
  && !firebaseRuntime.__instagramDmFunctionsEmulatorConnected
) {
  const emulatorPort = Number(process.env.NEXT_PUBLIC_FUNCTIONS_EMULATOR_PORT || '5001');
  connectFunctionsEmulator(
    functions,
    process.env.NEXT_PUBLIC_FUNCTIONS_EMULATOR_HOST || '127.0.0.1',
    Number.isFinite(emulatorPort) ? emulatorPort : 5001
  );
  firebaseRuntime.__instagramDmFunctionsEmulatorConnected = true;
}

// Auth helpers
export async function login(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function signup(email: string, password: string) {
  return createUserWithEmailAndPassword(auth, email, password);
}

export async function requestPasswordReset(email: string) {
  return sendPasswordResetEmail(auth, email);
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

export type ContactSource = 'dm' | 'comment' | 'new_follower' | 'story_reply' | 'story_mention' | 'manual';

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

  // Profile data (captured from interactions)
  profilePictureUrl?: string;
  profilePictureUpdatedAt?: { _seconds: number };

  // Contact management
  tags?: string[];
  source?: ContactSource;
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

// Contacts (Conversations as contacts)
export interface GetContactsParams {
  accountId?: string;
  source?: ContactSource;
  tags?: string[];
  hasEmail?: boolean;
  search?: string;
  limit?: number;
  startAfter?: string;
}

export interface GetContactsResult {
  contacts: Conversation[];
  lastDoc?: string;
  totalCount?: number;
}

export interface BulkTagParams {
  contactIds: string[];
  tagsToAdd?: string[];
  tagsToRemove?: string[];
}

export interface BulkDMParams {
  contactIds: string[];
  message: string;
  accountId: string;
}

export interface ExportContactsParams {
  accountId?: string;
  contactIds?: string[];
  source?: ContactSource;
  tags?: string[];
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
// INSTAGRAM POST TYPES
// ============================================

export interface InstagramPost {
  id: string;
  mediaType: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  mediaUrl?: string;
  thumbnailUrl?: string;
  caption?: string;
  timestamp: string;
  permalink?: string;
}

// ============================================
// ATHLETE MINDSET DM OPERATIONS TYPES
// ============================================

export type MindsetCampaignStatus = 'draft' | 'test' | 'live' | 'paused';
export type MindsetCampaignPostMode = 'any' | 'specific' | 'next';
export type MindsetCampaignFollowUpKey = 'noClick' | 'downloadCheck' | 'useCheck' | 'feedbackCheck';

export interface MindsetCampaignFollowUp {
  enabled: boolean;
  delayMinutes: number;
  message: string;
}

export interface MindsetCampaignJourney {
  openingMessage: string;
  openingButtonText: string;
  linkMessage: string;
  linkButtonText: string;
  destinationUrl: string;
  followUps: Record<MindsetCampaignFollowUpKey, MindsetCampaignFollowUp>;
}

export type MindsetConversationStage =
  | 'awaiting_link_request'
  | 'link_sent'
  | 'link_clicked'
  | 'awaiting_download_status'
  | 'awaiting_activation'
  | 'awaiting_use_status'
  | 'awaiting_feedback'
  | 'awaiting_offer_status'
  | 'awaiting_subscription_status'
  | 'trial_claimed'
  | 'subscription_claimed'
  | 'trial_started'
  | 'subscribed'
  | 'ai_follow_up'
  | 'human_handoff'
  | 'completed';

export interface MindsetCampaign {
  id: string;
  name: string;
  keyword: string;
  postIds: string[];
  postMode: MindsetCampaignPostMode;
  nextPostId: string | null;
  nextPostActivatedAt: string | null;
  nextPostResolvedAt: string | null;
  status: MindsetCampaignStatus;
  publicReplyEnabled: boolean;
  publicReplyText: string;
  journey: MindsetCampaignJourney;
  template: 'athlete_mindset_download';
  isSystem: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface MindsetCampaignInput {
  id?: string;
  accountId: string;
  name: string;
  keyword: string;
  postIds: string[];
  postMode: MindsetCampaignPostMode;
  status: MindsetCampaignStatus;
  publicReplyEnabled: boolean;
  publicReplyText: string;
  journey: MindsetCampaignJourney;
}

export interface MindsetConversation {
  id: string;
  instagramUserId: string;
  username: string;
  profilePictureUrl: string | null;
  campaignId: string | null;
  campaignName: string | null;
  keyword: string;
  stage: MindsetConversationStage;
  feedbackReason: string | null;
  history: Array<{
    role: 'user' | 'assistant';
    content: string;
    at: string | null;
    source?: 'automation' | 'human' | null;
  }>;
  milestones: {
    downloadClickedAt: string | null;
    activationLinkClickedAt: string | null;
    appOpenedAt: string | null;
    firstRepStartedAt: string | null;
    firstRepCompletedAt: string | null;
    paywallViewedAt: string | null;
    claimedTrialStartedAt: string | null;
    claimedSubscribedAt: string | null;
    trialStartedAt: string | null;
    subscribedAt: string | null;
  };
  pendingFollowUps: Array<{
    type: string;
    status: string;
    dueAt: string | null;
  }>;
  handoff: {
    status: string;
    reason: string | null;
  } | null;
  automation: {
    paused: boolean;
    pausedAt: string | null;
    canReply: boolean;
    messagingWindowEndsAt: string | null;
    unansweredFollowUpCount?: number;
    maxUnansweredFollowUps?: number;
    lastAutomatedFollowUpAt?: string | null;
  };
  lastUserInteractionAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  recordSource?: 'mindset_funnel' | 'previous_bot';
  previousBotState?: Conversation['conversationState'] | null;
  includesEarlierHistory?: boolean;
}

export interface MindsetOverview {
  account: {
    id: string;
    username: string;
    connectionStatus: InstagramAccount['connectionStatus'];
  };
  runtime: {
    mode: string;
    manychatKeywordProtected: boolean;
    systemKeyword: string | null;
  };
  metrics: {
    total: number;
    active: number;
    handoffs: number;
    linkClicks: number;
    appOpens: number;
    firstReps: number;
    paywallViews: number;
    claimedTrials: number;
    claimedSubscribed: number;
    trials: number;
    subscribed: number;
    last24Hours: number;
  };
  recentConversations: MindsetConversation[];
  campaigns: MindsetCampaign[];
}

export interface MindsetInboxResult {
  conversations: MindsetConversation[];
  refreshedAt: string;
  nextCursor?: string | null;
  summary?: {
    total: number;
    mindset: number;
    previousBotOnly: number;
    mindsetDataComplete: boolean;
    previousDataComplete: boolean;
    mindsetDataAvailable: boolean;
    previousBotDataAvailable: boolean;
  };
}

export interface MindsetTestTurnInput {
  accountId: string;
  stage: MindsetConversationStage;
  message: string;
  quickReplyPayload?: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface MindsetTestTurnResult {
  reply: string;
  additionalReplies?: string[];
  nextStage: MindsetConversationStage;
  quickReplies: Array<{ title: string; payload: string }>;
  buttons: Array<{ title: string; url: string }>;
  createsHandoff: boolean;
  handoffReason?: string;
}

export interface MindsetCampaignsResult {
  campaigns: MindsetCampaign[];
  runtime: {
    mode: string;
    manychatKeywordProtected: boolean;
  };
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
  // Athlete Mindset operator workspace
  getMindsetOverview: httpsCallable<{ accountId: string }, MindsetOverview>(functions, 'getMindsetOverview'),
  getMindsetInbox: httpsCallable<
    { accountId: string; limit?: number; startAfter?: string },
    MindsetInboxResult
  >(functions, 'getMindsetInbox'),
  getMindsetCampaigns: httpsCallable<{ accountId: string }, MindsetCampaignsResult>(functions, 'getMindsetCampaignsApi'),
  saveMindsetCampaign: httpsCallable<
    MindsetCampaignInput,
    { success: boolean; campaign: MindsetCampaign }
  >(functions, 'saveMindsetCampaignApi'),
  sendMindsetHumanReply: httpsCallable<
    { accountId: string; conversationId: string; message: string },
    { success: boolean }
  >(functions, 'sendMindsetHumanReplyApi'),
  setMindsetAutomation: httpsCallable<
    { accountId: string; conversationId: string; paused: boolean },
    { success: boolean; paused: boolean }
  >(functions, 'setMindsetAutomationApi'),
  simulateMindsetConversation: httpsCallable<
    MindsetTestTurnInput,
    MindsetTestTurnResult
  >(functions, 'simulateMindsetConversationApi'),

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

  // Contacts
  getContacts: httpsCallable<GetContactsParams, GetContactsResult>(functions, 'getContacts'),
  bulkTagContacts: httpsCallable<BulkTagParams, { success: boolean; updated: number }>(functions, 'bulkTagContacts'),
  bulkDMContacts: httpsCallable<BulkDMParams, { success: boolean; sent: number; failed: number }>(functions, 'bulkDMContacts'),
  exportContacts: httpsCallable<ExportContactsParams, { csv: string }>(functions, 'exportContacts'),
  getContactTags: httpsCallable<{ accountId?: string }, { tags: string[] }>(functions, 'getContactTags'),

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
  // INSTAGRAM POSTS
  // ============================================
  getUserInstagramPosts: httpsCallable<
    { accountId: string; limit?: number },
    { posts: InstagramPost[] }
  >(functions, 'getUserInstagramPosts'),

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
