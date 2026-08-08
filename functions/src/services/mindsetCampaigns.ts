import * as admin from 'firebase-admin';
import { db, InstagramAccount } from '../firebase';
import {
  campaignTargetsPost,
  isCampaignStatusActive,
  isWaitingForNextPost,
  MindsetCampaignPostMode,
  MindsetCampaignStatus,
  normalizeMindsetCampaignKeyword,
  normalizeMindsetCampaignPostMode,
  selectNextCampaignPostId,
  shouldUseRuntimeCampaign,
} from './mindsetCampaignLogic';
import {
  containsConfiguredMindsetKeyword,
  DEFAULT_MINDSET_PUBLIC_REPLY_TEXT,
  getConfiguredMindsetKeyword,
  validateMindsetTestConfiguration,
} from './mindsetFlowLogic';
import { getBotMode, isMindsetModeActive } from '../utils/runtimeMode';
import { getUserPosts, InstagramPost } from './instagram';
import {
  DEFAULT_MINDSET_CAMPAIGN_JOURNEY,
  MindsetCampaignJourney,
  normalizeMindsetCampaignJourney,
} from './mindsetCampaignJourney';

export const MINDSET_CAMPAIGNS_COLLECTION = 'mindset_campaigns';
export const MINDSET_NEXT_POST_LOCKS_COLLECTION = 'mindset_campaign_next_post_locks';
const NEXT_POST_LOOKBACK_LIMIT = 100;

export interface MindsetCampaign {
  id: string;
  ownerUserId: string;
  accountId: string;
  name: string;
  keyword: string;
  postIds: string[];
  postMode: MindsetCampaignPostMode;
  nextPostId?: string | null;
  nextPostBaselineIds?: string[];
  nextPostActivatedAt?: admin.firestore.Timestamp;
  nextPostResolvedAt?: admin.firestore.Timestamp;
  status: MindsetCampaignStatus;
  publicReplyEnabled: boolean;
  publicReplyText: string;
  journey: MindsetCampaignJourney;
  template: 'athlete_mindset_download';
  isSystem?: boolean;
  createdAt?: admin.firestore.Timestamp;
  updatedAt?: admin.firestore.Timestamp;
}

function targetAccountUsername(): string {
  return (process.env.MINDSET_TARGET_ACCOUNT_USERNAME || '').trim().toLowerCase();
}

export function isMindsetTargetAccount(account: InstagramAccount): boolean {
  const target = targetAccountUsername();
  return !!target && account.username.trim().toLowerCase() === target;
}

export function isMindsetAccountAllowed(account: InstagramAccount): boolean {
  return isMindsetModeActive() && isMindsetTargetAccount(account);
}

export function runtimeMindsetCampaign(account: InstagramAccount): MindsetCampaign | null {
  if (!isMindsetAccountAllowed(account)) return null;

  const mode = getBotMode();
  const keyword = normalizeMindsetCampaignKeyword(getConfiguredMindsetKeyword());
  const safety = validateMindsetTestConfiguration(account.username, keyword, mode);
  if (!safety.allowed) {
    console.warn(`[Mindset] Runtime campaign blocked: ${safety.reason}`);
    return null;
  }

  return {
    id: 'runtime-default',
    ownerUserId: account.userId,
    accountId: account.id,
    name: mode === 'test' ? 'Controlled Instagram test' : 'Athlete Mindset download funnel',
    keyword,
    postIds: [],
    postMode: 'any',
    status: mode === 'test' ? 'test' : 'live',
    publicReplyEnabled: true,
    publicReplyText: DEFAULT_MINDSET_PUBLIC_REPLY_TEXT,
    journey: DEFAULT_MINDSET_CAMPAIGN_JOURNEY,
    template: 'athlete_mindset_download',
    isSystem: true,
  };
}

export async function getStoredMindsetCampaigns(accountId: string): Promise<MindsetCampaign[]> {
  const snapshot = await db.collection(MINDSET_CAMPAIGNS_COLLECTION)
    .where('accountId', '==', accountId)
    .limit(100)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data() as Omit<MindsetCampaign, 'id' | 'postIds' | 'postMode'> & {
      postIds?: unknown;
      postMode?: MindsetCampaignPostMode;
    };
    const postIds = Array.isArray(data.postIds)
      ? data.postIds.filter((value): value is string => typeof value === 'string')
      : [];
    return {
      ...data,
      id: doc.id,
      postIds,
      postMode: normalizeMindsetCampaignPostMode({ postIds, postMode: data.postMode }),
      journey: normalizeMindsetCampaignJourney(data.journey),
      nextPostBaselineIds: Array.isArray(data.nextPostBaselineIds)
        ? data.nextPostBaselineIds.filter((value): value is string => typeof value === 'string')
        : undefined,
    } as MindsetCampaign;
  });
}

export function getActiveStoredMindsetCampaigns(
  campaigns: MindsetCampaign[],
  mode: string
): MindsetCampaign[] {
  return campaigns.filter((campaign) => isCampaignStatusActive(campaign.status, mode));
}

export function shouldIncludeRuntimeMindsetCampaign(
  campaigns: MindsetCampaign[],
  mode: string
): boolean {
  return shouldUseRuntimeCampaign(campaigns, mode);
}

async function lockNextPostCampaign(
  account: InstagramAccount,
  campaign: MindsetCampaign,
  posts: InstagramPost[],
  mode: string
): Promise<MindsetCampaign | null> {
  if (!isWaitingForNextPost(campaign)) return campaign;
  if (!campaign.nextPostActivatedAt || !Array.isArray(campaign.nextPostBaselineIds)) return null;

  const candidatePostId = selectNextCampaignPostId(
    posts,
    campaign.nextPostBaselineIds,
    campaign.nextPostActivatedAt.toMillis()
  );
  if (!candidatePostId) return null;

  const campaignRef = db.collection(MINDSET_CAMPAIGNS_COLLECTION).doc(campaign.id);
  const nextPostLockRef = db.collection(MINDSET_NEXT_POST_LOCKS_COLLECTION).doc(account.id);
  return db.runTransaction(async (transaction) => {
    const [snapshot, lockSnapshot] = await Promise.all([
      transaction.get(campaignRef),
      transaction.get(nextPostLockRef),
    ]);
    if (!snapshot.exists) return null;

    const data = snapshot.data() as MindsetCampaign;
    const latest: MindsetCampaign = {
      ...data,
      id: snapshot.id,
      postIds: Array.isArray(data.postIds) ? data.postIds : [],
      postMode: normalizeMindsetCampaignPostMode({
        postIds: Array.isArray(data.postIds) ? data.postIds : [],
        postMode: data.postMode,
      }),
      nextPostBaselineIds: Array.isArray(data.nextPostBaselineIds)
        ? data.nextPostBaselineIds
        : undefined,
    };
    if (latest.ownerUserId !== account.userId
        || latest.accountId !== account.id
        || !isCampaignStatusActive(latest.status, mode)
        || latest.postMode !== 'next') return null;

    if (latest.nextPostId) return latest;
    if (!latest.nextPostActivatedAt || !Array.isArray(latest.nextPostBaselineIds)) return null;

    const latestCandidatePostId = selectNextCampaignPostId(
      posts,
      latest.nextPostBaselineIds,
      latest.nextPostActivatedAt.toMillis()
    );
    if (!latestCandidatePostId) return null;

    const now = admin.firestore.Timestamp.now();
    transaction.set(campaignRef, {
      nextPostId: latestCandidatePostId,
      nextPostResolvedAt: now,
      updatedAt: now,
    }, { merge: true });
    if (lockSnapshot.data()?.campaignId === campaign.id) {
      transaction.delete(nextPostLockRef);
    }
    return {
      ...latest,
      nextPostId: latestCandidatePostId,
      nextPostResolvedAt: now,
      updatedAt: now,
    };
  });
}

export async function reconcileNextPostCampaigns(
  account: InstagramAccount,
  campaigns: MindsetCampaign[],
  mode: string
): Promise<MindsetCampaign[]> {
  const waitingCampaign = campaigns.find((campaign) => (
    campaign.ownerUserId === account.userId
    && campaign.accountId === account.id
    && isCampaignStatusActive(campaign.status, mode)
    && isWaitingForNextPost(campaign)
  ));
  if (!waitingCampaign) return campaigns;

  const posts = await getUserPosts(account, NEXT_POST_LOOKBACK_LIMIT);
  const lockedCampaign = await lockNextPostCampaign(account, waitingCampaign, posts, mode);
  if (!lockedCampaign?.nextPostId) return campaigns;
  return campaigns.map((campaign) => (
    campaign.id === lockedCampaign.id ? lockedCampaign : campaign
  ));
}

async function resolveNextPostCampaign(
  account: InstagramAccount,
  campaign: MindsetCampaign,
  commentText: string,
  postId: string,
  mode: string
): Promise<MindsetCampaign | null> {
  if (!isWaitingForNextPost(campaign)) {
    return campaignTargetsPost(campaign, postId) ? campaign : null;
  }

  const posts = await getUserPosts(account, NEXT_POST_LOOKBACK_LIMIT);
  const lockedCampaign = await lockNextPostCampaign(account, campaign, posts, mode);
  return lockedCampaign
    && lockedCampaign.nextPostId === postId
    && containsConfiguredMindsetKeyword(commentText, lockedCampaign.keyword)
    ? lockedCampaign
    : null;
}

export async function resolveMindsetCampaignForComment(
  account: InstagramAccount,
  commentText: string,
  postId: string
): Promise<MindsetCampaign | null> {
  if (!isMindsetAccountAllowed(account)) return null;

  const mode = getBotMode();
  const storedCampaigns = await getStoredMindsetCampaigns(account.id);
  const activeStoredCampaigns = getActiveStoredMindsetCampaigns(storedCampaigns, mode)
    .filter((campaign) => campaign.ownerUserId === account.userId);
  for (const campaign of activeStoredCampaigns) {
    if (!containsConfiguredMindsetKeyword(commentText, campaign.keyword)) continue;
    if (campaign.postMode === 'next') {
      const nextPostMatch = await resolveNextPostCampaign(
        account,
        campaign,
        commentText,
        postId,
        mode
      );
      if (nextPostMatch) return nextPostMatch;
      continue;
    }
    if (campaignTargetsPost(campaign, postId)) return campaign;
  }

  // Once the owner activates any stored campaign, it becomes the full source
  // of truth. Do not leave the environment fallback active on broader posts.
  if (activeStoredCampaigns.length > 0) return null;

  const fallback = runtimeMindsetCampaign(account);
  return fallback
    && campaignTargetsPost(fallback, postId)
    && containsConfiguredMindsetKeyword(commentText, fallback.keyword)
    ? fallback
    : null;
}
