import type { InstagramAccount } from '../firebase';

// Identity verified from the completed owner-authorized Instagram connection.
export const POLE_VAULT_ACCOUNT = {
  id: 'bcftCOMTFa6fIu7SFdjq',
  username: 'polevaulttracker',
  instagramAccountId: '17841465955611274',
  userId: 'uqBSZBen8DPLxIkzMFH8tRle62F3',
  campaignId: 'polevaulttracker-vault-training-app-all-posts',
} as const;
export const POLE_VAULT_URL = 'https://apps.apple.com/us/app/vault-pole-vault-training/id6767121354';
export const POLE_VAULT_LINK_MESSAGE = 'Here you go!\n\nPole vault training\nhttps://stavhopp.no/\n\nVAULT app';
export const POLE_VAULT_REPLY = `${POLE_VAULT_LINK_MESSAGE}\n${POLE_VAULT_URL}`;

export function isPoleVaultAccount(account: InstagramAccount & { platform?: string }): boolean {
  return account.id === POLE_VAULT_ACCOUNT.id
    && account.username === POLE_VAULT_ACCOUNT.username
    && account.instagramAccountId === POLE_VAULT_ACCOUNT.instagramAccountId
    && account.userId === POLE_VAULT_ACCOUNT.userId
    && account.platform !== 'facebook';
}
