export interface MindsetConversationIdentityRecord {
  id?: unknown;
  accountId?: unknown;
  ownerUserId?: unknown;
  instagramUserId?: unknown;
}

export interface MindsetConversationIdentityExpectation {
  documentId: string;
  accountId: string;
  instagramUserId: string;
  ownerUserId?: string;
}

export interface MindsetConversationHistoryRecord {
  role?: unknown;
  content?: unknown;
  conversationId?: unknown;
}

function safeDocumentId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 500);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * A DM conversation belongs to exactly one managed Instagram account and one
 * Instagram participant. The existing document format is retained so deployed
 * conversations do not need a migration.
 */
export function buildMindsetConversationId(
  accountId: string,
  instagramUserId: string
): string {
  return safeDocumentId(`${accountId}_${instagramUserId}`);
}

/**
 * Validates both the stored identity fields and their canonical Firestore path.
 * Callers fail closed when this returns false.
 */
export function isMindsetConversationIdentityMatch(
  record: MindsetConversationIdentityRecord,
  expected: MindsetConversationIdentityExpectation
): boolean {
  if (!nonEmptyString(record.accountId)
      || !nonEmptyString(record.instagramUserId)
      || !nonEmptyString(expected.documentId)
      || !nonEmptyString(expected.accountId)
      || !nonEmptyString(expected.instagramUserId)) {
    return false;
  }

  const canonicalId = buildMindsetConversationId(
    expected.accountId,
    expected.instagramUserId
  );
  if (expected.documentId !== canonicalId
      || record.accountId !== expected.accountId
      || record.instagramUserId !== expected.instagramUserId) {
    return false;
  }

  if (nonEmptyString(record.id) && record.id !== expected.documentId) return false;
  if (expected.ownerUserId !== undefined
      && record.ownerUserId !== expected.ownerUserId) return false;
  return true;
}

export function isMindsetConversationRecordSelfConsistent(
  documentId: string,
  record: MindsetConversationIdentityRecord
): boolean {
  if (!nonEmptyString(record.accountId)
      || !nonEmptyString(record.instagramUserId)
      || !nonEmptyString(record.ownerUserId)) {
    return false;
  }
  return isMindsetConversationIdentityMatch(record, {
    documentId,
    accountId: record.accountId,
    instagramUserId: record.instagramUserId,
    ownerUserId: record.ownerUserId,
  });
}

export function isMindsetFollowUpIdentityMatch(
  followUp: { leadId?: unknown; accountId?: unknown },
  leadDocumentId: string,
  lead: MindsetConversationIdentityRecord,
  expectedAccountId: string,
  expectedOwnerUserId: string
): boolean {
  if (followUp.leadId !== leadDocumentId
      || followUp.accountId !== expectedAccountId) {
    return false;
  }
  if (!nonEmptyString(lead.instagramUserId)) return false;
  return isMindsetConversationIdentityMatch(lead, {
    documentId: leadDocumentId,
    accountId: expectedAccountId,
    instagramUserId: lead.instagramUserId,
    ownerUserId: expectedOwnerUserId,
  });
}

/**
 * New history entries carry a conversationId. Legacy entries without the tag
 * remain readable only inside the lead document they were already stored in.
 * Any explicitly mismatched entry is excluded before Claude or the dashboard
 * can consume it.
 */
export function isMindsetHistoryEntryInConversation(
  entry: MindsetConversationHistoryRecord,
  conversationId: string
): boolean {
  if ((entry.role !== 'user' && entry.role !== 'assistant')
      || typeof entry.content !== 'string') {
    return false;
  }
  return entry.conversationId === undefined
    || entry.conversationId === conversationId;
}
