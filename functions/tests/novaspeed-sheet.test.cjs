const test=require('node:test'),assert=require('node:assert/strict');
const admin=require('firebase-admin'),{db}=require('../lib/firebase');
const mem=require('./memory-firestore.cjs').memoryFirestore();db.collection=mem.collection;db.runTransaction=mem.runTransaction;
const mod=require('../lib/services/novaSpeedSheetSync'),r=require('../lib/services/novaSpeedRecords');
const a=r.NOVA_IDENTITIES[0],rows={Leads:[mod.NOVA_HEADERS.Leads],Messages:[mod.NOVA_HEADERS.Messages]};let writes=0,uncertain=false;
mod.novaSheetsTransport.request=async(path,data)=>{
 if(path.startsWith('?fields='))return{sheets:[{properties:{sheetId:2024332428,title:'Leads',gridProperties:{rowCount:1000,columnCount:26}}},{properties:{sheetId:1323160632,title:'Messages',gridProperties:{rowCount:1000,columnCount:26}}}]};
 if(path.startsWith('/values:batchGet')){const ranges=new URLSearchParams(path.split('?')[1]).getAll('ranges');return{valueRanges:ranges.map(range=>({values:rows[range.split('!')[0]].map(x=>[...x])}))}};
 assert.equal(path,'/values:batchUpdate');assert.equal(data.valueInputOption,'RAW');writes++;
 for(const update of data.data){const m=update.range.match(/^(Leads|Messages)!([A-Z])(\d+):([A-Z])(\d+)$/);assert(m);const[,table,col,n]=m;const i=Number(n)-1;rows[table][i]||=[];for(const[v,x]of update.values[0].entries())rows[table][i][col.charCodeAt(0)-65+v]=x;}
 if(uncertain){uncertain=false;throw Error('Synthetic response lost after server applied write')}
 return{};
};
const jobId='lead_novaspeed_'+a.id+'_fixture',leadId='novaspeed_'+a.id+'_fixture';
const job={kind:'lead',recordId:leadId,accountId:a.id,ownerUserId:a.userId,campaignId:r.NOVA_CAMPAIGN,revision:1,status:'pending'};
const lead={id:leadId,userId:a.userId,accountId:a.id,instagramUserId:'fixture',username:'fixture',sourceCommentId:'comment',conversationId:a.id+'_fixture_comment',email:'fixture@example.test',automationId:r.NOVA_CAMPAIGN,createdAt:admin.firestore.Timestamp.fromMillis(1000)};
test.before(async()=>{await db.collection('accounts').doc(a.id).set(a);await db.collection('leads').doc(leadId).set(lead)});
test('uncertain response retries by stable ID without duplicates; manual columns stay intact',async()=>{
 await db.collection('novaspeed_sheet_outbox').doc(jobId).set(job);uncertain=true;
 await assert.rejects(()=>mod.runNovaSheetJob(jobId));assert.equal(rows.Leads.length,2);rows.Leads[1][5]='Contacted';rows.Leads[1][6]='2026-10-22';rows.Leads[1][7]='Manual notes';
 await mod.runNovaSheetJob(jobId);assert.equal(rows.Leads.length,2);assert.deepEqual(rows.Leads[1].slice(5,8),['Contacted','2026-10-22','Manual notes']);assert.equal(mem.records.get('novaspeed_sheet_outbox/'+jobId).status,'synced');
 const n=writes;await mod.runNovaSheetJob(jobId);assert.equal(writes,n);
});
test('messages preserve literal text and manual notes; duplicate events do not append',async()=>{
 const id=a.id+'_synthetic-message',j={...job,kind:'message',recordId:id};
 await db.collection('novaspeed_messages').doc(id).set({id,ownerUserId:a.userId,accountId:a.id,campaignId:r.NOVA_CAMPAIGN,instagramUserId:'fixture',commentId:'comment',conversationId:lead.conversationId,leadId,username:'fixture',timestamp:admin.firestore.Timestamp.fromMillis(2000),direction:'Incoming',text:'=HYPERLINK("https://example.test")',status:'received'});
 await db.collection('novaspeed_sheet_outbox').doc('message_'+id).set(j);await mod.runNovaSheetJob('message_'+id);rows.Messages[1][8]='Manual follow-up note';
 await db.collection('novaspeed_sheet_outbox').doc('message_'+id).update({status:'pending'});await mod.runNovaSheetJob('message_'+id);
 assert.equal(rows.Messages.length,2);assert.equal(rows.Messages[1][7],'=HYPERLINK("https://example.test")');assert.equal(rows.Messages[1][8],'Manual follow-up note');
});
test('other campaign, owner, account and mismatched conversation are rejected without Sheet writes',async()=>{
 for(const [name,delta]of Object.entries({owner:{ownerUserId:'other'},campaign:{campaignId:'mindset'},account:{accountId:'trackspeed'},record:{recordId:'other'}})){
  const n=writes;await db.collection('novaspeed_sheet_outbox').doc(name).set({...job,...delta});await mod.runNovaSheetJob(name);assert.equal(writes,n);assert.equal(mem.records.get('novaspeed_sheet_outbox/'+name).status,'rejected_scope');
 }
 await db.collection('leads').doc(leadId).update({conversationId:'other-person'});await db.collection('novaspeed_sheet_outbox').doc('wrong-conversation').set(job);const n=writes;await mod.runNovaSheetJob('wrong-conversation');assert.equal(writes,n);await db.collection('leads').doc(leadId).set(lead);
});
test('verification job reads structure without inventing Sheet records',async()=>{
 const n=writes;await db.collection('novaspeed_sheet_outbox').doc('verify-novaspeed-v1').set({...job,kind:'verify'});await mod.runNovaSheetJob('verify-novaspeed-v1');assert.equal(writes,n);assert.equal(mem.records.get('novaspeed_sheet_outbox/verify-novaspeed-v1').status,'verified');
});
test('duplicate IDs, capacity and active lease fail safely with work retained',async()=>{
 assert.throws(()=>mod.novaSheetRow([['id'],['x'],['x']],0,'x',10),/duplicate/);
 assert.throws(()=>mod.novaSheetRow([['id'],['x']],0,'new',2),/capacity/);
 await db.collection('novaspeed_sheet_locks').doc(mod.NOVA_SHEET_ID).set({leaseId:'another-worker',expiresAt:admin.firestore.Timestamp.fromMillis(Date.now()+60000)});
 await db.collection('novaspeed_sheet_outbox').doc('busy').set(job);const n=writes;await assert.rejects(()=>mod.runNovaSheetJob('busy'),/busy/);assert.equal(writes,n);assert.equal(mem.records.get('novaspeed_sheet_outbox/busy').status,'pending');
});
test('runtime project adapter resolves existing identity before the legacy Firebase event wrapper',async()=>{
 const saved=process.env.GCLOUD_PROJECT;delete process.env.GCLOUD_PROJECT;let resolved=0;
 mod.novaRuntimeProject.resolve=async()=>{resolved++;return 'instagram-dm-bot-app'};
 await mod.initializeNovaRuntimeProject();assert.equal(process.env.GCLOUD_PROJECT,'instagram-dm-bot-app');assert.equal(resolved,1);
 await mod.initializeNovaRuntimeProject();assert.equal(resolved,1);
 process.env.GCLOUD_PROJECT='wrong-project';await assert.rejects(()=>mod.initializeNovaRuntimeProject(),/unexpected project/);
 if(saved===undefined)delete process.env.GCLOUD_PROJECT;else process.env.GCLOUD_PROJECT=saved;
});
test('actual exported Firestore wrapper accepts a provider event without legacy project environment',async()=>{
 const saved=process.env.GCLOUD_PROJECT;delete process.env.GCLOUD_PROJECT;mod.novaRuntimeProject.resolve=async()=> 'instagram-dm-bot-app';
 const name='projects/instagram-dm-bot-app/databases/(default)/documents/novaspeed_sheet_outbox/previously-completed';
 await db.collection('novaspeed_sheet_outbox').doc('previously-completed').set({...job,status:'synced'});
 const n=writes;
 await mod.syncNovaSpeedSheet({oldValue:{},value:{name,fields:{status:{stringValue:'synced'}},createTime:'2026-10-22T00:00:00Z',updateTime:'2026-10-22T00:00:00Z'}},
  {eventId:'synthetic-firestore-event',eventType:'providers/cloud.firestore/eventTypes/document.write',timestamp:'2026-10-22T00:00:00Z',resource:{name}});
 assert.equal(writes,n);assert.equal(process.env.GCLOUD_PROJECT,'instagram-dm-bot-app');
 if(saved===undefined)delete process.env.GCLOUD_PROJECT;else process.env.GCLOUD_PROJECT=saved;
});
