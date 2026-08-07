import * as admin from 'firebase-admin';
import { db, InstagramAccount } from '../firebase';
import {
  campaignTargetsPost,
  isCampaignStatusActive,
  MindsetCampaignStatus,
  normalizeMindsetCampaignKeyword,
  shouldUseRuntimeCampaign,
} from './mindsetCampaignLogic';
import {
  containsConfiguredMindsetKeyword,
  DEFAULT_MINDSET_PUBLIC_REPLY_TEXT,
  getConfiguredMindsetKeyword,
  validateMindsetTestConfiguration,
} from './mindsetFlowLogic';
import { getBotMode, isMindsetModeActive } from '../utils/runtimeMode';

export const MINDSET_CAMPAIGNS_COLLECTION = 'mindset_campaigns';

export interface MindsetCampaign {
  id: string;
  ownerUserId: string;
  accountId: string;
  name: string;
  keyword: string;
  postIds: string[];
  status: MindsetCampaignStatus;
  publicReplyEnabled: boolean;
  publicReplyText: string;
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
    status: mode === 'test' ? 'test' : 'live',
    publicReplyEnabled: true,
    publicReplyText: DEFAULT_MINDSET_PUBLIC_REPLY_TEXT,
    template: 'athlete_mindset_download',
    isSystem: true,
  };
}

export async function getStoredMindsetCampaigns(accountId: string): Promise<MindsetCampaign[]> {
  const snapshot = await db.collection(MINDSET_CAMPAIGNS_COLLECTION)
    .where('accountId', '==', accountId)
    .limit(100)
    .get();

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  } as MindsetCampaign));
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
  const storedMatch = activeStoredCampaigns.find((campaign) =>
    campaign.ownerUserId === account.userId
    && campaignTargetsPost(campaign.postIds || [], postId)
    && containsConfiguredMindsetKeyword(commentText, campaign.keyword)
  );

  if (storedMatch) return storedMatch;

  // Once the owner activates any stored campaign, it becomes the full source
  // of truth. Do not leave the environment fallback active on broader posts.
  if (activeStoredCampaigns.length > 0) return null;

  const fallback = runtimeMindsetCampaign(account);
  return fallback
    && campaignTargetsPost(fallback.postIds, postId)
    && containsConfiguredMindsetKeyword(commentText, fallback.keyword)
    ? fallback
    : null;
}
