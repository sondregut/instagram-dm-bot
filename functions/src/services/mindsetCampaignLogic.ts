import { validateMindsetCampaignJourney } from './mindsetCampaignJourney';
import {
  MindsetCampaignTemplate,
  normalizeMindsetCampaignTemplate,
} from './mindsetCampaignProduct';

export type MindsetCampaignStatus = 'draft' | 'test' | 'live' | 'paused';
export type MindsetCampaignPostMode = 'any' | 'specific' | 'next';

export interface MindsetCampaignMatchInput {
  keyword: string;
  postIds: string[];
  postMode?: MindsetCampaignPostMode;
  nextPostId?: string | null;
  status: MindsetCampaignStatus;
}

export interface MindsetCampaignValidationInput extends MindsetCampaignMatchInput {
  name: string;
  template?: MindsetCampaignTemplate;
  publicReplyEnabled?: boolean;
  publicReplyText?: string;
  journey?: unknown;
}

export function normalizeMindsetCampaignKeyword(keyword: string): string {
  return keyword.trim().toUpperCase();
}

export function normalizeMindsetCampaignPostMode(
  campaign: Pick<MindsetCampaignMatchInput, 'postIds' | 'postMode'>
): MindsetCampaignPostMode {
  if (campaign.postMode === 'any' || campaign.postMode === 'specific' || campaign.postMode === 'next') {
    return campaign.postMode;
  }
  return campaign.postIds.length > 0 ? 'specific' : 'any';
}

export function validateMindsetCampaignInput(
  input: MindsetCampaignValidationInput,
  mode: string
): string[] {
  const errors: string[] = [];
  const name = input.name.trim();
  const keyword = normalizeMindsetCampaignKeyword(input.keyword);
  const postMode = normalizeMindsetCampaignPostMode(input);

  if (name.length < 2 || name.length > 80) {
    errors.push('Campaign name must be between 2 and 80 characters');
  }

  if (!/^[A-Z0-9_-]{2,40}$/.test(keyword)) {
    errors.push('Keyword must be 2-40 characters using letters, numbers, hyphens, or underscores');
  }

  if (input.postIds.length > 25) {
    errors.push('A campaign can target at most 25 posts');
  }

  if (postMode === 'specific' && input.postIds.length === 0) {
    errors.push('Specific post campaigns require at least one post');
  }

  if (postMode !== 'specific' && input.postIds.length > 0) {
    errors.push('Only specific post campaigns can include selected posts');
  }

  if (input.publicReplyEnabled === true) {
    const publicReplies = Array.from(new Set((input.publicReplyText || '')
      .split(/\r?\n/)
      .map((reply) => reply.trim())
      .filter(Boolean)));
    if (publicReplies.length < 1 || publicReplies.length > 5) {
      errors.push('Public comment reply list must include between 1 and 5 entries');
    }
    if (publicReplies.some((reply) => reply.length < 2 || reply.length > 180)) {
      errors.push('Each public comment reply must be between 2 and 180 characters');
    }
  }

  if (input.journey !== undefined) {
    errors.push(...validateMindsetCampaignJourney(
      input.journey,
      normalizeMindsetCampaignTemplate(input.template)
    ));
  }

  if (input.status === 'test' && keyword === 'MINDSET') {
    errors.push('MINDSET is reserved for ManyChat while the custom bot is in test mode');
  }

  if (input.status === 'test' && mode !== 'test' && mode !== 'full') {
    errors.push('Test campaigns require test or full bot mode');
  }

  if (input.status === 'live' && mode !== 'mindset' && mode !== 'full') {
    errors.push('Live campaigns require an explicit production bot mode');
  }

  return errors;
}

export function isCampaignStatusActive(status: MindsetCampaignStatus, mode: string): boolean {
  if (mode === 'test') return status === 'test';
  if (mode === 'mindset') return status === 'live';
  if (mode === 'full') return status === 'test' || status === 'live';
  return false;
}

export function shouldUseRuntimeCampaign(
  campaigns: Array<Pick<MindsetCampaignMatchInput, 'status' | 'keyword'>>,
  mode: string,
  runtimeKeyword: string
): boolean {
  const normalizedRuntimeKeyword = normalizeMindsetCampaignKeyword(runtimeKeyword);
  return !campaigns.some((campaign) => (
    isCampaignStatusActive(campaign.status, mode)
    && normalizeMindsetCampaignKeyword(campaign.keyword) === normalizedRuntimeKeyword
  ));
}

export function campaignTargetsPost(
  campaign: Pick<MindsetCampaignMatchInput, 'postIds' | 'postMode' | 'nextPostId'>,
  postId: string
): boolean {
  const postMode = normalizeMindsetCampaignPostMode(campaign);
  if (postMode === 'any') return true;
  if (postMode === 'specific') return campaign.postIds.includes(postId);
  return Boolean(campaign.nextPostId) && campaign.nextPostId === postId;
}

export function campaignsOverlap(
  first: Pick<MindsetCampaignMatchInput, 'keyword' | 'postIds' | 'postMode' | 'nextPostId'>,
  second: Pick<MindsetCampaignMatchInput, 'keyword' | 'postIds' | 'postMode' | 'nextPostId'>
): boolean {
  if (normalizeMindsetCampaignKeyword(first.keyword) !== normalizeMindsetCampaignKeyword(second.keyword)) {
    return false;
  }

  const firstMode = normalizeMindsetCampaignPostMode(first);
  const secondMode = normalizeMindsetCampaignPostMode(second);
  if (firstMode === 'any' || secondMode === 'any') return true;

  const firstPosts = firstMode === 'next'
    ? first.nextPostId ? [first.nextPostId] : []
    : first.postIds;
  const secondPosts = secondMode === 'next'
    ? second.nextPostId ? [second.nextPostId] : []
    : second.postIds;

  // Two unresolved Next post campaigns would both claim the same upcoming
  // post. A resolved Next campaign behaves like a one-post selection.
  if (firstMode === 'next' && secondMode === 'next'
      && firstPosts.length === 0 && secondPosts.length === 0) return true;
  if (firstPosts.length === 0 || secondPosts.length === 0) return false;

  const secondPostSet = new Set(secondPosts);
  return firstPosts.some((postId) => secondPostSet.has(postId));
}

export function isWaitingForNextPost(
  campaign: Pick<MindsetCampaignMatchInput, 'postIds' | 'postMode' | 'nextPostId'>
): boolean {
  return normalizeMindsetCampaignPostMode(campaign) === 'next' && !campaign.nextPostId;
}

export interface InstagramPostCandidate {
  id: string;
  timestamp: string;
}

/**
 * Finds the first post published after a Next post campaign was activated.
 * Existing post IDs are retained as an additional guard against timestamps
 * rounded to the same second by the Instagram API.
 */
export function selectNextCampaignPostId(
  posts: InstagramPostCandidate[],
  baselinePostIds: string[],
  activatedAtMs: number
): string | null {
  if (!Number.isFinite(activatedAtMs) || activatedAtMs <= 0) return null;

  const baseline = new Set(baselinePostIds);
  const activationSecond = Math.floor(activatedAtMs / 1000) * 1000;
  const candidates = posts
    .flatMap((post, index) => {
      if (!post.id || baseline.has(post.id)) return [];
      const publishedAtMs = Date.parse(post.timestamp);
      if (!Number.isFinite(publishedAtMs) || publishedAtMs < activationSecond) return [];
      return [{ id: post.id, publishedAtMs, index }];
    })
    .sort((first, second) => (
      first.publishedAtMs - second.publishedAtMs || second.index - first.index
    ));

  return candidates[0]?.id || null;
}
