import test from 'node:test';
import assert from 'node:assert/strict';
import {
  campaignTargetsPost,
  campaignsOverlap,
  isWaitingForNextPost,
  isCampaignStatusActive,
  normalizeMindsetCampaignKeyword,
  normalizeMindsetCampaignPostMode,
  parseMindsetTargetAccountUsernames,
  selectNextCampaignPostId,
  shouldUseRuntimeCampaign,
  validateMindsetCampaignInput,
} from './mindsetCampaignLogic';

test('normalizes campaign keywords without changing their meaning', () => {
  assert.equal(normalizeMindsetCampaignKeyword('  amdmtest8472 '), 'AMDMTEST8472');
});

test('allows multiple isolated Instagram accounts in the protected workspace', () => {
  assert.deepEqual(
    [...parseMindsetTargetAccountUsernames('sondre_pv, @AthleteMindsetApp', 'legacy_account')],
    ['sondre_pv', 'athletemindsetapp']
  );
});

test('falls back to the legacy single-account setting during migration', () => {
  assert.deepEqual(
    [...parseMindsetTargetAccountUsernames(undefined, '@Sondre_PV')],
    ['sondre_pv']
  );
});

test('blocks the live ManyChat keyword from test campaigns', () => {
  const errors = validateMindsetCampaignInput({
    name: 'Next post test',
    keyword: 'MINDSET',
    postIds: [],
    status: 'test',
  }, 'test');

  assert.ok(errors.some((error) => error.includes('ManyChat')));
});

test('allows MINDSET to be saved as a draft while test mode is active', () => {
  const errors = validateMindsetCampaignInput({
    name: 'Future MINDSET launch',
    keyword: 'MINDSET',
    postIds: ['post_1'],
    status: 'draft',
  }, 'test');

  assert.deepEqual(errors, []);
});

test('requires an explicit production mode before a campaign can go live', () => {
  assert.equal(isCampaignStatusActive('live', 'test'), false);
  assert.equal(isCampaignStatusActive('live', 'mindset'), true);
  assert.equal(isCampaignStatusActive('test', 'test'), true);
});

test('only disables the environment fallback when an active campaign claims its keyword', () => {
  assert.equal(shouldUseRuntimeCampaign([
    { status: 'draft', keyword: 'MINDSET' },
  ], 'test', 'MINDSET'), true);
  assert.equal(shouldUseRuntimeCampaign([
    { status: 'test', keyword: 'VAULT' },
  ], 'test', 'MINDSET'), true);
  assert.equal(shouldUseRuntimeCampaign([
    { status: 'test', keyword: 'MINDSET' },
  ], 'test', 'MINDSET'), false);
  assert.equal(shouldUseRuntimeCampaign([
    { status: 'live', keyword: 'MINDSET' },
  ], 'mindset', 'MINDSET'), false);
});

test('matches all posts for an empty target list and exact posts otherwise', () => {
  assert.equal(campaignTargetsPost({ postMode: 'any', postIds: [] }, 'post_7'), true);
  assert.equal(campaignTargetsPost({ postMode: 'specific', postIds: ['post_2'] }, 'post_2'), true);
  assert.equal(campaignTargetsPost({ postMode: 'specific', postIds: ['post_2'] }, 'post_7'), false);
  assert.equal(campaignTargetsPost({ postMode: 'next', postIds: [], nextPostId: null }, 'post_7'), false);
  assert.equal(campaignTargetsPost({ postMode: 'next', postIds: [], nextPostId: 'post_7' }, 'post_7'), true);
});

test('keeps legacy campaign post targeting compatible', () => {
  assert.equal(normalizeMindsetCampaignPostMode({ postIds: [] }), 'any');
  assert.equal(normalizeMindsetCampaignPostMode({ postIds: ['post_2'] }), 'specific');
});

test('detects overlapping active campaign scopes', () => {
  assert.equal(campaignsOverlap(
    { keyword: 'START', postIds: [] },
    { keyword: 'start', postIds: ['post_4'] }
  ), true);
  assert.equal(campaignsOverlap(
    { keyword: 'START', postIds: ['post_2'] },
    { keyword: 'START', postIds: ['post_4'] }
  ), false);
  assert.equal(campaignsOverlap(
    { keyword: 'START', postMode: 'next', postIds: [], nextPostId: null },
    { keyword: 'START', postMode: 'specific', postIds: ['post_4'] }
  ), false);
  assert.equal(campaignsOverlap(
    { keyword: 'START', postMode: 'next', postIds: [], nextPostId: 'post_4' },
    { keyword: 'START', postMode: 'specific', postIds: ['post_4'] }
  ), true);
  assert.equal(campaignsOverlap(
    { keyword: 'START', postMode: 'next', postIds: [], nextPostId: null },
    { keyword: 'START', postMode: 'next', postIds: [], nextPostId: null }
  ), true);
});

test('identifies only unresolved Next post campaigns as waiting', () => {
  assert.equal(isWaitingForNextPost({ postMode: 'next', postIds: [], nextPostId: null }), true);
  assert.equal(isWaitingForNextPost({ postMode: 'next', postIds: [], nextPostId: 'post_2' }), false);
  assert.equal(isWaitingForNextPost({ postMode: 'any', postIds: [], nextPostId: null }), false);
});

test('selects and locks to the earliest post published after activation', () => {
  const activation = Date.parse('2026-08-08T12:00:00.500Z');
  const posts = [
    { id: 'second-new-post', timestamp: '2026-08-08T12:10:00.000Z' },
    { id: 'old-post', timestamp: '2026-08-08T11:55:00.000Z' },
    { id: 'first-new-post', timestamp: '2026-08-08T12:05:00.000Z' },
  ];

  assert.equal(selectNextCampaignPostId(posts, ['old-post'], activation), 'first-new-post');
  assert.equal(selectNextCampaignPostId(posts, ['old-post', 'first-new-post'], activation), 'second-new-post');
  assert.equal(selectNextCampaignPostId([
    { id: 'old-post', timestamp: '2026-08-08T11:55:00.000Z' },
  ], ['old-post'], activation), null);
});

test('allows a same-second new post only when it was not present at activation', () => {
  const activation = Date.parse('2026-08-08T12:00:00.900Z');
  const posts = [
    { id: 'baseline-post', timestamp: '2026-08-08T12:00:00.000Z' },
    { id: 'new-post', timestamp: '2026-08-08T12:00:00.000Z' },
  ];

  assert.equal(selectNextCampaignPostId(posts, ['baseline-post'], activation), 'new-post');
});

test('uses Instagram reverse chronological order to break same-second ties', () => {
  const activation = Date.parse('2026-08-08T12:00:00.000Z');
  const posts = [
    { id: 'published-second', timestamp: '2026-08-08T12:05:00.000Z' },
    { id: 'published-first', timestamp: '2026-08-08T12:05:00.000Z' },
  ];

  assert.equal(selectNextCampaignPostId(posts, [], activation), 'published-first');
});

test('validates post selection against the explicit targeting mode', () => {
  const nextErrors = validateMindsetCampaignInput({
    name: 'Next post launch',
    keyword: 'FOCUS',
    postMode: 'next',
    postIds: [],
    status: 'draft',
  }, 'test');
  assert.deepEqual(nextErrors, []);

  const specificErrors = validateMindsetCampaignInput({
    name: 'Specific post launch',
    keyword: 'FOCUS',
    postMode: 'specific',
    postIds: [],
    status: 'draft',
  }, 'test');
  assert.ok(specificErrors.some((error) => error.includes('at least one post')));
});

test('validates the optional public comment reply independently from the DM', () => {
  assert.deepEqual(validateMindsetCampaignInput({
    name: 'Public reply off',
    keyword: 'FOCUS',
    postIds: ['post_2'],
    status: 'draft',
    publicReplyEnabled: false,
    publicReplyText: '',
  }, 'test'), []);

  const errors = validateMindsetCampaignInput({
    name: 'Public reply on',
    keyword: 'FOCUS',
    postIds: ['post_2'],
    status: 'draft',
    publicReplyEnabled: true,
    publicReplyText: '',
  }, 'test');
  assert.ok(errors.some((error) => error.includes('Public comment reply')));

  assert.deepEqual(validateMindsetCampaignInput({
    name: 'Rotating replies',
    keyword: 'FOCUS',
    postIds: ['post_2'],
    status: 'draft',
    publicReplyEnabled: true,
    publicReplyText: 'Got you. Check your DMs!\nI sent you the link. Check your DMs!',
  }, 'test'), []);

  const tooManyReplies = validateMindsetCampaignInput({
    name: 'Too many replies',
    keyword: 'FOCUS',
    postIds: ['post_2'],
    status: 'draft',
    publicReplyEnabled: true,
    publicReplyText: ['One', 'Two', 'Three', 'Four', 'Five', 'Six'].join('\n'),
  }, 'test');
  assert.ok(tooManyReplies.some((error) => error.includes('between 1 and 5')));
});
