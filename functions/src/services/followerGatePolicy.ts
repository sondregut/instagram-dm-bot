import { AsyncLocalStorage } from 'async_hooks';
import { isTrackSpeedOnlyAccount, isTrackSpeedOnlyEnabled } from './trackSpeedOnlyPolicy';

export interface FollowerGateAccount {
  id: string; userId: string; username: string; instagramAccountId: string; platform?: string;
  appLinkFollowerGate?: { enabled?: boolean };
}
export const FOLLOWER_GATE_IDENTITY = {
  id: '75w5QJJQUa4TGOq8bwzZ', userId: 'uqBSZBen8DPLxIkzMFH8tRle62F3',
  username: 'sondre_pv', instagramAccountId: '17841400489754274',
} as const;
// Verified connected accounts belonging to this owner. Never match a similar handle.
export const FOLLOWER_GATE_ACCOUNTS = [
  FOLLOWER_GATE_IDENTITY,
  { id: 'TXPgRGqp2Z6Rno7B2yzi', userId: FOLLOWER_GATE_IDENTITY.userId, username: 'trackjumpapp', instagramAccountId: '17841437108874860' },
  { id: 'bcftCOMTFa6fIu7SFdjq', userId: FOLLOWER_GATE_IDENTITY.userId, username: 'polevaulttracker', instagramAccountId: '17841465955611274' },
  { id: 'u6ULZ55wWjF0KX5qFiLP', userId: FOLLOWER_GATE_IDENTITY.userId, username: 'athletemindsetapp', instagramAccountId: '17841477418766956' },
] as const;
export const FOLLOWER_CHECK_MAX_AGE_MS = 30_000;
export const FOLLOWER_RECHECK_MS = 10_000;
export const FOLLOWER_ERROR_RECHECK_MS = 30_000;
export const FOLLOWER_LINK_COOLDOWN_MS = 60_000;
export const FOLLOWER_WINDOW_MS = 24 * 60 * 60 * 1000;
export const FOLLOWER_WINDOW_MARGIN_MS = 60_000;
export const FOLLOWER_GATE_PROMPT = 'This link is only for my followers. Follow @sondre_pv, then tap Check again or reply LINK.';
export function followerGatePrompt(account: FollowerGateAccount): string {
  return `This link is only for my followers. Follow @${account.username}, then tap ${followerGateButtonTitle(account)} or reply LINK.`;
}
export const FOLLOWER_GATE_RETRY = 'I couldn’t verify your follow yet. Wait a moment, then tap Check again.';
export function followerGateButtonTitle(account: FollowerGateAccount): string {
  return isTrackSpeedOnlyAccount(account) ? 'Following' : 'Check again';
}
export function followerGateRetry(account: FollowerGateAccount): string {
  return isTrackSpeedOnlyAccount(account)
    ? 'I couldn’t verify your follow yet. Wait a moment, then tap Following.'
    : FOLLOWER_GATE_RETRY;
}

/** Handles can change; authorization belongs to the verified owner and immutable IDs. */
export function isVerifiedFollowerGateAccount(account?: FollowerGateAccount): boolean {
  return Boolean(account && account.platform !== 'facebook'
    && FOLLOWER_GATE_ACCOUNTS.some(identity => identity.id === account.id
      && identity.userId === account.userId && identity.instagramAccountId === account.instagramAccountId));
}

export function isFollowerGateEnabled(account?: FollowerGateAccount): boolean {
  return (isVerifiedFollowerGateAccount(account) && account?.appLinkFollowerGate?.enabled === true)
    || isTrackSpeedOnlyEnabled(account);
}

/** An existing conversation's explicit dashboard resume also resumes its gate. */
export function isFollowerGateRecipientBlocked(state: any, lead: any): boolean {
  if (state?.optedOut) return true;
  if (!state?.humanHandoff) return false;
  return !(state.handoffHadLead && lead && lead.automationPaused === false
    && lead.stage !== 'human_handoff'
    && (lead.updatedAt?.toMillis?.() || 0) > (state.humanHandoffAt?.toMillis?.() || 0));
}

export function containsOutboundLink(value: unknown): boolean {
  if (typeof value === 'string') return /https?:\/\/|www\.|itms-apps?:|apps\.apple\.com/i.test(value);
  if (Array.isArray(value)) return value.some(containsOutboundLink);
  return Boolean(value && typeof value === 'object' && Object.values(value).some(containsOutboundLink));
}

// Only the verified, deduplicated gate handler grants a permit. Timers, old
// campaigns, AI output and scheduler sends have no permit and cannot release URLs.
const permits = new AsyncLocalStorage<{ accountId: string; recipientId: string; message: string; until: number }>();
const inbound = new AsyncLocalStorage<{ accountId: string; recipientId: string; expiresAt: number;
  onBlockedLink: () => Promise<boolean>; handled: boolean }>();
export function withFollowerInbound<T>(account: FollowerGateAccount, recipientId: string, expiresAt: number,
  onBlockedLink: () => Promise<boolean>, action: () => Promise<T>): Promise<T> {
  if (!isFollowerGateEnabled(account)) return action();
  return inbound.run({ accountId: account.id, recipientId, expiresAt, onBlockedLink, handled: false }, action);
}
export function followerInboundExpiry(accountId: string, recipientId: string): number {
  const context = inbound.getStore();
  return context?.accountId === accountId && context.recipientId === recipientId ? context.expiresAt : 0;
}
export function withVerifiedFollowerLink<T>(accountId: string, recipientId: string, message: string,
  checkedAt: number, expiresAt: number, action: () => Promise<T>): Promise<T> {
  return permits.run({ accountId, recipientId, message,
    until: Math.min(checkedAt + FOLLOWER_CHECK_MAX_AGE_MS, expiresAt) }, action);
}
export function canDeliverFollowerProtectedContent(account: FollowerGateAccount | undefined,
  recipientId: string | undefined, content: unknown): boolean {
  if (!isFollowerGateEnabled(account) || !containsOutboundLink(content)) return true;
  const permit = permits.getStore();
  const allowed = Boolean(permit && permit.accountId === account!.id && permit.recipientId === recipientId
    && typeof content === 'string' && content === permit.message && Date.now() < permit.until);
  if (!allowed) console.warn('[FollowGate] Protected link blocked without a current verified delivery permit');
  return allowed;
}

export async function protectFollowerOutbound(account: FollowerGateAccount | undefined,
  recipientId: string | undefined, content: unknown): Promise<boolean> {
  if (canDeliverFollowerProtectedContent(account, recipientId, content)) return true;
  const context = inbound.getStore();
  if (context && context.accountId === account?.id && context.recipientId === recipientId && !context.handled) {
    context.handled = true;
    await context.onBlockedLink();
  }
  return false;
}
