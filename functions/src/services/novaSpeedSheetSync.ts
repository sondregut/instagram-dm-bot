import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { randomUUID } from 'crypto';
import { GoogleAuth } from 'google-auth-library';
import { db } from '../firebase';
import { NOVA_CAMPAIGN, NOVA_IDENTITIES, novaRecordScope } from './novaSpeedRecords';

export const NOVA_SHEET_ID = '135d_fwLhZA42ryvNLw9mVr2vuOqxTKUj9pDV_PNbKmA';
const SHEETS_BASE = `https://sheets.googleapis.com/v4/spreadsheets/${NOVA_SHEET_ID}`;
export const NOVA_HEADERS = {
  Leads: ['Email', 'Instagram handle', 'Source account', 'Campaign', 'Captured time (UTC)', 'Follow-up status', 'Sent date', 'Notes', 'Lead ID', 'Conversation ID'],
  Messages: ['Message ID', 'Lead ID', 'Conversation ID', 'Source account', 'Instagram handle', 'Timestamp (UTC)', 'Direction', 'Message text', 'Notes'],
};
const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
// Existing runtime identity; no service-account key, user refresh token or new grant.
export const novaSheetsTransport = {
  async request(path: string, data?: any): Promise<any> {
    try {
      const client = await auth.getClient();
      const response = await client.request({ url: SHEETS_BASE + path, method: data ? 'POST' : 'GET',
        ...(data ? { data } : {}), timeout: 15000, retry: false });
      return response.data;
    } catch (error: any) {
      // Never log request/response bodies, auth headers, message text or email.
      const status = Number(error?.response?.status);
      throw new Error(`NovaSpeed Sheets request failed (${Number.isInteger(status) ? status : 'transport'})`);
    }
  },
};
const iso = (v: any): string => v?.toDate?.().toISOString?.() || '';
const timestamp = () => admin.firestore.Timestamp.now();

export function novaSheetRow(rows: any[][], idColumn: number, id: string, capacity: number): { row: number; existing: boolean } {
  const matches = rows.map((v, i) => v?.[idColumn] === id ? i + 1 : -1).filter(i => i > 1);
  if (matches.length > 1) throw new Error('NovaSpeed Sheet contains duplicate stable IDs; review required');
  if (matches.length === 1) return { row: matches[0], existing: true };
  // Append below any existing value, including manual notes, never fill an ambiguous hole.
  let last = 1;
  rows.forEach((row, index) => { if (row?.some(v => v !== '' && v !== null && v !== undefined)) last = index + 1; });
  if (last >= capacity) throw new Error('NovaSpeed Sheet capacity reached; pending records retained');
  return { row: last + 1, existing: false };
}
export function novaSheetUpdates(job: any, record: any, rows: any[][], capacity: number): any[] {
  if (job.kind === 'lead') {
    const pos = novaSheetRow(rows, 8, job.recordId, capacity), n = pos.row;
    // F:H are exclusively manual. Even a new row leaves these untouched.
    return [
      { range: `Leads!A${n}:E${n}`, values: [[record.email, record.username || '', record.sourceAccount, NOVA_CAMPAIGN, iso(record.createdAt)]] },
      { range: `Leads!I${n}:J${n}`, values: [[job.recordId, record.conversationId]] },
    ];
  }
  const pos = novaSheetRow(rows, 0, job.recordId, capacity), n = pos.row;
  // I (Notes) is exclusively manual; all text uses RAW input, never formulas.
  return [{ range: `Messages!A${n}:H${n}`, values: [[job.recordId, record.leadId, record.conversationId,
    record.sourceAccount, record.username || '', iso(record.timestamp), record.direction, record.text]] }];
}
export async function runNovaSheetJob(jobId: string): Promise<void> {
  const ref = db.collection('novaspeed_sheet_outbox').doc(jobId);
  const job = (await ref.get()).data();
  if (!job || job.status !== 'pending') return;
  const verify = job.kind === 'verify' && jobId === 'verify-novaspeed-v1';
  const identity = NOVA_IDENTITIES.find(x => x.id === job.accountId && x.userId === job.ownerUserId);
  if (!identity || job.campaignId !== NOVA_CAMPAIGN || !['lead', 'message', 'verify'].includes(job.kind) || (job.kind === 'verify' && !verify)) {
    await ref.update({ status: 'rejected_scope', updatedAt: timestamp() }); return;
  }
  const account = (await db.collection('accounts').doc(identity.id).get()).data();
  if (!novaRecordScope(account)) throw new Error('NovaSpeed Sheet account identity mismatch');
  let record: any = null;
  if (!verify) {
    if (typeof job.recordId !== 'string' || !/^[A-Za-z0-9_-]{1,250}$/.test(job.recordId)) {
      await ref.update({ status: 'rejected_scope', updatedAt: timestamp() }); return;
    }
    record = (await db.collection(job.kind === 'lead' ? 'leads' : 'novaspeed_messages').doc(job.recordId).get()).data();
    const owner = job.kind === 'lead' ? record?.userId : record?.ownerUserId;
    const campaign = job.kind === 'lead' ? record?.automationId : record?.campaignId;
    if (!record || owner !== identity.userId || record.accountId !== identity.id || campaign !== NOVA_CAMPAIGN
      || !record.instagramUserId || record.conversationId !== `${identity.id}_${record.instagramUserId}_${record.sourceCommentId || record.commentId}` || (job.kind === 'lead' && (!record.email || job.recordId !== `novaspeed_${identity.id}_${record.instagramUserId}`))
      || (job.kind === 'message' && (record.id !== job.recordId || !['Incoming', 'Outgoing'].includes(record.direction)
        || !['received', 'accepted'].includes(record.status)))) {
      await ref.update({ status: 'rejected_scope', updatedAt: timestamp() }); return;
    }
    record = { ...record, sourceAccount: identity.username };
  }
  const leaseRef = db.collection('novaspeed_sheet_locks').doc(NOVA_SHEET_ID), leaseId = randomUUID();
  const acquired = await db.runTransaction(async tx => {
    const lease = (await tx.get(leaseRef)).data();
    if (lease?.expiresAt?.toMillis?.() > Date.now()) return false;
    tx.set(leaseRef, { leaseId, expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 300000) }); return true;
  });
  if (!acquired) throw new Error('NovaSpeed Sheet writer busy; event will retry');
  try {
    const metadata = await novaSheetsTransport.request('?fields=spreadsheetId,sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))');
    const tables: Record<string, number> = {};
    for (const [name, id] of [['Leads', 2024332428], ['Messages', 1323160632]] as const) {
      const sheet = metadata?.sheets?.find((s: any) => s.properties?.sheetId === id)?.properties;
      if (sheet?.title !== name || sheet.gridProperties?.columnCount < (name === 'Leads' ? 10 : 9)
        || !Number.isInteger(sheet.gridProperties?.rowCount) || sheet.gridProperties.rowCount > 10000) throw new Error('NovaSpeed Sheet structure changed; review required');
      tables[name] = sheet.gridProperties.rowCount;
    }
    const table = job.kind === 'message' ? 'Messages' : 'Leads';
    const ranges = verify ? ['Leads!A1:J1', 'Messages!A1:I1'] : [`${table}!A1:${table === 'Leads' ? 'J' : 'I'}${tables[table]}`];
    const query = new URLSearchParams({ valueRenderOption: 'UNFORMATTED_VALUE' }); ranges.forEach(r => query.append('ranges', r));
    const read = await novaSheetsTransport.request('/values:batchGet?' + query.toString());
    const values = read.valueRanges || [];
    for (let i = 0; i < ranges.length; i++) {
      const name = ranges[i].split('!')[0] as keyof typeof NOVA_HEADERS;
      if (JSON.stringify(values[i]?.values?.[0]) !== JSON.stringify(NOVA_HEADERS[name])) throw new Error('NovaSpeed Sheet headers changed; review required');
    }
    if (!verify) {
      const data = novaSheetUpdates(job, record, values[0].values, tables[table]);
      const lease = (await leaseRef.get()).data();
      if (lease?.leaseId !== leaseId || lease.expiresAt.toMillis() < Date.now() + 30000) throw new Error('NovaSpeed Sheet lease expired before write');
      // Fixed ranges + stable-ID reread make a repeated/uncertain request idempotent.
      await novaSheetsTransport.request('/values:batchUpdate', { valueInputOption: 'RAW', data, includeValuesInResponse: false });
    }
    await db.runTransaction(async tx => {
      const latest = (await tx.get(ref)).data();
      if (latest?.revision === job.revision) tx.update(ref, { status: verify ? 'verified' : 'synced', syncedAt: timestamp(), updatedAt: timestamp() });
    });
  } finally {
    await db.runTransaction(async tx => {
      const lease = (await tx.get(leaseRef)).data();
      if (lease?.leaseId === leaseId) tx.update(leaseRef, { expiresAt: admin.firestore.Timestamp.fromMillis(0) });
    });
  }
}
// Isolated outbox trigger. Delivery failure cannot replay an Instagram send.
const firestoreWorker = functions.runWith({ timeoutSeconds: 120, memory: '256MB', maxInstances: 2, failurePolicy: true })
  .firestore.document('novaspeed_sheet_outbox/{jobId}').onWrite(async (_change, context) => runNovaSheetJob(context.params.jobId));

// Recent Node runtimes do not always inject the legacy GCLOUD_PROJECT name.
// Resolve the existing runtime project before Firebase v1 parses the event path.
// This is process-local SDK compatibility, not a persistent environment/grant change.
export const novaRuntimeProject = { resolve: () => auth.getProjectId() };
export async function initializeNovaRuntimeProject(): Promise<void> {
  const project = process.env.GCLOUD_PROJECT || await novaRuntimeProject.resolve();
  if (project !== 'instagram-dm-bot-app') throw new Error('NovaSpeed worker is running in an unexpected project');
  process.env.GCLOUD_PROJECT = project;
}
export const syncNovaSpeedSheet = async (data: any, context: any): Promise<any> => {
  await initializeNovaRuntimeProject();
  return firestoreWorker(data, context);
};
// Preserve Firebase deployment discovery when the Firebase CLI supplies the project.
for (const key of ['__trigger', '__endpoint', '__requiredAPIs']) {
  Object.defineProperty(syncNovaSpeedSheet, key, { get: () => (firestoreWorker as any)[key] });
}
