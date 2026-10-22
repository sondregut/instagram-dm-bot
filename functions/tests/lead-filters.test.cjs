const test=require('node:test'),assert=require('node:assert/strict');
const admin=require('../node_modules/firebase-admin');
const {db}=require('../lib/firebase');
const mem=require('./memory-firestore.cjs').memoryFirestore();db.collection=mem.collection;db.runTransaction=mem.runTransaction;
const service=require('../lib/services/leads');
const api=require('../lib/index');
const ctx={auth:{uid:'owner-a'}};
test.before(async()=>{
 const fixture=(id,delta={})=>({id,userId:'owner-a',accountId:'personal',instagramUserId:id,username:id,email:id+'@example.test',source:'comment',automationId:'novaspeed-comment-email',createdAt:admin.firestore.Timestamp.fromMillis(1000),...delta});
 for(const [id,delta] of [['nova-personal',{}],['nova-brand',{accountId:'brand'}],['mindset',{source:'comment_to_dm',automationId:'mindset'}],['no-email',{email:''}],['other-source',{source:'keyword_dm'}],['other-owner',{userId:'owner-b'}],['csv-note',{notes:'=HYPERLINK("https://example.test")'}]])await db.collection('leads').doc(id).set(fixture(id,delta));
});
test('comment filter includes both stored comment sources, but not unrelated sources',async()=>{
 const result=await service.getLeads('owner-a',{accountId:'personal',source:'comment_to_dm'});
 assert.deepEqual(result.leads.map(x=>x.id),['nova-personal','mindset','no-email','csv-note']);
});
test('NovaSpeed campaign filter preserves owner and selected-account isolation',async()=>{
 const result=await service.getLeads('owner-a',{accountId:'personal',automationId:'novaspeed-comment-email',source:'comment_to_dm',hasEmail:true});
 assert.deepEqual(result.leads.map(x=>x.id),['nova-personal','csv-note']);
 const brand=await service.getLeads('owner-a',{accountId:'brand',automationId:'novaspeed-comment-email'});
 assert.deepEqual(brand.leads.map(x=>x.id),['nova-brand']);
 assert.equal((await service.getLeads('owner-b',{accountId:'brand',automationId:'novaspeed-comment-email'})).leads.length,0);
});
test('CSV honors campaign/source/email filters and keeps account, campaign, lead IDs and notes',async()=>{
 const csv=await service.exportLeadsToCSV('owner-a',{accountId:'personal',source:'comment_to_dm',automationId:'novaspeed-comment-email',hasEmail:true});
 assert.match(csv,/Account ID,Campaign,Lead ID,Notes/);assert.match(csv,/nova-personal@example.test/);
 assert.doesNotMatch(csv,/nova-brand|mindset|no-email|other-source|other-owner/);
 assert.match(csv,/"personal","novaspeed-comment-email","nova-personal"/);
 assert.match(csv,/"'=HYPERLINK\(""https:\/\/example.test""\)"/);
 assert.equal(mem.records.get('leads/csv-note').notes,'=HYPERLINK("https://example.test")');
});
test('actual callable forwards campaign filters and trusts authenticated owner only',async()=>{
 const result=await api.getLeadsApi.run({accountId:'personal',source:'comment_to_dm',automationId:'novaspeed-comment-email',hasEmail:true,userId:'owner-b'},ctx);
 assert.deepEqual(result.leads.map(x=>x.id),['nova-personal','csv-note']);
 const {csv}=await api.exportLeads.run({accountId:'brand',automationId:'novaspeed-comment-email',hasEmail:true,userId:'owner-b'},ctx);
 assert.match(csv,/nova-brand@example.test/);assert.doesNotMatch(csv,/other-owner/);
});
test('list and export remain unavailable without dashboard authentication',async()=>{
 for(const fn of [api.getLeadsApi,api.exportLeads])await assert.rejects(()=>fn.run({accountId:'personal'},{}),e=>e.code==='unauthenticated');
});
