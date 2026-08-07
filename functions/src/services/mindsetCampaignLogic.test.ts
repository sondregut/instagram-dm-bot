import test from 'node:test';
import assert from 'node:assert/strict';
import {
  campaignTargetsPost,
  campaignsOverlap,
  isCampaignStatusActive,
  normalizeMindsetCampaignKeyword,
  shouldUseRuntimeCampaign,
  validateMindsetCampaignInput,
} from './mindsetCampaignLogic';

test('normalizes campaign keywords without changing their meaning', () => {
  assert.equal(normalizeMindsetCampaignKeyword('  amdmtest8472 '), 'AMDMTEST8472');
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

test('disables the environment fallback when a stored campaign becomes active', () => {
  assert.equal(shouldUseRuntimeCampaign([{ status: 'draft' }], 'test'), true);
  assert.equal(shouldUseRuntimeCampaign([{ status: 'test' }], 'test'), false);
  assert.equal(shouldUseRuntimeCampaign([{ status: 'live' }], 'mindset'), false);
});

test('matches all posts for an empty target list and exact posts otherwise', () => {
  assert.equal(campaignTargetsPost([], 'post_7'), true);
  assert.equal(campaignTargetsPost(['post_2'], 'post_2'), true);
  assert.equal(campaignTargetsPost(['post_2'], 'post_7'), false);
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
});
