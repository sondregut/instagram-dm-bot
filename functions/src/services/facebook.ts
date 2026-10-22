import type { InstagramAccount } from '../firebase';
import { decrypt } from '../utils/encryption';
import { checkRateLimit, recordSentMessage } from '../utils/rateLimiter';
import { truncateMessage } from '../utils/validators';
import type { InstagramPost } from './instagram';
import type { InstagramUserProfile } from './instagramProfileLogic';
import {
  buildFacebookButtonMessagePayload,
  buildFacebookPrivateReplyPayload,
  buildFacebookQuickReplyPayload,
  buildFacebookTextMessagePayload,
} from './facebookLogic';

const GRAPH_API_VERSION = 'v21.0';
const FACEBOOK_GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

interface FacebookApiResult {
  success: boolean;
  data?: any;
  error?: string;
}

function pageIdForAccount(account: InstagramAccount): string {
  return account.pageId || account.instagramAccountId;
}

function accessTokenForAccount(account: InstagramAccount): string {
  if (account.accessToken?.includes(':')) {
    try {
      return decrypt(account.accessToken);
    } catch {
      // Older development records may still contain an unencrypted token.
    }
  }
  return account.accessToken;
}

async function facebookGraphRequest(
  endpoint: string,
  accessToken: string,
  method: 'GET' | 'POST' = 'GET',
  body?: object
): Promise<FacebookApiResult> {
  const response = await fetch(`${FACEBOOK_GRAPH_API_BASE}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    ...(body && method === 'POST' ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) {
    const errorCode = data?.error?.code || response.status;
    console.error(`[Facebook] Graph request failed (${errorCode})`);
    return {
      success: false,
      error: data?.error?.message || `Facebook request failed (${response.status})`,
    };
  }
  return { success: true, data };
}

async function canSend(account: InstagramAccount): Promise<boolean> {
  const rateLimit = await checkRateLimit(account.id);
  if (!rateLimit.allowed) {
    console.warn(`[Facebook] Outbound message blocked by rate limit for ${account.id}`);
    return false;
  }
  return true;
}

export function isFacebookAccount(account?: InstagramAccount | null): boolean {
  return account?.platform === 'facebook';
}

export async function sendFacebookDM(
  recipientId: string,
  message: string,
  account: InstagramAccount
): Promise<boolean> {
  if (!await canSend(account)) return false;
  const result = await facebookGraphRequest(
    `/${pageIdForAccount(account)}/messages`,
    accessTokenForAccount(account),
    'POST',
    buildFacebookTextMessagePayload(recipientId, message)
  );
  if (!result.success) return false;
  await recordSentMessage(recipientId, 'dm', account.id);
  return true;
}

export async function sendFacebookQuickReplyDM(
  recipientId: string,
  message: string,
  quickReplies: { title: string; payload: string }[],
  account: InstagramAccount
): Promise<boolean> {
  if (!await canSend(account)) return false;
  const result = await facebookGraphRequest(
    `/${pageIdForAccount(account)}/messages`,
    accessTokenForAccount(account),
    'POST',
    buildFacebookQuickReplyPayload(recipientId, message, quickReplies)
  );
  if (!result.success) return false;
  await recordSentMessage(recipientId, 'dm', account.id);
  return true;
}

export async function sendFacebookButtonDM(
  recipientId: string,
  title: string,
  buttons: { title: string; url: string }[],
  account: InstagramAccount
): Promise<boolean> {
  if (!await canSend(account)) return false;
  const result = await facebookGraphRequest(
    `/${pageIdForAccount(account)}/messages`,
    accessTokenForAccount(account),
    'POST',
    buildFacebookButtonMessagePayload(recipientId, title, buttons)
  );
  if (!result.success) return false;
  await recordSentMessage(recipientId, 'dm', account.id);
  return true;
}

/** Facebook permits one text-only private reply to an eligible Page comment. */
export async function sendFacebookPrivateReply(
  commentId: string,
  message: string,
  account: InstagramAccount
): Promise<boolean> {
  if (!await canSend(account)) return false;
  const result = await facebookGraphRequest(
    `/${commentId}/private_replies`,
    accessTokenForAccount(account),
    'POST',
    buildFacebookPrivateReplyPayload(message)
  );
  if (!result.success) return false;
  await recordSentMessage(commentId, 'dm', account.id);
  return true;
}

export async function replyToFacebookComment(
  commentId: string,
  message: string,
  account: InstagramAccount
): Promise<boolean> {
  const result = await facebookGraphRequest(
    `/${commentId}/comments`,
    accessTokenForAccount(account),
    'POST',
    { message: truncateMessage(message, 300) }
  );
  return result.success;
}

export async function getFacebookUserProfile(
  userId: string,
  account: InstagramAccount
): Promise<InstagramUserProfile | null> {
  const fields = encodeURIComponent('id,first_name,last_name,name,profile_pic');
  const result = await facebookGraphRequest(
    `/${userId}?fields=${fields}`,
    accessTokenForAccount(account)
  );
  if (!result.success || !result.data?.id) return null;
  const name = [result.data.first_name, result.data.last_name]
    .filter((value) => typeof value === 'string' && value.trim())
    .join(' ')
    || (typeof result.data.name === 'string' ? result.data.name : 'Facebook user');
  return {
    id: String(result.data.id),
    username: name,
    name,
    profile_picture_url: typeof result.data.profile_pic === 'string'
      ? result.data.profile_pic
      : undefined,
  };
}

export async function getFacebookPagePosts(
  account: InstagramAccount,
  limit: number = 25
): Promise<InstagramPost[]> {
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const fields = encodeURIComponent(
    'id,message,created_time,full_picture,permalink_url,attachments.limit(1){media,type,url,target}'
  );
  const result = await facebookGraphRequest(
    `/${pageIdForAccount(account)}/published_posts?fields=${fields}&limit=${safeLimit}`,
    accessTokenForAccount(account)
  );
  if (!result.success || !Array.isArray(result.data?.data)) return [];

  return result.data.data.flatMap((raw: any) => {
    if (!raw?.id || !raw?.created_time) return [];
    const attachment = raw.attachments?.data?.[0];
    const attachmentType = typeof attachment?.type === 'string'
      ? attachment.type.toLowerCase()
      : '';
    const mediaType: InstagramPost['mediaType'] = attachmentType.includes('video')
      ? 'VIDEO'
      : attachmentType.includes('album') || attachmentType.includes('carousel')
        ? 'CAROUSEL_ALBUM'
        : 'IMAGE';
    const mediaUrl = typeof raw.full_picture === 'string'
      ? raw.full_picture
      : attachment?.media?.image?.src;
    return [{
      id: String(raw.id),
      mediaType,
      mediaUrl,
      thumbnailUrl: mediaUrl,
      caption: typeof raw.message === 'string' ? raw.message : undefined,
      timestamp: String(raw.created_time),
      permalink: typeof raw.permalink_url === 'string' ? raw.permalink_url : attachment?.url,
    }];
  });
}

export async function subscribeFacebookPage(
  pageId: string,
  pageAccessToken: string
): Promise<boolean> {
  const result = await facebookGraphRequest(
    `/${pageId}/subscribed_apps`,
    pageAccessToken,
    'POST',
    {
      subscribed_fields: 'feed,messages,messaging_postbacks,message_echoes',
    }
  );
  return result.success === true && result.data?.success !== false;
}

export async function verifyFacebookPageConnection(account: InstagramAccount): Promise<boolean> {
  const fields = encodeURIComponent('id,name');
  const result = await facebookGraphRequest(
    `/${pageIdForAccount(account)}?fields=${fields}`,
    accessTokenForAccount(account)
  );
  return result.success && String(result.data?.id || '') === pageIdForAccount(account);
}
