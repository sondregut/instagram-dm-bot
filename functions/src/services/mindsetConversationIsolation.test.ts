import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMindsetConversationId,
  isMindsetConversationIdentityMatch,
  isMindsetConversationRecordSelfConsistent,
  isMindsetFollowUpIdentityMatch,
  isMindsetHistoryEntryInConversation,
} from './mindsetConversationIsolation';

const accountA = 'account_A';
const accountB = 'account_B';
const userA = '178400000000001';
const userB = '178400000000002';
const ownerA = 'firebase-owner-A';

function lead(accountId: string, instagramUserId: string, ownerUserId: string = ownerA) {
  const id = buildMindsetConversationId(accountId, instagramUserId);
  return { id, accountId, instagramUserId, ownerUserId };
}

test('creates a distinct conversation scope for every account and participant pair', () => {
  assert.notEqual(
    buildMindsetConversationId(accountA, userA),
    buildMindsetConversationId(accountA, userB)
  );
  assert.notEqual(
    buildMindsetConversationId(accountA, userA),
    buildMindsetConversationId(accountB, userA)
  );
});

test('accepts only the exact account, participant, owner, and document path', () => {
  const record = lead(accountA, userA);
  const documentId = buildMindsetConversationId(accountA, userA);
  assert.equal(isMindsetConversationIdentityMatch(record, {
    documentId,
    accountId: accountA,
    instagramUserId: userA,
    ownerUserId: ownerA,
  }), true);

  assert.equal(isMindsetConversationIdentityMatch(record, {
    documentId,
    accountId: accountA,
    instagramUserId: userB,
    ownerUserId: ownerA,
  }), false);
  assert.equal(isMindsetConversationIdentityMatch(record, {
    documentId,
    accountId: accountB,
    instagramUserId: userA,
    ownerUserId: ownerA,
  }), false);
  assert.equal(isMindsetConversationIdentityMatch(record, {
    documentId,
    accountId: accountA,
    instagramUserId: userA,
    ownerUserId: 'different-owner',
  }), false);
});

test('rejects a record whose embedded identity disagrees with its document path', () => {
  const documentId = buildMindsetConversationId(accountA, userA);
  assert.equal(isMindsetConversationRecordSelfConsistent(documentId, {
    ...lead(accountA, userA),
    instagramUserId: userB,
  }), false);
  assert.equal(isMindsetConversationRecordSelfConsistent(documentId, {
    ...lead(accountA, userA),
    id: buildMindsetConversationId(accountA, userB),
  }), false);
});

test('binds every scheduled follow-up to the exact lead and account owner', () => {
  const record = lead(accountA, userA);
  assert.equal(isMindsetFollowUpIdentityMatch(
    { leadId: record.id, accountId: accountA },
    record.id,
    record,
    accountA,
    ownerA
  ), true);
  assert.equal(isMindsetFollowUpIdentityMatch(
    { leadId: buildMindsetConversationId(accountA, userB), accountId: accountA },
    record.id,
    record,
    accountA,
    ownerA
  ), false);
  assert.equal(isMindsetFollowUpIdentityMatch(
    { leadId: record.id, accountId: accountB },
    record.id,
    record,
    accountA,
    ownerA
  ), false);
});

test('drops history entries explicitly scoped to a different conversation', () => {
  const conversationA = buildMindsetConversationId(accountA, userA);
  const conversationB = buildMindsetConversationId(accountA, userB);
  const entries = [
    { role: 'user', content: 'Legacy entry in this lead document' },
    { role: 'assistant', content: 'Correct conversation', conversationId: conversationA },
    { role: 'user', content: 'Different user secret', conversationId: conversationB },
  ] as const;

  const isolated = entries.filter((entry) => (
    isMindsetHistoryEntryInConversation(entry, conversationA)
  ));
  assert.deepEqual(isolated.map((entry) => entry.content), [
    'Legacy entry in this lead document',
    'Correct conversation',
  ]);
  assert.doesNotMatch(isolated.map((entry) => entry.content).join(' '), /secret/i);
});
