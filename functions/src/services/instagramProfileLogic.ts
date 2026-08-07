export const PROFILE_PICTURE_REFRESH_INTERVAL_MS = 48 * 60 * 60 * 1000;
export const PROFILE_PICTURE_RETRY_INTERVAL_MS = 15 * 60 * 1000;

export interface InstagramUserProfile {
  id: string;
  username: string;
  name?: string;
  profile_picture_url?: string;
}

interface RawInstagramUserProfile {
  id?: unknown;
  username?: unknown;
  name?: unknown;
  profile_pic?: unknown;
  profile_picture_url?: unknown;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

export function normalizeInstagramUserProfile(
  value: RawInstagramUserProfile | null | undefined
): InstagramUserProfile | null {
  const id = optionalString(value?.id);
  const username = optionalString(value?.username);
  if (!id || !username) return null;

  return {
    id,
    username,
    name: optionalString(value?.name),
    // Messaging profiles use profile_pic. Keep profile_picture_url as a
    // backwards-compatible fallback for older Graph API responses.
    profile_picture_url: optionalString(value?.profile_pic)
      || optionalString(value?.profile_picture_url),
  };
}

export function shouldRefreshProfilePicture(
  lastUpdatedAtMillis: number | null | undefined,
  lastAttemptAtMillis: number | null | undefined,
  nowMillis: number = Date.now()
): boolean {
  if (lastUpdatedAtMillis
      && nowMillis - lastUpdatedAtMillis < PROFILE_PICTURE_REFRESH_INTERVAL_MS) {
    return false;
  }
  if (lastAttemptAtMillis
      && nowMillis - lastAttemptAtMillis < PROFILE_PICTURE_RETRY_INTERVAL_MS) {
    return false;
  }
  return true;
}
