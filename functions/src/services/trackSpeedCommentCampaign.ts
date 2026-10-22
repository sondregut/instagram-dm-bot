import type { InstagramAccount } from '../firebase';
import type { MindsetCampaign } from './mindsetCampaigns';
import { normalizeMindsetCampaignJourney } from './mindsetCampaignJourney';
import { VERIFIED_APP_LINKS } from './linkRecoveryLogic';
import { isTrackSpeedOnlyEnabled } from './trackSpeedOnlyPolicy';
import { matchesCommentKeyword } from '../utils/commentKeywordMatching';
import { getBotMode, isMindsetModeActive } from '../utils/runtimeMode';

export const TRACKSPEED_COMMENT_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const isTrackSpeedEventId = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(value);

/** A virtual comment campaign, never a direct-message entry point. */
export function trackSpeedCommentCampaign(account: InstagramAccount): MindsetCampaign | null {
  if (!isTrackSpeedOnlyEnabled(account) || !isMindsetModeActive()
    || !['mindset', 'full'].includes(getBotMode())) return null;
  const journey = normalizeMindsetCampaignJourney({
    destinationUrl: VERIFIED_APP_LINKS.trackspeed_download.url,
    linkMessage: 'Here you go!',
  }, 'trackspeed_download');
  for (const followUp of Object.values(journey.followUps)) followUp.enabled = false;
  return { id: `trackspeed-comment-${account.id}-speed`, ownerUserId: account.userId,
    accountId: account.id, name: 'TrackSpeed SPEED comments', keyword: 'SPEED',
    template: 'trackspeed_download', status: 'live', postIds: [], postMode: 'any',
    publicReplyEnabled: false, publicReplyText: '', journey, isSystem: true };
}

export function resolveTrackSpeedCommentCampaign(account: InstagramAccount, event: {
  id?: unknown; text?: unknown; media?: { id?: unknown }; from?: { id?: unknown; username?: unknown };
} | null | undefined): MindsetCampaign | null {
  if (!event || !isTrackSpeedEventId(event.id) || !isTrackSpeedEventId(event.media?.id)
    || !isTrackSpeedEventId(event.from?.id) || typeof event.from?.username !== 'string'
    || event.from.id === account.instagramAccountId || typeof event.text !== 'string'
    || event.from.username.trim().replace(/^@/, '').toLowerCase() === account.username.toLowerCase()
    || !matchesCommentKeyword(event.text, 'SPEED')) return null;
  return trackSpeedCommentCampaign(account);
}

/** DMs may only continue a recent, matching comment session; no keyword starts. */
export function isCurrentTrackSpeedCommentLead(lead: any, account: InstagramAccount,
  recipientId: string, incomingAt: number, now: number): boolean {
  const campaign = trackSpeedCommentCampaign(account);
  if (!campaign || !lead || lead.accountId !== account.id || lead.ownerUserId !== account.userId
    || lead.instagramUserId !== recipientId || lead.campaignId !== campaign.id
    || lead.campaignTemplate !== campaign.template || !lead.campaignSessionId
    || !isTrackSpeedEventId(lead.initialCommentId) || !isTrackSpeedEventId(lead.initialMediaId)
    || lead.campaignJourney?.destinationUrl !== campaign.journey.destinationUrl
    || lead.campaignJourney?.linkMessage !== campaign.journey.linkMessage) return false;
  return Array.isArray(lead.history) && lead.history.some((h: any) => {
    const at = h.at?.toMillis?.();
    return h.role === 'user' && h.conversationId === `${account.id}_${recipientId}`
      && h.campaignSessionId === lead.campaignSessionId && typeof h.content === 'string'
      && h.content.startsWith('[Comment] ') && matchesCommentKeyword(h.content.slice(10), 'SPEED')
      && typeof at === 'number' && at <= incomingAt && at <= now
      && now - at < TRACKSPEED_COMMENT_COOLDOWN_MS;
  });
}
