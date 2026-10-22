const test=require('node:test'),assert=require('node:assert/strict'),{createHmac}=require('node:crypto');
process.env.BOT_MODE='mindset';process.env.MINDSET_AUTOMATION_ENABLED='true';process.env.INSTAGRAM_APP_SECRET='offline-only-fixture';
global.fetch=async()=>{throw Error('No network in shared-campaign tests')};
const base='../lib',admin=require('../node_modules/firebase-admin'),{db}=require(base+'/firebase');
const mem=require('./memory-firestore.cjs').memoryFirestore();db.collection=mem.collection;db.runTransaction=mem.runTransaction;
const p=require(base+'/webhooks/instagram');
const shared={...p.SONDRE_NOVASPEED_IDENTITY,username:'sondre_pv',isActive:true,connectionStatus:'connected',webhookSubscribed:true};
p.NOVASPEED_IDENTITY={id:'fixture-nova-account',userId:shared.userId,instagramAccountId:'fixture-nova-ig'};
const nova={...p.NOVASPEED_IDENTITY,username:'novaspeedtiming',platform:'instagram',isActive:true,connectionStatus:'connected',webhookSubscribed:true,automationMode:'live'};
const unrelated={id:'fixture-other-account',userId:shared.userId,instagramAccountId:'fixture-other-ig',username:'trackjumpapp',isActive:true,connectionStatus:'connected',webhookSubscribed:true};
const accounts=[shared,nova,unrelated],sends=[],routes=[];let seq=0,onPrivate=null;
const api=require(base+'/services/instagram');
api.sendInstagramCommentPrivateReplyOnce=async(id,text,a)=>{sends.push({kind:'private',id,text,accountId:a.id});if(onPrivate)await onPrivate();return true};
api.replyToComment=async(id,text,a)=>{sends.push({kind:'public',id,text,accountId:a.id});return true};
api.sendInstagramDMOnce=async(id,text,a)=>{sends.push({kind:'dm',id,text,accountId:a.id});return true};
const ac=require(base+'/services/accounts');ac.getAccountByInstagramId=async id=>accounts.find(a=>a.instagramAccountId===id);ac.updateAccountWebhookTimestamp=async()=>{};
for(const [file,names] of [['handlers/messageHandler',['handleMessage']],['handlers/commentHandler',['handleComment']],['handlers/followerGate',['handleFollowerGateMessage']],['handlers/jumpDirectMessage',['handleJumpDirectMessage']],['handlers/linkRecovery',['handleLinkRecovery']],['handlers/storyHandler',['handleStoryMention','handleStoryReply']]])for(const name of names)require(base+'/'+file)[name]=async(e,a)=>{routes.push({name,accountId:a.id,text:e.message?.text||e.text});return false};
const mindset=require(base+'/handlers/mindsetHandler');
mindset.handleMindsetComment=async(e,a)=>{routes.push({name:'handleMindsetComment',accountId:a.id,text:e.text});return /mindset/i.test(e.text)};
mindset.handleMindsetMessage=async(e,a)=>{routes.push({name:'handleMindsetMessage',accountId:a.id,text:e.message?.text});return true};
const {instagramWebhook}=require(base+'/webhooks/instagram');
const stamp=ms=>admin.firestore.Timestamp.fromMillis(ms),key=(a,r)=>p.novaKey(a.id,r);
const session=(a,r)=>db.collection('novaspeed_sessions').doc(key(a,r));
const lead=(a,r)=>db.collection('leads').doc('novaspeed_'+key(a,r));
const mindsetLead=(a,r)=>db.collection('mindset_leads').doc(key(a,r));
const comment=(r,text='NOVASPEED')=>({id:'shared-comment-'+(++seq),media:{id:'media-shared'},from:{id:r,username:'fixture-person'},text,timestamp:new Date().toISOString()});
const dm=(a,r,text)=>({sender:{id:r},recipient:{id:a.instagramAccountId},timestamp:Date.now(),message:{mid:'shared-mid-'+(++seq),text}});
async function post(a,entry){const body={object:'instagram',entry:[{id:a.instagramAccountId,...entry}]},rawBody=Buffer.from(JSON.stringify(body)),signature='sha256='+createHmac('sha256',process.env.INSTAGRAM_APP_SECRET).update(rawBody).digest('hex');let status;const res={status:s=>{status=s;return res},send:()=>{},sendStatus:s=>{status=s}};await instagramWebhook({method:'POST',body,rawBody,get:()=>signature},res);assert.equal(status,200)}
const sendComment=(a,c)=>post(a,{changes:[{field:'comments',value:c}]}),sendDm=(a,e)=>post(a,{messaging:[e]});
test.before(async()=>{for(const a of accounts)await db.collection('accounts').doc(a.id).set(a)});
test('only verified personal identity is enabled; it never takes exclusive-brand routing',()=>{
 assert(p.isNovaSpeedEnabled(shared));assert.equal(p.isNovaSpeedScope(shared),false);
 for(const delta of [{userId:'wrong'},{id:'wrong'},{instagramAccountId:'wrong'},{username:'sondre'},{automationMode:'paused'},{automationMode:'test'},{webhookSubscribed:false},{connectionStatus:'expired'},{platform:'facebook'}])assert.equal(p.isNovaSpeedEnabled({...shared,...delta}),false);
 assert.equal(p.isNovaSpeedEnabled(unrelated),false);
});
test('Sondre standalone NOVASPEED sends exact private/public copy once and captures scoped email',async()=>{
 const r='shared-happy',c=comment(r,' NovaSpeed! '),before=routes.length,n=sends.length;
 await sendComment(shared,c);await sendComment(shared,c);assert.equal(routes.length,before);assert.equal(sends.length,n+2);
 assert.deepEqual(sends.slice(n).map(s=>s.text),[p.NOVASPEED_PRIVATE,p.NOVASPEED_PUBLIC]);
 await sendDm(shared,dm(shared,r,'athlete@example.com'));assert.equal(routes.length,before);
 const saved=(await lead(shared,r).get()).data();assert.equal(saved.email,'athlete@example.com');assert.equal(saved.accountId,shared.id);assert.equal(saved.followUpEmailSent,false);assert.equal(saved.marketingSubscribed,false);
 const count=sends.length;await sendDm(shared,dm(shared,r,'changed@example.com'));assert.equal(sends.length,count);assert.equal(routes.length,before);
});
test('MINDSET comments and unscoped DMs retain original handler path',async()=>{
 const n=sends.length,start=routes.length;await sendComment(shared,comment('mindset-user','Mindset'));
 await sendDm(shared,dm(shared,'mindset-user','LINK'));
 assert.equal(sends.length,n);assert(routes.slice(start).some(x=>x.name==='handleMindsetComment'&&x.text==='Mindset'));
 assert(routes.slice(start).some(x=>x.name==='handleMindsetMessage'&&x.text==='LINK'));
});
test('long NOVASPEED sentences do not enter new campaign, and other accounts remain unchanged',async()=>{
 const n=sends.length;await sendComment(shared,comment('sentence','I am interested in novaspeed timing'));
 await sendComment(unrelated,comment('other','NOVASPEED'));assert.equal(sends.length,n);
 assert.equal((await session(shared,'sentence').get()).exists,false);assert.equal((await session(unrelated,'other').get()).exists,false);
});
test('own personal-account comment never produces a reply',async()=>{
 const n=sends.length;await sendComment(shared,{...comment(shared.instagramAccountId),from:{id:shared.instagramAccountId,username:'sondre_pv'}});assert.equal(sends.length,n);
});
test('same participant and comment ids stay isolated across the two accounts',async()=>{
 const r='same-participant',c=comment(r);await sendComment(shared,c);await sendComment(nova,c);
 await sendDm(shared,dm(shared,r,'personal@example.com'));await sendDm(nova,dm(nova,r,'nova@example.com'));
 assert.equal((await lead(shared,r).get()).data().email,'personal@example.com');assert.equal((await lead(nova,r).get()).data().email,'nova@example.com');
 assert.equal((await session(shared,r).get()).data().accountId,shared.id);assert.equal((await session(nova,r).get()).data().accountId,nova.id);
});
test('new MINDSET campaign yields NovaSpeed conversation without changing MINDSET data',async()=>{
 const r='new-mindset';await mindsetLead(shared,r).set({campaignSessionId:'old-mindset',stage:'awaiting_link_request'});await sendComment(shared,comment(r));
 const original={campaignSessionId:'new-mindset',stage:'awaiting_link_request',sentinel:'preserved'};await mindsetLead(shared,r).set(original);
 const n=sends.length,start=routes.length;await sendDm(shared,dm(shared,r,'yes'));assert.equal(sends.length,n);
 assert(routes.slice(start).some(x=>x.name==='handleMindsetMessage'));assert.deepEqual((await mindsetLead(shared,r).get()).data(),original);
 assert.equal((await session(shared,r).get()).data().status,'superseded');
});
for(const text of ['MINDSET','LINK','VAULT'])test(`explicit ${text} returns to original handlers`,async()=>{
 const r='control-'+text;await sendComment(shared,comment(r));const n=sends.length,start=routes.length;
 await sendDm(shared,dm(shared,r,text));assert.equal(sends.length,n);assert(routes.slice(start).some(x=>x.name==='handleMindsetMessage'));
 assert.equal((await session(shared,r).get()).data().status,'superseded');
});
test('MINDSET quick reply keeps its original handler and payload',async()=>{
 const r='quick-reply';await sendComment(shared,comment(r));const e=dm(shared,r,'Following');e.message.quick_reply={payload:'mindset:send_link:fixture'};
 const n=sends.length,start=routes.length;await sendDm(shared,e);assert.equal(sends.length,n);assert(routes.slice(start).some(x=>x.name==='handleMindsetMessage'));
});
test('newer MINDSET activity or follow-up prevents interpreting its reply as a NovaSpeed email',async()=>{
 for(const field of ['lastUserInteractionAt','lastAutomatedFollowUpAt']){
  const r='newer-'+field;await sendComment(shared,comment(r));const reserved=(await session(shared,r).get()).data().reservedAt.toMillis();
  await mindsetLead(shared,r).set({[field]:stamp(reserved+1000)});const n=sends.length,start=routes.length;
  await sendDm(shared,dm(shared,r,'name@example.com'));assert.equal(sends.length,n);assert.equal((await lead(shared,r).get()).exists,false);
  assert(routes.slice(start).some(x=>x.name==='handleMindsetMessage'));
 }
});
test('shared STOP pauses NovaSpeed and still reaches existing opt-out handlers',async()=>{
 const r='shared-stop';await sendComment(shared,comment(r));const start=routes.length,n=sends.length;await sendDm(shared,dm(shared,r,'STOP'));
 assert.equal(sends.length,n);assert.equal((await session(shared,r).get()).data().paused,true);assert(routes.slice(start).some(x=>x.name==='handleMindsetMessage'));
 await sendComment(shared,comment(r));assert.equal(sends.length,n);
});
test('existing paused MINDSET conversation blocks NovaSpeed without modifying it',async()=>{
 const r='paused-existing',value={automationPaused:true,stage:'human_handoff',sentinel:'unchanged'};await mindsetLead(shared,r).set(value);
 const n=sends.length;await sendComment(shared,comment(r));assert.equal(sends.length,n);assert.deepEqual((await mindsetLead(shared,r).get()).data(),value);
});
test('invalid email gets only one bounded reminder; later email is collected',async()=>{
 const r='shared-invalid';await sendComment(shared,comment(r));const n=sends.length,start=routes.length;
 await sendDm(shared,dm(shared,r,'my email is a@example.com'));await sendDm(shared,dm(shared,r,'bad address'));
 assert.equal(sends.length,n+1);assert.equal(sends.at(-1).text,p.NOVASPEED_INVALID);assert.equal(routes.length,start);
 await sendDm(shared,dm(shared,r,'a@example.com'));assert.equal((await lead(shared,r).get()).data().email,'a@example.com');
});
test('MINDSET campaign switch during private API acceptance blocks NovaSpeed continuation',async()=>{
 const r='race-mindset',n=sends.length;onPrivate=()=>mindsetLead(shared,r).set({campaignSessionId:'new-mindset-after-send'});
 try{await sendComment(shared,comment(r))}finally{onPrivate=null}
 assert.equal(sends.length,n+1);assert.equal(sends.at(-1).kind,'private');
 await sendDm(shared,dm(shared,r,'name@example.com'));assert.equal((await lead(shared,r).get()).exists,false);
});
