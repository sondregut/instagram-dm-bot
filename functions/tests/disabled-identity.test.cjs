const test = require('node:test'), assert = require('node:assert/strict');
const base = '../lib';
const policy = require(base + '/services/trackSpeedOnlyPolicy');
const gates = require(base + '/services/followerGatePolicy');
const routes = require(base + '/services/followerDirectKeywords');
const campaigns = require(base + '/services/mindsetCampaigns');
process.env.BOT_MODE = 'mindset';
process.env.MINDSET_AUTOMATION_ENABLED = 'true';
process.env.MINDSET_TARGET_ACCOUNT_USERNAMES = 'trackspeed_app';

test('mapping matches the reviewed plan; no username or connection flag can authorize an unmapped account', () => {
  const plan = require('./fixtures/trackspeed-identity.json');
  const preparedMapping = policy.TRACKSPEED_ONLY_IDENTITY;
  assert.deepEqual(preparedMapping, plan.verifiedIdentity);
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname,
    '../src/services/trackSpeedOnlyPolicy.ts'), 'utf8');
  if (preparedMapping === null) assert.match(source, /TRACKSPEED_ONLY_IDENTITY: VerifiedTrackSpeedIdentity \| null = null/);
  else {
    assert.equal(preparedMapping.userId, plan.expectedOwnerUserId);
    assert.equal(typeof preparedMapping.id, 'string'); assert(preparedMapping.id.trim());
    assert.match(preparedMapping.instagramAccountId, /^\d+$/);
    for (const existing of gates.FOLLOWER_GATE_ACCOUNTS) {
      assert.notEqual(preparedMapping.id, existing.id); assert.notEqual(preparedMapping.instagramAccountId, existing.instagramAccountId);
    }
  }
  policy.TRACKSPEED_ONLY_IDENTITY = null;
  try {
  for (const username of ['trackspeed_app', '@TrackSpeed_app', ' TRACKSPEED_APP ']) {
    const a = { id: 'synthetic-unverified', userId: 'synthetic-owner', instagramAccountId: 'synthetic-ig',
      username, isActive: true, connectionStatus: 'connected', webhookSubscribed: true,
      appLinkFollowerGate: { enabled: true } };
    assert.equal(policy.isTrackSpeedOnlyScope(a), true);
    assert.equal(policy.isTrackSpeedOnlyAccount(a), false);
    assert.equal(gates.isFollowerGateEnabled(a), false);
    assert.deepEqual(routes.followerDirectKeywordCampaigns(a), []);
    assert.equal(campaigns.isMindsetAccountAllowed(a), false);
    assert.equal(campaigns.runtimeMindsetCampaign(a), null);
  }
  } finally { policy.TRACKSPEED_ONLY_IDENTITY = preparedMapping; }
});

test('all four existing identities retain their original gate and keyword list', () => {
  for (const identity of gates.FOLLOWER_GATE_ACCOUNTS) {
    const a = { ...identity, appLinkFollowerGate: { enabled: true } };
    assert.equal(policy.isTrackSpeedOnlyScope(a), false);
    assert.equal(gates.isVerifiedFollowerGateAccount(a), true);
    assert.equal(gates.isFollowerGateEnabled(a), true);
    assert.equal(gates.followerGateButtonTitle(a), 'Check again');
    assert.match(gates.followerGatePrompt(a), /tap Check again/);
    assert.equal(gates.followerGateRetry(a), gates.FOLLOWER_GATE_RETRY);
    assert.equal(campaigns.isMindsetAccountAllowed(a), true);
    assert.deepEqual(routes.followerDirectKeywordCampaigns(a).map(c => c.keyword), ['JUMP', 'MINDSET', 'SPEED']);
  }
});
