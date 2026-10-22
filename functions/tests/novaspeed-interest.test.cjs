const test=require('node:test'),assert=require('node:assert/strict');
process.env.BOT_MODE='mindset';process.env.MINDSET_AUTOMATION_ENABLED='true';
const {db}=require('../lib/firebase'),mem=require('./memory-firestore.cjs').memoryFirestore();
db.collection=mem.collection;db.runTransaction=mem.runTransaction;
const records=require('../lib/services/novaSpeedRecords'),interest=require('../lib/services/novaSpeedInterest'),p=require('../lib/webhooks/instagram');
const api=require('../lib/services/instagram');let privateSends=0,publicSends=0,dmSends=0;
api.sendInstagramCommentPrivateReplyOnce=async()=>{privateSends++;return true};api.replyToComment=async()=>{publicSends++;return true};api.sendInstagramDMOnce=async()=>{dmSends++;return true};
const accounts=records.NOVA_IDENTITIES.map(a=>({...a,platform:'instagram',isActive:true,connectionStatus:'connected',webhookSubscribed:true,automationMode:'live'}));
const all=c=>[...mem.records.entries()].filter(([k])=>k.startsWith(c+'/')).map(([,v])=>v);
const comment=(r,id,text='Novaspeed')=>({id,from:{id:r,username:'Verified_fixture',name:'Fixture Display Name'},media:{id:'media',permalink:'https://www.instagram.com/reel/TestCode_123/?ignored=1'},text,timestamp:new Date().toISOString()});
test.before(async()=>{for(const a of accounts)await db.collection('accounts').doc(a.id).set(a)});
for(const a of accounts)test(a.username+': interested contact and exact comment stored before email, duplicate/cooldown comments never resend',async()=>{
 const r='interest-'+a.username,e=comment(r,'interest-comment-'+a.username,'🚀 N O V A S P E E E E D!!!');
 const before=privateSends;await p.handleNovaSpeedComment(e,a,Date.now());
 const cid=interest.novaContactId(a.id,r),contact=mem.records.get('novaspeed_contacts/'+cid);
 assert(contact);assert.equal(contact.profileUrl,'https://www.instagram.com/verified_fixture/');assert.equal(contact.displayName,'Fixture Display Name');assert.equal(contact.commentCount,1);assert(!contact.email);
 const saved=mem.records.get('novaspeed_comments/'+interest.novaCommentId(a.id,e.id));assert.equal(saved.text,e.text);assert.equal(saved.postUrl,'https://www.instagram.com/reel/TestCode_123/');assert.equal(saved.timeEvidence,'Instagram webhook timestamp');
 assert.equal(privateSends,before+1);await Promise.all([p.handleNovaSpeedComment(e,a,Date.now()),p.handleNovaSpeedComment(e,a,Date.now())]);assert.equal(privateSends,before+1);assert.equal(mem.records.get('novaspeed_contacts/'+cid).commentCount,1);
 const second=comment(r,e.id+'-second');delete second.timestamp;delete second.from.name;delete second.media.permalink;
 await p.handleNovaSpeedComment(second,a,Date.now());assert.equal(privateSends,before+1);assert.equal(mem.records.get('novaspeed_contacts/'+cid).commentCount,2);
 const saved2=mem.records.get('novaspeed_comments/'+interest.novaCommentId(a.id,second.id));assert.equal(saved2.timeEvidence,'Webhook receipt time; original unavailable');assert.equal(saved2.postUrl,'');
 const inbound={sender:{id:r},recipient:{id:a.instagramAccountId},timestamp:Date.now(),message:{mid:'email-'+r,text:'fixture@example.test'}};
 await p.handleNovaSpeedMessage(inbound,a);assert.equal(mem.records.get('leads/'+cid).email,'fixture@example.test');assert.equal(mem.records.get('novaspeed_sheet_outbox/contact_'+cid).status,'pending');
 const n=privateSends;await p.handleNovaSpeedComment(comment(r,e.id+'-after-email'),a,Date.now());assert.equal(privateSends,n);assert.equal(mem.records.get('novaspeed_contacts/'+cid).commentCount,3);
});
test('negative triggers, self comments, wrong account identity and unrelated long sentences create no interest',async()=>{
 const a=accounts[0],n=all('novaspeed_contacts').length,sends=privateSends;
 for(const e of [comment('x','bad1','speed'),comment('x','bad2','Looking forward to trying NOVASPEED tomorrow'),comment(a.instagramAccountId,'bad3')])await p.handleNovaSpeedComment(e,a,Date.now());
 await p.handleNovaSpeedComment(comment('x','bad4'),{...a,userId:'another-owner'},Date.now());
 assert.equal(all('novaspeed_contacts').length,n);assert.equal(privateSends,sends);
});
test('URLs only derive from valid observed usernames and Instagram permalinks; missing fields stay absent',async()=>{
 assert.equal(interest.novaProfileUrl(''), '');assert.equal(interest.novaProfileUrl('bad/name'), '');assert.equal(interest.novaProfileUrl('=FORMULA'), '');
 for(const url of ['https://evil.test/reel/x/','http://www.instagram.com/reel/x/','https://www.instagram.com.evil.test/reel/x/','https://evil@www.instagram.com/reel/x/'])assert.equal(interest.novaPostUrl(url),'');
 const e=comment('missing-fields','missing-fields');delete e.from.username;delete e.from.name;delete e.media.permalink;
 await p.handleNovaSpeedComment(e,accounts[1],Date.now());const c=mem.records.get('novaspeed_contacts/'+interest.novaContactId(accounts[1].id,e.from.id));assert(!c.username);assert(!c.displayName);assert(!c.profileUrl);
});
test('same platform ID on different source accounts remains separate',()=>{
 assert.notEqual(interest.novaContactId(accounts[0].id,'same'),interest.novaContactId(accounts[1].id,'same'));
 assert.notEqual(interest.novaCommentId(accounts[0].id,'same'),interest.novaCommentId(accounts[1].id,'same'));
});
