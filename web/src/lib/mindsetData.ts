import {
  cloudFunctions,
  Conversation,
  InstagramPost,
  MindsetCampaign,
  MindsetCampaignInput,
  MindsetCampaignsResult,
  MindsetInboxResult,
  MindsetOverview,
  MindsetTestTurnInput,
  MindsetTestTurnResult,
} from './firebase';
import {
  getReviewCampaigns,
  getReviewInbox,
  getReviewOverview,
  getReviewPosts,
  isDashboardReviewMode,
  sendReviewMindsetHumanReply,
  saveReviewCampaign,
  setReviewMindsetAutomation,
} from './mindsetReview';
import { simulateReviewMindsetTurn } from './mindsetTestLab';
import { combineMindsetInbox } from './mindsetInbox';

const PREVIOUS_CONVERSATION_PAGE_SIZE = 200;
const MAX_PREVIOUS_CONVERSATION_PAGES = 50;
const MINDSET_CONVERSATION_PAGE_SIZE = 200;
const MAX_MINDSET_CONVERSATION_PAGES = 50;

async function loadAllMindsetConversations(accountId: string) {
  const conversations: MindsetInboxResult['conversations'] = [];
  const seenCursors = new Set<string>();
  let startAfter: string | undefined;
  let refreshedAt = new Date().toISOString();
  let complete = false;

  for (let page = 0; page < MAX_MINDSET_CONVERSATION_PAGES; page += 1) {
    const result = await cloudFunctions.getMindsetInbox({
      accountId,
      limit: MINDSET_CONVERSATION_PAGE_SIZE,
      startAfter,
    });
    conversations.push(...result.data.conversations);
    refreshedAt = result.data.refreshedAt;
    const nextCursor = result.data.nextCursor;
    if (!nextCursor) {
      complete = true;
      break;
    }
    if (seenCursors.has(nextCursor)) break;
    seenCursors.add(nextCursor);
    startAfter = nextCursor;
  }

  return { conversations, refreshedAt, complete };
}

async function loadPreviousBotConversations(accountId: string) {
  const conversations: Conversation[] = [];
  const seenCursors = new Set<string>();
  let startAfter: string | undefined;
  let complete = false;

  for (let page = 0; page < MAX_PREVIOUS_CONVERSATION_PAGES; page += 1) {
    const result = await cloudFunctions.getConversations({
      accountId,
      limit: PREVIOUS_CONVERSATION_PAGE_SIZE,
      startAfter,
    });
    conversations.push(...result.data.conversations);
    const nextCursor = result.data.lastDoc;
    if (!nextCursor || result.data.conversations.length === 0) {
      complete = true;
      break;
    }
    if (seenCursors.has(nextCursor)) break;
    seenCursors.add(nextCursor);
    startAfter = nextCursor;
  }

  return { conversations, complete };
}

export async function loadMindsetOverview(accountId: string): Promise<MindsetOverview> {
  if (isDashboardReviewMode()) return getReviewOverview();
  const result = await cloudFunctions.getMindsetOverview({ accountId });
  return result.data;
}

export async function loadMindsetInbox(accountId: string): Promise<MindsetInboxResult> {
  if (isDashboardReviewMode()) return getReviewInbox();
  const [mindsetResult, previousResult] = await Promise.allSettled([
    loadAllMindsetConversations(accountId),
    loadPreviousBotConversations(accountId),
  ]);
  if (mindsetResult.status === 'rejected' && previousResult.status === 'rejected') {
    throw mindsetResult.reason;
  }

  const mindsetInbox = mindsetResult.status === 'fulfilled'
    ? {
      conversations: mindsetResult.value.conversations,
      refreshedAt: mindsetResult.value.refreshedAt,
    }
    : { conversations: [], refreshedAt: new Date().toISOString() };
  const previousInbox = previousResult.status === 'fulfilled'
    ? previousResult.value
    : { conversations: [], complete: false };

  return combineMindsetInbox(
    mindsetInbox,
    previousInbox.conversations,
    previousInbox.complete,
    {
      mindset: mindsetResult.status === 'fulfilled',
      previousBot: previousResult.status === 'fulfilled',
      mindsetComplete: mindsetResult.status === 'fulfilled' && mindsetResult.value.complete,
    }
  );
}

export async function sendMindsetHumanReply(
  accountId: string,
  conversationId: string,
  message: string
): Promise<void> {
  if (isDashboardReviewMode()) {
    await sendReviewMindsetHumanReply(conversationId, message);
    return;
  }
  await cloudFunctions.sendMindsetHumanReply({ accountId, conversationId, message });
}

export async function setMindsetAutomation(
  accountId: string,
  conversationId: string,
  paused: boolean
): Promise<void> {
  if (isDashboardReviewMode()) {
    await setReviewMindsetAutomation(conversationId, paused);
    return;
  }
  await cloudFunctions.setMindsetAutomation({ accountId, conversationId, paused });
}

export async function simulateMindsetConversation(
  input: MindsetTestTurnInput
): Promise<MindsetTestTurnResult> {
  if (isDashboardReviewMode()) return simulateReviewMindsetTurn(input);
  const result = await cloudFunctions.simulateMindsetConversation(input);
  return result.data;
}

export async function loadMindsetCampaigns(accountId: string): Promise<MindsetCampaignsResult> {
  if (isDashboardReviewMode()) return getReviewCampaigns();
  const result = await cloudFunctions.getMindsetCampaigns({ accountId });
  return result.data;
}

export async function saveMindsetCampaign(input: MindsetCampaignInput): Promise<MindsetCampaign> {
  if (isDashboardReviewMode()) return saveReviewCampaign(input);
  const result = await cloudFunctions.saveMindsetCampaign(input);
  return result.data.campaign;
}

export async function loadInstagramPosts(accountId: string): Promise<InstagramPost[]> {
  if (isDashboardReviewMode()) return getReviewPosts();
  const result = await cloudFunctions.getUserInstagramPosts({ accountId, limit: 25 });
  return result.data.posts;
}
