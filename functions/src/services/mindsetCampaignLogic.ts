export type MindsetCampaignStatus = 'draft' | 'test' | 'live' | 'paused';

export interface MindsetCampaignMatchInput {
  keyword: string;
  postIds: string[];
  status: MindsetCampaignStatus;
}

export interface MindsetCampaignValidationInput extends MindsetCampaignMatchInput {
  name: string;
  publicReplyEnabled?: boolean;
  publicReplyText?: string;
}

export function normalizeMindsetCampaignKeyword(keyword: string): string {
  return keyword.trim().toUpperCase();
}

export function validateMindsetCampaignInput(
  input: MindsetCampaignValidationInput,
  mode: string
): string[] {
  const errors: string[] = [];
  const name = input.name.trim();
  const keyword = normalizeMindsetCampaignKeyword(input.keyword);

  if (name.length < 2 || name.length > 80) {
    errors.push('Campaign name must be between 2 and 80 characters');
  }

  if (!/^[A-Z0-9_-]{2,40}$/.test(keyword)) {
    errors.push('Keyword must be 2-40 characters using letters, numbers, hyphens, or underscores');
  }

  if (input.postIds.length > 25) {
    errors.push('A campaign can target at most 25 posts');
  }

  if (input.publicReplyEnabled === true) {
    const publicReplyText = input.publicReplyText?.trim() || '';
    if (publicReplyText.length < 2 || publicReplyText.length > 180) {
      errors.push('Public comment reply must be between 2 and 180 characters');
    }
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
  campaigns: Array<Pick<MindsetCampaignMatchInput, 'status'>>,
  mode: string
): boolean {
  return !campaigns.some((campaign) => isCampaignStatusActive(campaign.status, mode));
}

export function campaignTargetsPost(postIds: string[], postId: string): boolean {
  return postIds.length === 0 || postIds.includes(postId);
}

export function campaignsOverlap(
  first: Pick<MindsetCampaignMatchInput, 'keyword' | 'postIds'>,
  second: Pick<MindsetCampaignMatchInput, 'keyword' | 'postIds'>
): boolean {
  if (normalizeMindsetCampaignKeyword(first.keyword) !== normalizeMindsetCampaignKeyword(second.keyword)) {
    return false;
  }

  if (first.postIds.length === 0 || second.postIds.length === 0) return true;
  const secondPosts = new Set(second.postIds);
  return first.postIds.some((postId) => secondPosts.has(postId));
}
