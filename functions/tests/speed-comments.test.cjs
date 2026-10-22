const test = require('node:test'), assert = require('node:assert/strict');
const {createHmac} = require('node:crypto');
const base = '../lib';
process.env.BOT_MODE='mindset'; process.env.MINDSET_AUTOMATION_ENABLED='true';
process.env.MINDSET_TARGET_ACCOUNT_USERNAMES='sondre_pv,athletemindsetapp,trackspeedapp,trackspeed_app';
process.env.MINDSET_TRIGGER_KEYWORD='MINDSET'; process.env.INSTAGRAM_APP_SECRET='offline-only-secret';
const admin=require('../node_modules/firebase-admin');
const {db}=require(base+'/firebase'); const mem=require('./memory-firestore.cjs').memoryFirestore();
db.collection=mem.collection; db.runTransaction=mem.runTransaction;
const scoped=require(base+'/services/trackSpeedOnlyPolicy');
scoped.TRACKSPEED_ONLY_IDENTITY={id:'synthetic-speed-account',userId:'synthetic-owner',instagramAccountId:'synthetic-speed-instagram'};
const a={...scoped.TRACKSPEED_ONLY_IDENTITY,username:'trackspeed_app',platform:'instagram',isActive:true,
  connectionStatus:'connected',webhookSubscribed:true,automationMode:'live',appLinkFollowerGate:{enabled:true},
  appLinkFollowUp:{enabled:true,policyVersion:1,delayMinutes:480}};
const config=require(base+'/services/trackSpeedCommentCampaign');
const policy=require(base+'/services/followerGatePolicy');
const campaigns=require(base+'/services/mindsetCampaigns');
const direct=require(base+'/services/followerDirectKeywords');
const instagram=require(base+'/services/instagram');
const verification=require(base+'/services/followerVerification');
const sends=[],checks=[],fallbacks=[],publicSends=[];
let follows=true,onVerify=null,privateOutcome=true,publicOutcome=true,sequence=0,activeAccount=a,followSource='meta',followAge=0,publicRateAllowed=true;
const limiter=require(base+'/utils/rateLimiter');
limiter.checkRateLimit=async accountId=>{assert.equal(accountId,a.id);return{allowed:publicRateAllowed,remaining:100,resetAt:new Date(Date.now()+3600000)}};
limiter.recordSentMessage=async(_id,type,accountId)=>{assert.equal(type,'comment_reply');assert.equal(accountId,a.id)};
verification.verifyFollower=async(account,recipient,fresh)=>{
  checks.push({accountId:account.id,recipient,fresh}); if(onVerify)await onVerify(recipient);
  return{follows,checkedAt:Date.now()-followAge,source:followSource};
};
instagram.sendInstagramPrivateReply=async(commentId,text,buttons,account)=>{
  assert.equal(policy.containsOutboundLink(text),false);assert.equal(account.id,a.id);
  sends.push({kind:'private',commentId,text,buttons});
  if(privateOutcome==='throw')throw Error('Synthetic unknown private-reply outcome');return privateOutcome;
};
instagram.sendInstagramDMOnce=async(recipient,text,account)=>{
  assert.equal(policy.canDeliverFollowerProtectedContent(account,recipient,text),true);
  sends.push({kind:'link',recipient,text});return true;
};
instagram.sendInstagramGatePromptOnce=async(recipient,text,buttons)=>{
  assert.equal(policy.containsOutboundLink(text),false);sends.push({kind:'prompt',recipient,text,buttons});return true;
};
const blocked=name=>async()=>{fallbacks.push(name);throw Error('Forbidden fallback: '+name)};
instagram.replyToComment=async(commentId,text,account)=>{
  assert.equal(account.id,a.id);assert.equal(policy.containsOutboundLink(text),false);
  const receipt=(await db.collection('mindset_comment_events').doc(a.id+'_'+commentId).get()).data();
  assert.equal(receipt.privateReplyStatus,'accepted');assert.equal(receipt.publicReplyStatus,'attempt_reserved');
  publicSends.push({commentId,text,accountId:account.id});
  if(publicOutcome==='throw')throw Error('Synthetic uncertain public response');return publicOutcome;
};
for(const[file,names]of[
 ['handlers/jumpDirectMessage',['handleJumpDirectMessage']],['handlers/linkRecovery',['handleLinkRecovery']],
 ['handlers/mindsetHandler',['handleMindsetMessage']],['handlers/messageHandler',['handleMessage']],
 ['handlers/commentHandler',['handleComment']],['handlers/storyHandler',['handleStoryMention','handleStoryReply']],
]){const m=require(base+'/'+file);for(const name of names)m[name]=blocked(name)}
const accounts=require(base+'/services/accounts');
accounts.getAccountByInstagramId=async id=>id===activeAccount.instagramAccountId?activeAccount:undefined;
accounts.updateAccountWebhookTimestamp=async()=>{};
const{instagramWebhook}=require(base+'/webhooks/instagram');
const stamp=ms=>admin.firestore.Timestamp.fromMillis(ms),key=r=>a.id+'_'+r;
const lead=r=>db.collection('mindset_leads').doc(key(r));
const state=r=>db.collection('follower_gate_recipients').doc(key(r));
const comment=(recipient,text='SPEED')=>({id:'synthetic-comment-'+(++sequence),media:{id:'synthetic-media',media_product_type:'FEED'},
 from:{id:recipient,username:'fixture_'+recipient},text,timestamp:new Date().toISOString()});
const dm=(recipient,text='SPEED',payload)=>({sender:{id:recipient},recipient:{id:activeAccount.instagramAccountId},timestamp:Date.now(),
 message:{mid:'synthetic-mid-'+(++sequence),text,...(payload?{quick_reply:{payload}}:{})}});
async function post(entry,valid=true){const body={object:'instagram',entry:[{id:activeAccount.instagramAccountId,...entry}]};
 const rawBody=Buffer.from(JSON.stringify(body));const signature='sha256='+createHmac('sha256',process.env.INSTAGRAM_APP_SECRET).update(rawBody).digest('hex');
 let status;const res={status:s=>{status=s;return res},send:()=>{},sendStatus:s=>{status=s}};
 await instagramWebhook({method:'POST',body,rawBody,get:()=>valid?signature:'invalid'},res);return status;}
const routeComment=c=>post({changes:[{field:'comments',value:c}]}),routeDm=e=>post({messaging:[e]});
async function quiet(action){const n=sends.length,k=checks.length,p=publicSends.length;await action();assert.equal(sends.length,n);assert.equal(checks.length,k);assert.equal(publicSends.length,p);assert.deepEqual(fallbacks,[])}
async function start(recipient){const c=comment(recipient);await routeComment(c);return(await lead(recipient).get()).data()}
test.before(async()=>{await db.collection('accounts').doc(a.id).set(a);
 const c=config.trackSpeedCommentCampaign(a);for(const keyword of ['MINDSET','JUMP','SPEED'])await db.collection('mindset_campaigns').doc('untrusted-'+keyword).set({...c,id:'untrusted-'+keyword,keyword});});
test.after(()=>{assert.deepEqual(fallbacks,[]);scoped.TRACKSPEED_ONLY_IDENTITY=null});

test('only comment campaign exists with approved acknowledgment; no DM entry, generic campaigns or follow-ups',()=>{
 const c=config.trackSpeedCommentCampaign(a);assert.equal(c.keyword,'SPEED');assert.equal(c.journey.linkMessage,'Here you go!');
 assert.equal(c.journey.destinationUrl,'https://apps.apple.com/us/app/trackspeed-sprint-timer/id6757509163');
 assert.equal(c.publicReplyEnabled,true);assert.equal(c.publicReplyText,config.TRACKSPEED_PUBLIC_NEXT_STEP);assert(Object.values(c.journey.followUps).every(f=>!f.enabled));
 assert.deepEqual(direct.followerDirectKeywordCampaigns(a),[]);assert.equal(campaigns.isMindsetAccountAllowed(a),false);
 assert.equal(campaigns.runtimeMindsetCampaign(a),null);assert.equal(require(base+'/services/appLinkFollowUps').appLinkFollowUpsEnabled(a),false);
 assert.equal(policy.isVerifiedFollowerGateAccount(a),false);
});
test('standalone SPEED comments accept case, surrounding punctuation and whitespace',async()=>{
 for(const text of ['SPEED','Speed!!!!','speed',' SpEeD! ','\n\tSPEED\t','(speed)','“SPEED!”','...SPEED...','[SPEED]','🔥 SPEED 🏃‍♂️','speeeedddd','S P E E D','ＳＰＥＥＤ','SPEED\u200b','#SPEED','@SPEED','<speed>']){
  const r='match-'+(++sequence),n=sends.length,p=publicSends.length;await routeComment(comment(r,text));assert.equal(sends.length,n+1,text);
  assert.equal(publicSends.length,p+1);assert.equal(publicSends.at(-1).text,config.TRACKSPEED_PUBLIC_NEXT_STEP);
  assert.equal(sends.at(-1).kind,'private');assert.match(sends.at(-1).text,/@trackspeed_app/);
  assert.equal((await lead(r).get()).data().triggerKeyword,'SPEED');
 }
});
for(const[name,texts]of Object.entries({
 sentences:['We worked on speed today.','I want to improve my speed','speed was part of our conversation','SPEED please','speed\nmaybe','x'.repeat(10000)+' SPEED'],
 substrings:['speeding','hyperspeed','speed-training','SPEED_plan','TRACKSPEED','NOVASPEED','sped'],
 symbols:['https://example.test/SPEED','speed@example.com'],
 otherKeywords:['JUMP','MINDSET','VAULT','JUMP SPEED','speed, mindset'],
}))test('reject comment '+name,async()=>{for(const text of texts){const r='quiet-'+(++sequence);await quiet(()=>routeComment(comment(r,text)));assert.equal((await lead(r).get()).exists,false)}});
test('SPEED in direct messages never starts a session, including with a recent comment',async()=>{
 for(const text of ['SPEED','speed!','LINK','yes','TrackSpeed','send me the link'])await quiet(()=>routeDm(dm('unscoped-'+(++sequence),text)));
 await start('comment-then-speed');await quiet(()=>routeDm(dm('comment-then-speed','SPEED')));
});
test('valid comment button and explicit LINK continuation deliver exactly the recovered reply',async()=>{
 for(const kind of ['button','LINK']){const r='continue-'+kind,l=await start(r),n=sends.length;
  await routeDm(dm(r,kind,kind==='button'?'mindset:send_link:'+l.linkToken:undefined));
  assert.equal(sends.length,n+1);assert.equal(sends.at(-1).text,'Here you go!\n\nhttps://apps.apple.com/us/app/trackspeed-sprint-timer/id6757509163');
  assert.equal(checks.at(-1).fresh,true);}
});
test('duplicate comment, concurrent delivery and recipient cooldown allow one private and one public reply',async()=>{
 const c=comment('dupe'),n=sends.length,p=publicSends.length;await Promise.all([routeComment(c),routeComment(c)]);await routeComment(c);
 await routeComment(comment('dupe'));assert.equal(sends.length,n+1);assert.equal(publicSends.length,p+1);
});
test('unknown provider outcome and old processing receipt are never automatically replayed',async()=>{
 for(const outcome of [false,'throw']){const c=comment('uncertain-'+outcome);privateOutcome=outcome;const n=sends.length,p=publicSends.length,k=checks.length;
  try{await routeComment(c)}finally{privateOutcome=true}
  const receipt=db.collection('mindset_comment_events').doc(a.id+'_'+c.id);
  await receipt.update({processingStartedAt:stamp(Date.now()-3600000)});await routeComment(c);assert.equal(sends.length,n+1);assert.equal(publicSends.length,p);assert.equal(checks.length,k);
 }
});
test('new SPEED comment may start after 24-hour recipient cooldown; same comment still cannot replay',async()=>{
 const r='cooldown',c=comment(r);await routeComment(c);
 await db.collection('trackspeed_comment_cooldowns').doc(key(r)).update({reservedAt:stamp(Date.now()-25*3600000)});
 const n=sends.length;await routeComment(c);assert.equal(sends.length,n);await routeComment(comment(r));assert.equal(sends.length,n+1);
});
for(const[name,change]of Object.entries({wrongOwner:{userId:'other'},wrongDocument:{id:'other'},wrongInstagramId:{instagramAccountId:'other'},inactive:{isActive:false},
 disconnected:{connectionStatus:'expired'},unsubscribed:{webhookSubscribed:false},paused:{automationMode:'paused'},testMode:{automationMode:'test'},gateDisabled:{appLinkFollowerGate:{enabled:false}}})){
 test('comment connection/identity guard: '+name,async()=>{activeAccount={...a,...change};try{await quiet(()=>routeComment(comment('guard-'+name)))}finally{activeAccount=a}});
}
test('null identity and global kill switches remain silent',async()=>{
 const mapping=scoped.TRACKSPEED_ONLY_IDENTITY;scoped.TRACKSPEED_ONLY_IDENTITY=null;
 try{await quiet(()=>routeComment(comment('unmapped')))}finally{scoped.TRACKSPEED_ONLY_IDENTITY=mapping}
 try{for(const mode of ['disabled','test']){process.env.BOT_MODE=mode;await quiet(()=>routeComment(comment('mode-'+mode)))}
 process.env.BOT_MODE='mindset';process.env.MINDSET_AUTOMATION_ENABLED='false';await quiet(()=>routeComment(comment('off')))}
 finally{process.env.BOT_MODE='mindset';process.env.MINDSET_AUTOMATION_ENABLED='true'}
});
test('own comments, malformed values, invalid envelope signatures and other change types stay silent',async()=>{
 for(const value of [null,{},comment(a.instagramAccountId),{...comment('own-name'),from:{id:'synthetic-other',username:'trackspeed_app'}},
  {...comment('bad-id'),id:'invalid/id'},{...comment('bad-text'),text:{toString:()=> 'SPEED'}}])await quiet(()=>routeComment(value));
 assert.equal(await post({changes:[{field:'comments',value:comment('bad-signature')}]},false),401);
 await quiet(()=>post({changes:[{field:'mentions',value:comment('mention')}]}));
 const story=dm('story','SPEED');story.message.reply_to={story:{id:'synthetic-story'}};await quiet(()=>routeDm(story));
});
test('manual-only, opted-out and paused recipients remain protected for comment entry',async()=>{
 for(const[k,guard]of Object.entries({manual:{humanHandoff:true,handoffHadLead:false},optout:{optedOut:true}})){
  const r='blocked-'+k;await state(r).set({accountId:a.id,recipientId:r,...guard});await quiet(()=>routeComment(comment(r)));}
 const r='paused';await start(r);await lead(r).update({automationPaused:true,stage:'human_handoff'});
 await quiet(()=>routeDm(dm(r,'LINK')));
});
test('unrelated, stale, forged and cross-account comment sessions cannot release a link',async()=>{
 for(const kind of ['stale','no-comment','wrong-campaign','wrong-owner','wrong-session','wrong-link','wrong-token']){
  const r='bad-context-'+kind,l=await start(r);
  if(kind==='stale')for(const h of l.history)h.at=stamp(Date.now()-25*3600000);
  if(kind==='no-comment')l.history=l.history.filter(h=>h.role!=='user');
  if(kind==='wrong-campaign')l.campaignId='untrusted-SPEED';if(kind==='wrong-owner')l.ownerUserId='other';
  if(kind==='wrong-session')l.campaignSessionId='other';if(kind==='wrong-link')l.campaignJourney.destinationUrl='https://example.test';
  await lead(r).set(l);await quiet(()=>routeDm(dm(r,'Following','mindset:send_link:'+(kind==='wrong-token'?'wrong':l.linkToken))));
 }
});
test('false and unknown follower checks withhold URLs; valid fresh recheck releases',async()=>{
 try{for(const value of [false,null]){const r='follow-'+value;await start(r);follows=value;await routeDm(dm(r,'LINK'));
  assert.equal(sends.at(-1).kind,'prompt');assert.equal(sends.at(-1).buttons[0].title,'Following');assert.match(sends.at(-1).buttons[0].payload,/^follow_gate:check:/);assert.match(sends.at(-1).text,/tap Following/);assert.doesNotMatch(sends.at(-1).text,/Check again/);const current=(await state(r).get()).data();
  await state(r).update({lastAttemptAt:stamp(Date.now()-11000)});follows=true;
  await routeDm(dm(r,'Following','follow_gate:check:'+current.checkToken));assert.equal(sends.at(-1).kind,'link');}}
 finally{follows=true}
});
test('duplicate continuation MID produces only one link and follower lookup',async()=>{
 const r='duplicate-dm';await start(r);const e=dm(r,'LINK'),n=sends.length,k=checks.length;
 await Promise.all([routeDm(e),routeDm(e)]);assert.equal(sends.length,n+1);assert.equal(checks.length,k+1);
});
test('human handoff or comment-session replacement during follower lookup blocks the send',async()=>{
 for(const kind of ['handoff','session']){const r='race-'+kind;await start(r);onVerify=async()=>{
  if(kind==='handoff')await state(r).set({accountId:a.id,recipientId:r,humanHandoff:true,handoffHadLead:false},{merge:true});
  else await lead(r).update({campaignSessionId:'replacement'});};const n=sends.length;
  try{await routeDm(dm(r,'LINK'));assert.equal(sends.length,n)}finally{onVerify=null}}
});
test('a concurrent human handoff before comment initialization is preserved',async()=>{
 const r='comment-handoff-race',n=sends.length;let transactions=0;
 db.runTransaction=async fn=>{transactions++;if(transactions===2)await state(r).set({accountId:a.id,recipientId:r,humanHandoff:true,handoffHadLead:false});return mem.runTransaction(fn)};
 try{await routeComment(comment(r));assert.equal(sends.length,n);assert.equal((await lead(r).get()).exists,false);assert.equal((await state(r).get()).data().humanHandoff,true)}
 finally{db.runTransaction=mem.runTransaction}
});
test('a fresh account pause after event routing blocks comment delivery',async()=>{
 const n=sends.length;await db.collection('accounts').doc(a.id).update({automationMode:'paused'});
 try{await routeComment(comment('fresh-account-pause'));assert.equal(sends.length,n)}
 finally{await db.collection('accounts').doc(a.id).set(a)}
});

test('public wording uses a fresh reliable false only; true, unknown, stale and cached states stay neutral',async()=>{
 try{for(const c of [
  {value:true,source:'meta',age:0,state:'following'},
  {value:false,source:'meta',age:0,state:'not_following'},
  {value:null,source:'meta_error',age:0,state:'unknown'},
  {value:false,source:'cache',age:0,state:'unknown'},
  {value:false,source:'meta',age:3600000,state:'unknown'},
 ]){follows=c.value;followSource=c.source;followAge=c.age;const e=comment('public-state-'+(++sequence)),p=publicSends.length;
  await routeComment(e);assert.equal(publicSends.length,p+1);
  assert.equal(publicSends.at(-1).text,c.state==='not_following'?config.TRACKSPEED_PUBLIC_FOLLOW:config.TRACKSPEED_PUBLIC_NEXT_STEP);
  const receipt=(await db.collection('mindset_comment_events').doc(a.id+'_'+e.id).get()).data();
  assert.equal(receipt.publicFollowerState,c.state);assert.equal(receipt.publicReplyStatus,'accepted');
 }}finally{follows=true;followSource='meta';followAge=0}
});
test('follower lookup exception gives a neutral public acknowledgment without releasing a link',async()=>{
 const e=comment('public-lookup-error'),p=publicSends.length,n=sends.length;
 onVerify=async()=>{throw Error('Synthetic lookup error')};
 try{await routeComment(e);assert.equal(sends.length,n+1);assert.equal(publicSends.length,p+1);
  assert.equal(publicSends.at(-1).text,config.TRACKSPEED_PUBLIC_NEXT_STEP);
 }finally{onVerify=null}
});
test('public rejection or uncertain response never repeats private or public sends on redelivery',async()=>{
 for(const outcome of [false,'throw']){const e=comment('public-failure-'+outcome),p=publicSends.length,n=sends.length;publicOutcome=outcome;
  try{await routeComment(e)}finally{publicOutcome=true}
  const receipt=(await db.collection('mindset_comment_events').doc(a.id+'_'+e.id).get()).data();
  assert.equal(receipt.privateReplyStatus,'accepted');assert.equal(receipt.publicReplyStatus,'not_confirmed');
  await routeComment(e);assert.equal(sends.length,n+1);assert.equal(publicSends.length,p+1);
 }
});
test('public rate limit withholds acknowledgment and never resends the accepted private prompt',async()=>{
 const e=comment('public-rate-limit'),p=publicSends.length,n=sends.length;publicRateAllowed=false;
 try{await routeComment(e)}finally{publicRateAllowed=true}
 await routeComment(e);assert.equal(publicSends.length,p);assert.equal(sends.length,n+1);
 assert.equal((await db.collection('mindset_comment_events').doc(a.id+'_'+e.id).get()).data().publicReplyStatus,'not_confirmed');
});
test('repeated Following checks never add a public reply',async()=>{
 const r='public-follow-retries';follows=false;
 try{const l=await start(r),p=publicSends.length;await routeDm(dm(r,'Following','mindset:send_link:'+l.linkToken));
  const s=(await state(r).get()).data();await state(r).update({lastAttemptAt:stamp(Date.now()-11000)});
  follows=true;const event=dm(r,'Following','follow_gate:check:'+s.checkToken);await routeDm(event);await routeDm(event);
  assert.equal(publicSends.length,p);assert.equal(sends.at(-1).kind,'link');
 }finally{follows=true}
});
test('pre-release private-only completed receipts never gain historical public replies',async()=>{
 const e=comment('historical-private-only');await db.collection('mindset_comment_events').doc(a.id+'_'+e.id).set({
  accountId:a.id,eventId:e.id,status:'completed',privateReplyStatus:'accepted',privateReplySent:true,publicReplySent:null,
  processingStartedAt:stamp(Date.now()-3600000),updatedAt:stamp(Date.now()-3600000)});
 await quiet(()=>routeComment(e));
});
test('handoff, identity or account pause during the public follower lookup suppresses acknowledgment',async()=>{
 for(const kind of ['handoff','wrong-owner','account-pause']){const e=comment('public-guard-'+kind),p=publicSends.length;
  onVerify=async r=>{if(kind==='handoff')await state(r).set({accountId:a.id,humanHandoff:true,handoffHadLead:false});
   else if(kind==='wrong-owner')await lead(r).update({ownerUserId:'someone-else'});
   else await db.collection('accounts').doc(a.id).update({automationMode:'paused'});};
  try{await routeComment(e);assert.equal(publicSends.length,p)}finally{onVerify=null;await db.collection('accounts').doc(a.id).set(a)}
 }
});
