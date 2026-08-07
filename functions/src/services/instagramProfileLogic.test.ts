import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeInstagramUserProfile,
  PROFILE_PICTURE_REFRESH_INTERVAL_MS,
  PROFILE_PICTURE_RETRY_INTERVAL_MS,
  shouldRefreshProfilePicture,
} from './instagramProfileLogic';

test('normalizes the current Instagram messaging profile_pic field', () => {
  assert.deepEqual(normalizeInstagramUserProfile({
    id: 'ig-user-1',
    username: 'vaults.high',
    name: 'Nora',
    profile_pic: 'https://scontent.cdninstagram.com/profile.jpg',
  }), {
    id: 'ig-user-1',
    username: 'vaults.high',
    name: 'Nora',
    profile_picture_url: 'https://scontent.cdninstagram.com/profile.jpg',
  });
});

test('keeps compatibility with legacy profile_picture_url responses', () => {
  assert.equal(
    normalizeInstagramUserProfile({
      id: 'ig-user-2',
      username: 'marcus.runs',
      profile_picture_url: 'https://example.com/legacy.jpg',
    })?.profile_picture_url,
    'https://example.com/legacy.jpg'
  );
});

test('prefers the current field and rejects incomplete profiles', () => {
  assert.equal(
    normalizeInstagramUserProfile({
      id: 'ig-user-3',
      username: 'jules.compete',
      profile_pic: 'https://example.com/current.jpg',
      profile_picture_url: 'https://example.com/legacy.jpg',
    })?.profile_picture_url,
    'https://example.com/current.jpg'
  );
  assert.equal(normalizeInstagramUserProfile({ id: 'ig-user-4' }), null);
});

test('refreshes missing or expired profile-picture lookups only', () => {
  const now = Date.UTC(2026, 7, 7, 12);
  assert.equal(shouldRefreshProfilePicture(undefined, undefined, now), true);
  assert.equal(
    shouldRefreshProfilePicture(
      now - PROFILE_PICTURE_REFRESH_INTERVAL_MS + 1,
      undefined,
      now
    ),
    false
  );
  assert.equal(
    shouldRefreshProfilePicture(
      now - PROFILE_PICTURE_REFRESH_INTERVAL_MS,
      now - PROFILE_PICTURE_RETRY_INTERVAL_MS + 1,
      now
    ),
    false
  );
  assert.equal(
    shouldRefreshProfilePicture(
      now - PROFILE_PICTURE_REFRESH_INTERVAL_MS,
      now - PROFILE_PICTURE_RETRY_INTERVAL_MS,
      now
    ),
    true
  );
});
