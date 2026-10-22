const test=require('node:test');const assert=require('node:assert/strict');
const base=require('node:path').resolve(__dirname,'..');
process.env.BOT_MODE='mindset';process.env.MINDSET_AUTOMATION_ENABLED='true';process.env.MINDSET_TARGET_ACCOUNT_USERNAMES='sondre_pv,trackjumpapp,athletemindsetapp';
const admin=require(base+'/node_modules/firebase-admin');const {db}=require(base+'/lib/firebase');
const {memoryFirestore}=require('./memory-firestore.cjs');const memory=memoryFirestore();db.collection=memory.collection;db.runTransaction=memory.runTransaction;
const policy=require(base+'/lib/services/followerGatePolicy');
const rate=require(base+'/lib/utils/rateLimiter');rate.checkRateLimit=async()=>({allowed:true});rate.recordSentMessage=async()=>{};
const instagram=require(base+'/lib/services/instagram');const verify=require(base+'/lib/services/followerVerification');
const profiles=require(base+'/lib/services/mindsetProfiles');profiles.refreshMindsetLeadProfile=async()=>{};
const reminders=require(base+'/lib/services/appLinkFollowUps');const enqueued=[];reminders.enqueueAppLinkFollowUp=async(a,r)=>{enqueued.push(r);return true;};
const calls=[];const checks=[];const results=new Map();let onVerify=null;let uncertain=false;
verify.verifyFollower=async(a,r,fresh)=>{checks.push({account:a.id,recipient:r,fresh});if(onVerify)await onVerify(r);return{follows:results.get(r)??null,checkedAt:Date.now(),source:'mock'};};
instagram.sendInstagramDMOnce=async(r,message,a,expiry)=>{assert(expiry>Date.now());assert(policy.canDeliverFollowerProtectedContent(a,r,message));calls.push({kind:'link',r,message});return!uncertain;};
instagram.sendInstagramGatePromptOnce=async(r,message,buttons,a,expiry)=>{assert(expiry>Date.now());assert(!policy.containsOutboundLink(message));calls.push({kind:'gate',r,message,buttons});return true;};
instagram.sendInstagramPrivateReply=async(comment,message,buttons)=>{assert(!policy.containsOutboundLink(message));calls.push({kind:'opening',comment,message,buttons});return true;};
instagram.replyToComment=async()=>true;
const {handleMindsetComment:comment}=require(base+'/lib/handlers/mindsetHandler');
const {handleFollowerGateMessage:handle}=require(base+'/lib/handlers/followerGate');
const a={...policy.FOLLOWER_GATE_IDENTITY,isActive:true,connectionStatus:'connected',appLinkFollowerGate:{enabled:true},accessToken:'IG_SYNTHETIC'};
const target='https://www.stavhopp.no/';
const c={id:'vault-download-all-posts',accountId:a.id,ownerUserId:a.userId,name:'VAULT fixture',keyword:'VAULT',template:'vault_tracker_download',status:'live',postMode:'any',postIds:[],publicReplyEnabled:false,journey:{destinationUrl:target,linkMessage:'Here are the pole vault training programs and videos:'}};
const state=r=>db.collection('follower_gate_recipients').doc(a.id+'_'+r);const lead=r=>db.collection('mindset_leads').doc(a.id+'_'+r);
let n=0;const event=(r,text='VAULT',payload)=>({sender:{id:r},recipient:{id:a.instagramAccountId},timestamp:Date.now(),message:{mid:'synthetic-'+(++n),text,...(payload?{quick_reply:{payload}}:{})}});
const resetCooldown=async r=>{await state(r).update({lastAttemptAt:admin.firestore.Timestamp.fromMillis(Date.now()-11000),lastLinkSentAt:admin.firestore.Timestamp.fromMillis(0)});};
test.before(async()=>{await db.collection('accounts').doc(a.id).set(a);await db.collection('mindset_campaigns').doc(c.id).set(c);await db.collection('app_link_followups').doc('existing-reminder-fixture').set({status:'pending',dueAt:'preserve-this-fixture'});});
test('initial VAULT comment is neutral and never performs a premature follower check',async()=>{
 await comment({id:'fixture-comment',media:{id:'fixture-post'},from:{id:'fixture-commenter',username:'synthetic'},text:'Vault'},a);
 const opening=calls.at(-1);assert.equal(opening.kind,'opening');assert.match(opening.message,/verify your follower access/);assert.doesNotMatch(opening.message,/Follow @|only for my followers/);assert.equal(checks.length,0);assert.equal(opening.buttons[0].title,'Check again');
 results.set('fixture-commenter',true);await handle(event('fixture-commenter','',opening.buttons[0].payload),a);assert.equal(calls.at(-1).kind,'link');assert(calls.at(-1).message.endsWith(target));assert.equal(checks.at(-1).fresh,true);assert.equal((await lead('fixture-commenter').get()).data().stage,'link_sent');
});
test('false and unknown results hold the website link and use distinct truthful prompts',async()=>{
 for(const [r,value,pattern]of[['fixture-false',false,/Follow @sondre_pv/],['fixture-unknown',null,/couldn’t verify/]]){
  results.set(r,value);await handle(event(r),a);assert.equal(calls.at(-1).kind,'gate');assert.match(calls.at(-1).message,pattern);assert(!policy.containsOutboundLink(calls.at(-1).message));assert.equal(checks.at(-1).fresh,true);
 }
});
test('a genuine check-again interaction can unlock after false; duplicate MID and cooldown cannot resend',async()=>{
 const prior=calls.find(x=>x.r==='fixture-false');await resetCooldown('fixture-false');results.set('fixture-false',true);
 const retry=event('fixture-false','',prior.buttons[0].payload);await Promise.all([handle(retry,a),handle(retry,a)]);const count=calls.length;assert.equal(calls.at(-1).kind,'link');assert(calls.at(-1).message.endsWith(target));await handle(retry,a);await handle(event('fixture-false'),a);assert.equal(calls.length,count);
});
test('website exception rejects URL variants while retaining the existing App Store route',async()=>{
 const ref=db.collection('mindset_campaigns').doc(c.id);
 for(const [i,url]of['http://www.stavhopp.no/','https://stavhopp.no/','https://www.stavhopp.no/?x=1','https://www.stavhopp.no.evil.test/','https://user@www.stavhopp.no/','https://www.stavhopp.no/drills'].entries()){
  await ref.update({journey:{...c.journey,destinationUrl:url}});const before=calls.length;results.set('fixture-url-'+i,true);await handle(event('fixture-url-'+i),a);assert.equal(calls.length,before,'unapproved destination must not send');
 }
 await ref.update({journey:{...c.journey,destinationUrl:'https://apps.apple.com/us/app/vault-pole-vault-training/id6767121354'}});results.set('fixture-app',true);await handle(event('fixture-app'),a);assert.match(calls.at(-1).message,/id6767121354$/);assert.equal(enqueued.length,1,'existing app behavior retained');await ref.update({journey:c.journey});
});
test('STOP, human ownership, expired windows, forged buttons and wrong identities prevent sends',async()=>{
 await handle(event('fixture-stopped','STOP'),a);results.set('fixture-stopped',true);let before=calls.length;await handle(event('fixture-stopped'),a);assert.equal(calls.length,before);
 const sample=(await lead('fixture-commenter').get()).data();await lead('fixture-paused').set({...sample,id:a.id+'_fixture-paused',instagramUserId:'fixture-paused',automationPaused:true,stage:'human_handoff'});results.set('fixture-paused',true);await handle(event('fixture-paused'),a);assert.equal(calls.length,before);
 const expired=event('fixture-expired');expired.timestamp-=24*3600000;await handle(expired,a);await handle(event('fixture-forged','','mindset:send_link:invalid'),a);assert.equal(calls.length,before);
 for(const change of [{id:'other'},{userId:'other'},{instagramAccountId:'other'},{platform:'facebook'}]){await handle(event('fixture-other'),{...a,...change});assert.equal(calls.length,before);}
});
test('ownership race and uncertain send outcomes never trigger a duplicate or fallback',async()=>{
 const sample=(await lead('fixture-commenter').get()).data();await lead('fixture-race').set({...sample,id:a.id+'_fixture-race',instagramUserId:'fixture-race',automationPaused:false,stage:'awaiting_link_request'});results.set('fixture-race',true);
 onVerify=async r=>{if(r==='fixture-race')await lead(r).update({automationPaused:true,stage:'human_handoff'});};const before=calls.length;await handle(event('fixture-race'),a);assert.equal(calls.length,before);onVerify=null;
 uncertain=true;results.set('fixture-uncertain',true);const request=event('fixture-uncertain');await handle(request,a);await handle(request,a);assert.equal(calls.length,before+1);uncertain=false;
});
test('website sends enqueue no app-use reminders and preserve an existing reminder fixture',async()=>{
 assert.equal(enqueued.length,1,'only the deliberately tested legacy App Store route enqueued');assert.deepEqual((await db.collection('app_link_followups').doc('existing-reminder-fixture').get()).data(),{status:'pending',dueAt:'preserve-this-fixture'});assert.equal((await db.collection('message_queue').get()).size,0);
});
test('actual Meta response parser distinguishes false from unavailable or failed verification',async()=>{
 for(const [body,status,expected]of[[{is_user_follow_business:true},200,true],[{is_user_follow_business:false},200,false],[{},200,null],[{is_user_follow_business:'true'},200,null],[{error:{code:190}},403,null]]){
  global.fetch=async(url,options)=>{assert(new URL(url).hostname==='graph.instagram.com');assert.equal(options.headers.Authorization,'Bearer IG_SYNTHETIC');return{ok:status===200,status,json:async()=>body};};
  const result=await verify.fetchFollowerRelationship(a,'fixture-parser');assert.equal(result.follows,expected);if(status!==200)assert.equal(result.source,'meta_error');
 }
 global.fetch=async()=>{throw Error('synthetic request error')};assert.equal((await verify.fetchFollowerRelationship(a,'fixture-error')).follows,null);
});

test('non-VAULT first messages are neutral; the original payload still requires a fresh true result',async()=>{
 const fixture={id:'fixture-jump-campaign',accountId:a.id,ownerUserId:a.userId,name:'Jump fixture',keyword:'JUMP',template:'trackjump_download',status:'live',postMode:'any',postIds:[],publicReplyEnabled:false,journey:{destinationUrl:'https://apps.apple.com/us/app/trackjump-jump-height-rsi/id6809517672',linkMessage:'Here is TrackJump:'}};
 await db.collection('mindset_campaigns').doc(fixture.id).set(fixture);
 const before=checks.length;await comment({id:'fixture-jump-comment',media:{id:'fixture-post'},from:{id:'fixture-jump-commenter',username:'synthetic'},text:'JUMP'},a);
 const opening=calls.at(-1);assert.equal(opening.kind,'opening');assert.match(opening.message,/Tap Following/);assert.match(opening.message,/TrackJump/);assert.doesNotMatch(opening.message,/Follow @|only for my followers/);assert.equal(opening.buttons[0].title,'Following');assert.match(opening.buttons[0].payload,/^mindset:send_link:/);assert.equal(checks.length,before);
 results.set('fixture-jump-commenter',false);await handle(event('fixture-jump-commenter','',opening.buttons[0].payload),a);assert.equal(calls.at(-1).kind,'gate');assert.match(calls.at(-1).message,/Follow @sondre_pv/);assert.equal(calls.at(-1).buttons[0].title,'Check again');
 const recheck=calls.at(-1).buttons[0].payload;await resetCooldown('fixture-jump-commenter');results.set('fixture-jump-commenter',true);await handle(event('fixture-jump-commenter','',recheck),a);assert.equal(calls.at(-1).kind,'link');assert(calls.at(-1).message.endsWith(fixture.journey.destinationUrl));
});

test('AI billing failure becomes a specific silent handoff, without a reply or historical replay',async()=>{
 const ai=require(base+'/lib/services/ai');const old=ai.generateIsolatedAIResponseWithStatus;let requests=0;ai.generateIsolatedAIResponseWithStatus=async()=>{requests++;return{text:'',usedAI:false,failureReason:'billing'}};
 const sample=(await lead('fixture-commenter').get()).data();const r='fixture-ai-billing';await lead(r).set({...sample,id:a.id+'_'+r,instagramUserId:r,username:'synthetic',campaignTemplate:'athlete_mindset_download',stage:'ai_follow_up',automationPaused:false,lastUserInteractionAt:admin.firestore.Timestamp.now(),history:[]});
 let sends=0;const oldSend=instagram.sendInstagramDM;instagram.sendInstagramDM=async()=>{sends++;throw Error('Billing failure must not send')};
 try{const handler=require(base+'/lib/handlers/mindsetHandler').handleMindsetMessage;const msg=event(r,'Can you explain what happens inside the app?');await handler(msg,a);assert.equal(requests,1);assert.equal(sends,0);assert.equal((await lead(r).get()).data().automationPaused,true);assert.equal((await db.collection('mindset_handoffs').doc(a.id+'_'+r).get()).data().reason,'ai_billing_unavailable');await handler(event(r,'Can you explain what happens inside the app?'),a);assert.equal(requests,1);assert.equal(sends,0);assert.equal((await db.collection('message_queue').get()).size,0);}finally{ai.generateIsolatedAIResponseWithStatus=old;instagram.sendInstagramDM=oldSend;}
});
