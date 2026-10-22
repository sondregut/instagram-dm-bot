export const SONDRE_VAULT_TRAINING_URL = 'https://www.stavhopp.no/';

type AccountIdentity = { id: string; userId: string; instagramAccountId: string; platform?: string };
type CampaignIdentity = { id: string; accountId: string; ownerUserId: string; keyword: string;
  template: string; status: string; journey: { destinationUrl: string } };

/** This exception belongs only to the existing, verified VAULT campaign on sondre_pv. */
export function isSondreVaultCampaign(account: AccountIdentity, campaign: CampaignIdentity): boolean {
  return account.id === '75w5QJJQUa4TGOq8bwzZ'
    && account.userId === 'uqBSZBen8DPLxIkzMFH8tRle62F3'
    && account.instagramAccountId === '17841400489754274'
    && account.platform !== 'facebook'
    && campaign.id === 'vault-download-all-posts'
    && campaign.accountId === account.id
    && campaign.ownerUserId === account.userId
    && campaign.keyword === 'VAULT'
    && campaign.template === 'vault_tracker_download'
    && campaign.status === 'live';
}

export function isSondreVaultTrainingDestination(account: AccountIdentity, campaign: CampaignIdentity): boolean {
  return isSondreVaultCampaign(account, campaign)
    && campaign.journey.destinationUrl === SONDRE_VAULT_TRAINING_URL;
}
