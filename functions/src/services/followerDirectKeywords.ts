import type { InstagramAccount } from '../firebase';
import type { MindsetCampaign } from './mindsetCampaigns';
import { normalizeMindsetCampaignJourney } from './mindsetCampaignJourney';
import { VERIFIED_APP_LINKS } from './linkRecoveryLogic';
import { isTrackSpeedOnlyScope } from './trackSpeedOnlyPolicy';

const ROUTES = [
  { keyword: 'JUMP', template: 'trackjump_download' },
  { keyword: 'MINDSET', template: 'athlete_mindset_download' },
  { keyword: 'SPEED', template: 'trackspeed_download' },
] as const;

/** Explicit DM routes are independent of existing comment-campaign mappings. */
export function followerDirectKeywordCampaigns(account: InstagramAccount): MindsetCampaign[] {
  // This account can only enter through a SPEED comment.
  if (isTrackSpeedOnlyScope(account)) return [];
  const routes = ROUTES;
  return routes.map(route => {
    const journey = normalizeMindsetCampaignJourney({
      destinationUrl: VERIFIED_APP_LINKS[route.template].url, linkMessage: 'Here you go!',
    }, route.template);
    for (const followUp of Object.values(journey.followUps)) followUp.enabled = false;
    return { id: `direct-keyword-${account.id}-${route.keyword.toLowerCase()}`,
      ownerUserId: account.userId, accountId: account.id, name: `${route.keyword} direct DM`,
      keyword: route.keyword, template: route.template, status: 'live',
      postIds: [], postMode: 'any', publicReplyEnabled: false, publicReplyText: '', journey, isSystem: true };
  });
}
