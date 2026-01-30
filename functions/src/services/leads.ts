import { db, Lead, Conversation } from '../firebase';
import * as admin from 'firebase-admin';

/**
 * Create or update a lead (Multi-tenant version)
 */
export async function createOrUpdateLead(data: {
  userId: string;
  accountId: string;
  instagramUserId: string;
  username: string;
  email?: string;
  phone?: string;
  name?: string;
  source: Lead['source'];
  automationId?: string;
  tags?: string[];
  notes?: string;
}): Promise<Lead> {
  // Check if lead already exists for this account
  const existingLeads = await db.collection('leads')
    .where('accountId', '==', data.accountId)
    .where('instagramUserId', '==', data.instagramUserId)
    .limit(1)
    .get();

  if (!existingLeads.empty) {
    // Update existing lead
    const leadDoc = existingLeads.docs[0];
    const existingData = leadDoc.data() as Lead;

    // Build update object, only including defined values
    const updateData: Record<string, any> = {
      updatedAt: admin.firestore.Timestamp.now(),
    };

    // Only update fields that have new values
    if (data.email) updateData.email = data.email;
    else if (existingData.email) updateData.email = existingData.email;

    if (data.phone) updateData.phone = data.phone;
    else if (existingData.phone) updateData.phone = existingData.phone;

    if (data.name) updateData.name = data.name;
    else if (existingData.name) updateData.name = existingData.name;

    if (data.tags) updateData.tags = data.tags;
    else if (existingData.tags) updateData.tags = existingData.tags;

    if (data.notes) updateData.notes = data.notes;
    else if (existingData.notes) updateData.notes = existingData.notes;

    await leadDoc.ref.update(updateData);

    const { id: _, ...existingWithoutId } = existingData;
    return { id: leadDoc.id, ...existingWithoutId, ...updateData } as Lead;
  }

  // Create new lead - filter out undefined values for Firestore
  const leadRef = db.collection('leads').doc();
  const lead: Lead = {
    id: leadRef.id,
    userId: data.userId,
    accountId: data.accountId,
    instagramUserId: data.instagramUserId,
    username: data.username,
    source: data.source,
    createdAt: admin.firestore.Timestamp.now(),
  };

  // Only add optional fields if they have values
  if (data.email) lead.email = data.email;
  if (data.phone) lead.phone = data.phone;
  if (data.name) lead.name = data.name;
  if (data.automationId) lead.automationId = data.automationId;
  if (data.tags) lead.tags = data.tags;
  if (data.notes) lead.notes = data.notes;

  await leadRef.set(lead);

  return lead;
}

/**
 * Get lead by Instagram user ID for a specific account
 */
export async function getLeadByInstagramId(
  accountId: string,
  instagramUserId: string
): Promise<Lead | null> {
  const snapshot = await db.collection('leads')
    .where('accountId', '==', accountId)
    .where('instagramUserId', '==', instagramUserId)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Lead;
}

/**
 * Get all leads for a user with optional filters
 */
export async function getLeads(
  userId: string,
  filters?: {
    accountId?: string;
    source?: Lead['source'];
    hasEmail?: boolean;
    hasPhone?: boolean;
    automationId?: string;
    limit?: number;
    startAfter?: string;
  }
): Promise<{ leads: Lead[]; lastDoc?: string }> {
  let query: FirebaseFirestore.Query = db.collection('leads')
    .where('userId', '==', userId);

  if (filters?.accountId) {
    query = query.where('accountId', '==', filters.accountId);
  }

  if (filters?.source) {
    query = query.where('source', '==', filters.source);
  }

  if (filters?.automationId) {
    query = query.where('automationId', '==', filters.automationId);
  }

  query = query.orderBy('createdAt', 'desc');

  if (filters?.startAfter) {
    const startDoc = await db.collection('leads').doc(filters.startAfter).get();
    if (startDoc.exists) {
      query = query.startAfter(startDoc);
    }
  }

  query = query.limit(filters?.limit || 50);

  const snapshot = await query.get();

  let leads = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  })) as Lead[];

  // Post-filter for email/phone presence (Firestore doesn't support != null efficiently)
  if (filters?.hasEmail) {
    leads = leads.filter(l => !!l.email);
  }
  if (filters?.hasPhone) {
    leads = leads.filter(l => !!l.phone);
  }

  const lastDoc = snapshot.docs.length > 0
    ? snapshot.docs[snapshot.docs.length - 1].id
    : undefined;

  return { leads, lastDoc };
}

/**
 * Export leads to CSV format
 */
export async function exportLeadsToCSV(
  userId: string,
  filters?: {
    accountId?: string;
    source?: Lead['source'];
    startDate?: Date;
    endDate?: Date;
  }
): Promise<string> {
  let query: FirebaseFirestore.Query = db.collection('leads')
    .where('userId', '==', userId);

  if (filters?.accountId) {
    query = query.where('accountId', '==', filters.accountId);
  }

  if (filters?.source) {
    query = query.where('source', '==', filters.source);
  }

  if (filters?.startDate) {
    query = query.where('createdAt', '>=', filters.startDate);
  }

  if (filters?.endDate) {
    query = query.where('createdAt', '<=', filters.endDate);
  }

  query = query.orderBy('createdAt', 'desc');

  const snapshot = await query.get();
  const leads = snapshot.docs.map(doc => doc.data() as Lead);

  // CSV header
  const headers = ['Username', 'Email', 'Phone', 'Name', 'Source', 'Tags', 'Created At'];
  const rows = leads.map(lead => [
    lead.username,
    lead.email || '',
    lead.phone || '',
    lead.name || '',
    lead.source,
    (lead.tags || []).join('; '),
    lead.createdAt.toDate().toISOString(),
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
  ].join('\n');

  return csvContent;
}

/**
 * Get lead statistics for a user
 */
export async function getLeadStats(
  userId: string,
  accountId?: string
): Promise<{
  total: number;
  withEmail: number;
  withPhone: number;
  bySource: Record<string, number>;
  last24Hours: number;
  last7Days: number;
}> {
  let query: FirebaseFirestore.Query = db.collection('leads')
    .where('userId', '==', userId);

  if (accountId) {
    query = query.where('accountId', '==', accountId);
  }

  const allLeads = await query.get();
  const leads = allLeads.docs.map(doc => doc.data() as Lead);

  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

  return {
    total: leads.length,
    withEmail: leads.filter(l => !!l.email).length,
    withPhone: leads.filter(l => !!l.phone).length,
    bySource: leads.reduce((acc, lead) => {
      acc[lead.source] = (acc[lead.source] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
    last24Hours: leads.filter(l => l.createdAt.toMillis() > oneDayAgo).length,
    last7Days: leads.filter(l => l.createdAt.toMillis() > sevenDaysAgo).length,
  };
}

/**
 * Delete a lead
 */
export async function deleteLead(leadId: string, userId: string): Promise<boolean> {
  try {
    // Verify ownership before deleting
    const leadDoc = await db.collection('leads').doc(leadId).get();

    if (!leadDoc.exists) {
      return false;
    }

    const lead = leadDoc.data() as Lead;
    if (lead.userId !== userId) {
      console.error('Lead does not belong to user');
      return false;
    }

    await db.collection('leads').doc(leadId).delete();
    return true;
  } catch (error) {
    console.error('Error deleting lead:', error);
    return false;
  }
}

/**
 * Update lead tags
 */
export async function updateLeadTags(
  leadId: string,
  userId: string,
  tags: string[]
): Promise<boolean> {
  try {
    const leadDoc = await db.collection('leads').doc(leadId).get();

    if (!leadDoc.exists) {
      return false;
    }

    const lead = leadDoc.data() as Lead;
    if (lead.userId !== userId) {
      console.error('Lead does not belong to user');
      return false;
    }

    await leadDoc.ref.update({
      tags,
      updatedAt: admin.firestore.Timestamp.now(),
    });

    return true;
  } catch (error) {
    console.error('Error updating lead tags:', error);
    return false;
  }
}

/**
 * Update lead notes
 */
export async function updateLeadNotes(
  leadId: string,
  userId: string,
  notes: string
): Promise<boolean> {
  try {
    const leadDoc = await db.collection('leads').doc(leadId).get();

    if (!leadDoc.exists) {
      return false;
    }

    const lead = leadDoc.data() as Lead;
    if (lead.userId !== userId) {
      console.error('Lead does not belong to user');
      return false;
    }

    await leadDoc.ref.update({
      notes,
      updatedAt: admin.firestore.Timestamp.now(),
    });

    return true;
  } catch (error) {
    console.error('Error updating lead notes:', error);
    return false;
  }
}

/**
 * Update collected data from conversation to lead
 */
export async function syncLeadFromConversation(conversation: Conversation): Promise<void> {
  if (!conversation.collectedData.email && !conversation.collectedData.phone) {
    return;
  }

  await createOrUpdateLead({
    userId: conversation.userId,
    accountId: conversation.accountId,
    instagramUserId: conversation.instagramUserId,
    username: conversation.username,
    email: conversation.collectedData.email,
    phone: conversation.collectedData.phone,
    name: conversation.collectedData.name,
    source: 'keyword_dm',
    automationId: conversation.currentAutomationId || undefined,
  });
}
