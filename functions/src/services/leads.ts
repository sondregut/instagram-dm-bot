import { db, Lead, Conversation } from '../firebase';
import * as admin from 'firebase-admin';

/**
 * Create or update a lead
 */
export async function createOrUpdateLead(data: {
  instagramUserId: string;
  username: string;
  email?: string;
  phone?: string;
  name?: string;
  source: Lead['source'];
  automationId?: string;
}): Promise<Lead> {
  // Check if lead already exists
  const existingLeads = await db.collection('leads')
    .where('instagramUserId', '==', data.instagramUserId)
    .limit(1)
    .get();

  if (!existingLeads.empty) {
    // Update existing lead
    const leadDoc = existingLeads.docs[0];
    const existingData = leadDoc.data() as Lead;

    const updateData: Partial<Lead> = {
      ...data,
      // Don't overwrite existing data with undefined
      email: data.email || existingData.email,
      phone: data.phone || existingData.phone,
      name: data.name || existingData.name,
    };

    await leadDoc.ref.update(updateData);

    const { id: _, ...existingWithoutId } = existingData;
    return { id: leadDoc.id, ...existingWithoutId, ...updateData } as Lead;
  }

  // Create new lead
  const leadRef = db.collection('leads').doc();
  const lead: Lead = {
    id: leadRef.id,
    instagramUserId: data.instagramUserId,
    username: data.username,
    email: data.email,
    phone: data.phone,
    name: data.name,
    source: data.source,
    automationId: data.automationId,
    createdAt: admin.firestore.Timestamp.now(),
  };

  await leadRef.set(lead);

  return lead;
}

/**
 * Get lead by Instagram user ID
 */
export async function getLeadByInstagramId(instagramUserId: string): Promise<Lead | null> {
  const snapshot = await db.collection('leads')
    .where('instagramUserId', '==', instagramUserId)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Lead;
}

/**
 * Get all leads with optional filters
 */
export async function getLeads(filters?: {
  source?: Lead['source'];
  hasEmail?: boolean;
  hasPhone?: boolean;
  automationId?: string;
  limit?: number;
  startAfter?: string;
}): Promise<{ leads: Lead[]; lastDoc?: string }> {
  let query: FirebaseFirestore.Query = db.collection('leads');

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
export async function exportLeadsToCSV(filters?: {
  source?: Lead['source'];
  startDate?: Date;
  endDate?: Date;
}): Promise<string> {
  let query: FirebaseFirestore.Query = db.collection('leads');

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
  const headers = ['Username', 'Email', 'Phone', 'Name', 'Source', 'Created At'];
  const rows = leads.map(lead => [
    lead.username,
    lead.email || '',
    lead.phone || '',
    lead.name || '',
    lead.source,
    lead.createdAt.toDate().toISOString(),
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
  ].join('\n');

  return csvContent;
}

/**
 * Get lead statistics
 */
export async function getLeadStats(): Promise<{
  total: number;
  withEmail: number;
  withPhone: number;
  bySource: Record<string, number>;
  last24Hours: number;
  last7Days: number;
}> {
  const allLeads = await db.collection('leads').get();
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
export async function deleteLead(leadId: string): Promise<boolean> {
  try {
    await db.collection('leads').doc(leadId).delete();
    return true;
  } catch (error) {
    console.error('Error deleting lead:', error);
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
    instagramUserId: conversation.instagramUserId,
    username: conversation.username,
    email: conversation.collectedData.email,
    phone: conversation.collectedData.phone,
    name: conversation.collectedData.name,
    source: 'keyword_dm', // Default, could be improved
    automationId: conversation.currentAutomationId || undefined,
  });
}
