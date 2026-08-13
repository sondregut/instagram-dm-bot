import { db } from '../firebase';

export const RESETTABLE_CONVERSATION_COLLECTIONS = [
  'mindset_followups',
  'mindset_handoffs',
  'mindset_comment_events',
  'mindset_leads',
  'conversations',
  'leads',
  'comment_dm_log',
  'story_dm_log',
  'follower_welcomes',
  'message_queue',
  'flow_executions',
  'scheduled_executions',
] as const;

export interface MindsetConversationResetResult {
  accountsMatched: number;
  deletedByCollection: Record<string, number>;
  totalDeleted: number;
}

async function deleteAccountDocuments(
  collectionName: string,
  accountId: string
): Promise<number> {
  let deleted = 0;

  while (true) {
    const snapshot = await db.collection(collectionName)
      .where('accountId', '==', accountId)
      .limit(400)
      .get();
    if (snapshot.empty) return deleted;

    const batch = db.batch();
    snapshot.docs.forEach((document) => batch.delete(document.ref));
    await batch.commit();
    deleted += snapshot.size;
  }
}

export async function resetConversationDataForInstagramUsername(
  username: string
): Promise<MindsetConversationResetResult> {
  const normalizedUsername = username.trim().toLowerCase();
  if (!normalizedUsername) throw new Error('Instagram username is required');

  const accountsSnapshot = await db.collection('accounts').limit(200).get();
  const matchingAccounts = accountsSnapshot.docs.filter((document) => {
    const accountUsername = document.data().username;
    return typeof accountUsername === 'string'
      && accountUsername.trim().toLowerCase() === normalizedUsername;
  });
  if (matchingAccounts.length === 0) {
    throw new Error(`No Instagram account matched @${normalizedUsername}`);
  }

  const deletedByCollection: Record<string, number> = {};
  for (const collectionName of RESETTABLE_CONVERSATION_COLLECTIONS) {
    let collectionDeleted = 0;
    for (const account of matchingAccounts) {
      collectionDeleted += await deleteAccountDocuments(collectionName, account.id);
    }
    deletedByCollection[collectionName] = collectionDeleted;
  }

  return {
    accountsMatched: matchingAccounts.length,
    deletedByCollection,
    totalDeleted: Object.values(deletedByCollection).reduce((total, count) => total + count, 0),
  };
}
