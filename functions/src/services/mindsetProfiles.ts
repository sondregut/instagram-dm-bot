import * as admin from 'firebase-admin';
import { db, InstagramAccount } from '../firebase';
import { getInstagramUser } from './instagram';
import { shouldRefreshProfilePicture } from './instagramProfileLogic';
import {
  isMindsetConversationIdentityMatch,
  isMindsetConversationRecordSelfConsistent,
} from './mindsetConversationIsolation';

const MINDSET_LEADS_COLLECTION = 'mindset_leads';

export interface MindsetProfileRecord {
  id: string;
  accountId: string;
  ownerUserId: string;
  instagramUserId: string;
  username: string;
  lastUserInteractionAt?: admin.firestore.Timestamp;
  profilePictureUrl?: string | null;
  profilePictureUpdatedAt?: admin.firestore.Timestamp;
  profilePictureRefreshAttemptedAt?: admin.firestore.Timestamp;
}

interface MindsetProfileRefreshResult<T extends MindsetProfileRecord> {
  lead: T;
  attempted: boolean;
  updated: boolean;
}

function timestampMillis(value?: admin.firestore.Timestamp): number | undefined {
  return value?.toMillis();
}

function profileNeedsRefresh(lead: MindsetProfileRecord, nowMillis: number): boolean {
  return shouldRefreshProfilePicture(
    timestampMillis(lead.profilePictureUpdatedAt),
    timestampMillis(lead.profilePictureRefreshAttemptedAt),
    nowMillis
  );
}

/**
 * Refreshes a messaging user's short-lived Meta profile picture URL.
 * This always fails open so profile enrichment never prevents a response from
 * being sent; inbound-message handling runs it alongside the reply path.
 */
export async function refreshMindsetLeadProfile<T extends MindsetProfileRecord>(
  ref: FirebaseFirestore.DocumentReference,
  lead: T,
  account: InstagramAccount
): Promise<MindsetProfileRefreshResult<T>> {
  const now = admin.firestore.Timestamp.now();
  if (!isMindsetConversationIdentityMatch(lead, {
    documentId: ref.id,
    accountId: account.id,
    instagramUserId: lead.instagramUserId,
    ownerUserId: account.userId,
  })) {
    console.error('[Mindset] Profile refresh blocked by conversation isolation guard');
    return { lead, attempted: false, updated: false };
  }
  if (!profileNeedsRefresh(lead, now.toMillis())) {
    return { lead, attempted: false, updated: false };
  }

  try {
    const profile = await getInstagramUser(lead.instagramUserId, account);
    const attemptUpdates: Record<string, unknown> = {
      profilePictureRefreshAttemptedAt: now,
    };

    if (!profile) {
      await ref.set(attemptUpdates, { merge: true });
      return {
        lead: { ...lead, profilePictureRefreshAttemptedAt: now },
        attempted: true,
        updated: false,
      };
    }

    const profilePictureUrl = profile.profile_picture_url || null;
    const updates = {
      ...attemptUpdates,
      profilePictureUrl,
      profilePictureUpdatedAt: now,
      username: profile.username || lead.username,
    };
    await ref.set(updates, { merge: true });

    return {
      lead: {
        ...lead,
        ...updates,
      } as T,
      attempted: true,
      updated: true,
    };
  } catch (error) {
    console.warn(`[Mindset] Profile refresh failed for ${lead.instagramUserId}:`, error);
    return { lead, attempted: true, updated: false };
  }
}

export async function refreshStaleMindsetLeadProfiles(
  account: InstagramAccount,
  maxCandidates: number = 25
): Promise<{ attempted: number; updated: number }> {
  const snapshot = await db.collection(MINDSET_LEADS_COLLECTION)
    .where('accountId', '==', account.id)
    .limit(200)
    .get();
  const nowMillis = Date.now();
  const candidates = snapshot.docs
    .flatMap((doc) => {
      const data = doc.data() as MindsetProfileRecord;
      if (!isMindsetConversationRecordSelfConsistent(doc.id, data)) return [];
      return [{
        ref: doc.ref,
        lead: { ...data, id: doc.id } as MindsetProfileRecord,
      }];
    })
    // A comment alone does not grant profile access. Only enrich people who
    // have interacted with the private-message flow.
    .filter(({ ref, lead }) => (
      Boolean(lead.instagramUserId && lead.lastUserInteractionAt)
      && isMindsetConversationIdentityMatch(lead, {
        documentId: ref.id,
        accountId: account.id,
        instagramUserId: lead.instagramUserId,
        ownerUserId: account.userId,
      })
    ))
    .filter(({ lead }) => profileNeedsRefresh(lead, nowMillis))
    .sort((first, second) => (
      timestampMillis(second.lead.lastUserInteractionAt) || 0
    ) - (
      timestampMillis(first.lead.lastUserInteractionAt) || 0
    ))
    .slice(0, Math.max(0, maxCandidates));

  let attempted = 0;
  let updated = 0;
  for (const candidate of candidates) {
    const result = await refreshMindsetLeadProfile(candidate.ref, candidate.lead, account);
    if (result.attempted) attempted++;
    if (result.updated) updated++;
  }

  return { attempted, updated };
}
