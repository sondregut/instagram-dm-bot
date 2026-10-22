const test = require('node:test'), assert = require('node:assert/strict');
const { db } = require('../lib/firebase');
const mem = require('./memory-firestore.cjs').memoryFirestore(); db.collection = mem.collection; db.runTransaction = mem.runTransaction;
const { getAccountByInstagramId } = require('../lib/services/accounts');
const ref = db.collection('accounts').doc('synthetic-cache-account');
const a = { id: ref.id, userId: 'synthetic-owner', instagramAccountId: 'synthetic-cache-instagram', username: 'trackspeed_app',
  platform: 'instagram', isActive: true, connectionStatus: 'connected', webhookSubscribed: true, appLinkFollowerGate: { enabled: false } };
test('TrackSpeed account activation and emergency pause bypass the five-minute account cache', async () => {
  await ref.set(a); assert.equal((await getAccountByInstagramId(a.instagramAccountId)).appLinkFollowerGate.enabled, false);
  await ref.update({ appLinkFollowerGate: { enabled: true } });
  assert.equal((await getAccountByInstagramId(a.instagramAccountId)).appLinkFollowerGate.enabled, true);
  await ref.update({ appLinkFollowerGate: { enabled: false }, automationMode: 'paused' });
  const paused = await getAccountByInstagramId(a.instagramAccountId);
  assert.equal(paused.appLinkFollowerGate.enabled, false); assert.equal(paused.automationMode, 'paused');
  await ref.update({ isActive: false }); assert.equal(await getAccountByInstagramId(a.instagramAccountId), null);
});
test('duplicate connected TrackSpeed account identities are still rejected', async () => {
  await ref.set(a); await db.collection('accounts').doc('synthetic-duplicate').set({ ...a, id: 'synthetic-duplicate' });
  assert.equal(await getAccountByInstagramId(a.instagramAccountId), null);
});
