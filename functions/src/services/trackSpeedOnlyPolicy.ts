import type { InstagramAccount } from '../firebase';

type AccountIdentity = Pick<InstagramAccount, 'id' | 'userId' | 'instagramAccountId' | 'username'> & { platform?: string };
interface VerifiedTrackSpeedIdentity {
  readonly id: string;
  readonly userId: string;
  readonly instagramAccountId: string;
}

// Verified from the exact connected account on 2026-10-21.
// Only standalone SPEED comments start a session; DM keyword entry remains disabled.
// Never reuse the old @trackspeedapp / current @trackjumpapp identity.
export const TRACKSPEED_ONLY_IDENTITY: VerifiedTrackSpeedIdentity | null = {
  id: 'mPiDKihLzEo2tngt5C7F',
  userId: 'uqBSZBen8DPLxIkzMFH8tRle62F3',
  instagramAccountId: '17841479985440608',
};

/** A handle can reserve a silent route; it must never authorize delivery. */
export function isTrackSpeedOnlyScope(account?: AccountIdentity): boolean {
  if (!account || account.platform === 'facebook') return false;
  const identity = TRACKSPEED_ONLY_IDENTITY;
  return account.username?.trim().toLowerCase().replace(/^@/, '') === 'trackspeed_app'
    || Boolean(identity && (account.id === identity.id || account.instagramAccountId === identity.instagramAccountId));
}

/** Delivery needs all three verified immutable identity fields. */
export function isTrackSpeedOnlyAccount(account?: AccountIdentity): boolean {
  const identity = TRACKSPEED_ONLY_IDENTITY;
  return Boolean(identity?.id && identity.userId && identity.instagramAccountId
    && account && account.platform !== 'facebook' && account.id === identity.id
    && account.userId === identity.userId && account.instagramAccountId === identity.instagramAccountId);
}

export function isTrackSpeedOnlyEnabled(account?: AccountIdentity & {
  isActive?: boolean; connectionStatus?: string; webhookSubscribed?: boolean; automationMode?: string;
  appLinkFollowerGate?: { enabled?: boolean };
}): boolean {
  return isTrackSpeedOnlyAccount(account) && account?.isActive === true
    && account.connectionStatus === 'connected' && account.webhookSubscribed === true
    && account.automationMode !== 'paused' && account.automationMode !== 'test'
    && account.appLinkFollowerGate?.enabled === true;
}
