const test=require('node:test'), assert=require('node:assert/strict'), {createHmac}=require('node:crypto');
process.env.BOT_MODE='mindset'; process.env.MINDSET_AUTOMATION_ENABLED='true'; process.env.INSTAGRAM_APP_SECRET='offline-fixture';
global.fetch=async()=>{throw new Error('Unexpected network access in offline test')};
const base='../lib', admin=require('../node_modules/firebase-admin'), {db}=require(base+'/firebase');
const mem=require('./memory-firestore.cjs').memoryFirestore(); db.collection=mem.collection;db.runTransaction=mem.runTransaction;
const p=require(base+'/webhooks/instagram');
assert.deepEqual(p.NOVASPEED_IDENTITY,{id:'0HSg4vvkJeiiwgjkxIve',userId:'uqBSZBen8DPLxIkzMFH8tRle62F3',instagramAccountId:'17841480064131939'});
p.NOVASPEED_IDENTITY={id:'synthetic-nova',userId:'synthetic-owner',instagramAccountId:'synthetic-ig-nova'};
const a={...p.NOVASPEED_IDENTITY,username:'novaspeedtiming',platform:'instagram',isActive:true,connectionStatus:'connected',webhookSubscribed:true,automationMode:'live'};
let active=a, sequence=0, outcome=true, onPrivate=null; const sends=[], fallback=[];
const api=require(base+'/services/instagram');
api.sendInstagramCommentPrivateReplyOnce=async(id,text,account,expiry)=>{
 assert.equal(account.id,a.id);assert(expiry>Date.now());sends.push({kind:'private',id,text});if(onPrivate)await onPrivate();
 if(outcome==='throw')throw new Error('Synthetic uncertain result');return outcome;
};
api.replyToComment=async(id,text,account)=>{assert.equal(account.id,a.id);sends.push({kind:'public',id,text});return true};
api.sendInstagramDMOnce=async(id,text,account,expiry)=>{assert.equal(account.id,a.id);assert(expiry>Date.now());sends.push({kind:'dm',id,text});return true};
const accounts=require(base+'/services/accounts');accounts.getAccountByInstagramId=async id=>id===active.instagramAccountId?active:undefined;
accounts.updateAccountWebhookTimestamp=async()=>{};
for(const [file,names] of [
 ['handlers/mindsetHandler',['handleMindsetComment','handleMindsetMessage']],
 ['handlers/messageHandler',['handleMessage']],['handlers/commentHandler',['handleComment']],
 ['handlers/followerGate',['handleFollowerGateMessage']],['handlers/jumpDirectMessage',['handleJumpDirectMessage']],
 ['handlers/linkRecovery',['handleLinkRecovery']],['handlers/storyHandler',['handleStoryMention','handleStoryReply']]
])for(const name of names)require(base+'/'+file)[name]=async()=>{fallback.push(name);throw new Error('Unexpected fallback')};
const {instagramWebhook}=require(base+'/webhooks/instagram');
const stamp=ms=>admin.firestore.Timestamp.fromMillis(ms), key=r=>p.novaKey(a.id,r);
const session=r=>db.collection('novaspeed_sessions').doc(key(r));
const lead=r=>db.collection('leads').doc('novaspeed_'+key(r));
const comment=(r,text='NOVASPEED')=>({id:'comment-'+(++sequence),media:{id:'media-1'},from:{id:r,username:'fixture_'+r},text,timestamp:new Date().toISOString()});
const dm=(r,text)=>({sender:{id:r},recipient:{id:active.instagramAccountId},timestamp:Date.now(),message:{mid:'mid:/'+(++sequence)+'==',text}});
async function post(entry,valid=true){const body={object:'instagram',entry:[{id:active.instagramAccountId,...entry}]},rawBody=Buffer.from(JSON.stringify(body));
 const signature='sha256='+createHmac('sha256',process.env.INSTAGRAM_APP_SECRET).update(rawBody).digest('hex');let status;
 const res={status:s=>{status=s;return res},send:()=>{},sendStatus:s=>{status=s}};
 await instagramWebhook({method:'POST',body,rawBody,get:()=>valid?signature:'bad'},res);return status;}
const sendComment=c=>post({changes:[{field:'comments',value:c}]}),sendDm=e=>post({messaging:[e]});
async function quiet(action){const n=sends.length;await action();assert.equal(sends.length,n);assert.deepEqual(fallback,[])}
test.before(async()=>db.collection('accounts').doc(a.id).set(a));
test.after(()=>{assert.deepEqual(fallback,[]);p.NOVASPEED_IDENTITY=null});
test('case, surrounding punctuation and whitespace accept only the standalone comment',async()=>{
 for(const text of ['NOVASPEED','novaspeed',' NovaSpeed! ','(novaspeed)','“NOVASPEED”','\nNOVASPEED\t','🔥 NOVASPEED','novaspeeeedd','N O V A S P E E D','ＮＯＶＡＳＰＥＥＤ','NOVASPEED\u200b','#novaspeed','@novaspeed']){
  const r='match-'+(++sequence),n=sends.length;await sendComment(comment(r,text));assert.equal(sends.length,n+2);
  assert.deepEqual(sends.slice(-2).map(s=>s.text),[p.NOVASPEED_PRIVATE,p.NOVASPEED_PUBLIC]);}
});
test('sentences, substrings, other brands, URLs and handles cannot start a session',async()=>{
 for(const text of ['I love novaspeed','NOVASPEED please','my novaspeed system is great','novaspeeding','SPEED','MINDSET','novaspeed timing','https://x.test/novaspeed','novasped','novaspeed@example.com'])
  await quiet(()=>sendComment(comment('reject-'+(++sequence),text)));
});
test('direct-message keywords, emails and unrelated inbound text do not create a funnel',async()=>{
 for(const text of ['NOVASPEED','name@example.com','hello'])await quiet(()=>sendDm(dm('unscoped-'+(++sequence),text)));
});
test('private API acceptance precedes the public reply; email collection saves only the requested lead',async()=>{
 const r='happy',c=comment(r);await sendComment(c);const e=dm(r,'Runner+test@EXAMPLE.COM');await sendDm(e);
 const saved=(await lead(r).get()).data();assert.equal(saved.email,'Runner+test@example.com');
 assert.equal(saved.accountId,a.id);assert.equal(saved.userId,a.userId);assert.equal(saved.sourceCommentId,c.id);
 assert.equal(saved.emailVerified,false);assert.equal(saved.marketingSubscribed,false);assert.equal(saved.followUpEmailSent,false);
 assert.equal((await session(r).get()).data().status,'email_collected');assert.equal(sends.at(-1).text,p.NOVASPEED_THANKS);
 await quiet(()=>sendDm(e));await quiet(()=>sendDm(dm(r,'other@example.com')));await quiet(()=>sendComment(comment(r)));
 assert.equal((await lead(r).get()).data().email,'Runner+test@example.com');
});
test('concurrent duplicate comments and distinct comments in cooldown cause one private/public pair',async()=>{
 const c=comment('duplicates'),n=sends.length;await Promise.all([sendComment(c),sendComment(c)]);await sendComment(c);
 await sendComment(comment('duplicates'));assert.equal(sends.length,n+2);
});
test('concurrent email replies create one lead and one acknowledgement',async()=>{
 const r='email-dupe';await sendComment(comment(r));const n=sends.length,e=dm(r,'one@example.com');
 await Promise.all([sendDm(e),sendDm(e),sendDm(dm(r,'two@example.com'))]);assert.equal(sends.length,n+1);assert.equal((await lead(r).get()).data().email,'one@example.com');
});
test('false or uncertain private response never claims a DM publicly and is not replayed',async()=>{
 for(const result of [false,'throw']){const c=comment('uncertain-'+result),n=sends.length;outcome=result;try{await sendComment(c)}finally{outcome=true}
  assert.equal(sends.length,n+1);assert.equal(sends.at(-1).kind,'private');await quiet(()=>sendComment(c));
  await quiet(()=>sendDm(dm(c.from.id,'one@example.com')));assert.equal((await lead(c.from.id).get()).exists,false);}
});
test('format validation sends one bounded reminder, then waits for a valid email',async()=>{
 const r='invalid';await sendComment(comment(r));await sendDm(dm(r,'my email is name@example.com'));
 assert.equal(sends.at(-1).text,p.NOVASPEED_INVALID);await quiet(()=>sendDm(dm(r,'not-email')));
 assert.equal((await lead(r).get()).exists,false);await sendDm(dm(r,'name@example.com'));assert.equal(sends.at(-1).text,p.NOVASPEED_THANKS);
});
test('email syntax rejects multiple addresses, header injection, overlong parts and malformed domains',()=>{
 for(const text of ['a@b.com c@d.com','a@b.com\nBcc: c@d.com','x'.repeat(65)+'@example.com','a..b@example.com','.a@example.com','a@-example.com','a@example..com','a@localhost','<a@example.com>','email: a@example.com'])assert.equal(p.novaEmail(text),null,text);
 for(const text of ['a@example.com','a+b@example.co.uk','first.last@example.org'])assert.equal(p.novaEmail(text),text);
});
test('stop, no thanks and human requests silently pause future collection and comments',async()=>{
 for(const text of ['STOP','No thanks','please stop messaging me','Can I speak to a real person?']){
  const r='stop-'+(++sequence);await sendComment(comment(r));await quiet(()=>sendDm(dm(r,text)));
  assert.equal((await session(r).get()).data().paused,true);await quiet(()=>sendDm(dm(r,'one@example.com')));await quiet(()=>sendComment(comment(r)));
 }
});
test('a stop before any campaign prevents later comment entry',async()=>{
 await quiet(()=>sendDm(dm('early-stop','STOP')));await quiet(()=>sendComment(comment('early-stop')));
});
for(const [name,delta] of Object.entries({wrongOwner:{userId:'wrong'},wrongId:{id:'wrong'},wrongMeta:{instagramAccountId:'wrong'},wrongHandle:{username:'anotherbrand'},facebook:{platform:'facebook'},inactive:{isActive:false},disconnected:{connectionStatus:'expired'},noSubscription:{webhookSubscribed:false},testMode:{automationMode:'test'},paused:{automationMode:'paused'}})){
 test('fresh account guard '+name,async()=>{await db.collection('accounts').doc(a.id).set({...a,...delta});try{await quiet(()=>sendComment(comment('guard-'+name)))}finally{await db.collection('accounts').doc(a.id).set(a)}});
}
test('null identity and global kill switches remain disabled',async()=>{
 const id=p.NOVASPEED_IDENTITY;p.NOVASPEED_IDENTITY=null;await quiet(()=>sendComment(comment('null')));p.NOVASPEED_IDENTITY=id;
 for(const mode of ['disabled','test']){process.env.BOT_MODE=mode;await quiet(()=>sendComment(comment('mode-'+mode)))}process.env.BOT_MODE='mindset';
 process.env.MINDSET_AUTOMATION_ENABLED='false';await quiet(()=>sendComment(comment('kill')));process.env.MINDSET_AUTOMATION_ENABLED='true';
});
test('existing manual, opt-out and paused lead protections remain effective',async()=>{
 for(const [name,state] of Object.entries({manual:{humanHandoff:true,handoffHadLead:false},optout:{optedOut:true}})){
  await db.collection('follower_gate_recipients').doc(key(name)).set(state);await quiet(()=>sendComment(comment(name)));}
 await db.collection('mindset_leads').doc(key('paused-lead')).set({automationPaused:true});await quiet(()=>sendComment(comment('paused-lead')));
});
test('a pause during private send prevents public reply and email continuation',async()=>{
 const r='race-pause',n=sends.length;onPrivate=async()=>session(r).update({paused:true});try{await sendComment(comment(r))}finally{onPrivate=null}
 assert.equal(sends.length,n+1);await quiet(()=>sendDm(dm(r,'one@example.com')));
});
test('stale comments, expired sessions and stale inbound windows remain silent',async()=>{
 await quiet(()=>sendComment({...comment('old-comment'),timestamp:new Date(Date.now()-8*86400000).toISOString()}));
 const r='expired';await sendComment(comment(r));await session(r).update({expiresAt:stamp(Date.now()-1)});await quiet(()=>sendDm(dm(r,'one@example.com')));
 const r2='old-inbound';await sendComment(comment(r2));await quiet(()=>sendDm({...dm(r2,'one@example.com'),timestamp:Date.now()-25*3600000}));
});
test('invalid signatures, own comments, stories, cross-account and malformed events cannot send',async()=>{
 assert.equal(await post({changes:[{field:'comments',value:comment('bad-sig')}]},false),401);
 for(const c of [null,{},comment(a.instagramAccountId),{...comment('bad-id'),id:'bad/id'},{...comment('bad-type'),text:{}}])await quiet(()=>sendComment(c));
 const r='cross';await sendComment(comment(r));
 await quiet(()=>sendDm({...dm(r,'one@example.com'),recipient:{id:'other-account'}}));
 const e=dm(r,'one@example.com');e.message.reply_to={story:{id:'x'}};await quiet(()=>sendDm(e));
 await session(r).update({ownerUserId:'wrong-owner'});await quiet(()=>sendDm(dm(r,'one@example.com')));
});
