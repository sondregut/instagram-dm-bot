const test=require('node:test'),assert=require('node:assert/strict');
process.env.BOT_MODE='mindset';process.env.MINDSET_AUTOMATION_ENABLED='true';
process.env.MINDSET_TARGET_ACCOUNT_USERNAMES='sondre_pv,athletemindsetapp,trackjumpapp,polevaulttracker';
process.env.MINDSET_TRIGGER_KEYWORD='MINDSET';
const base='../lib',p=require(base+'/utils/commentKeywordMatching');
const keywords=['SPEED','NOVASPEED','MINDSET','JUMP','VAULT','TRACKJUMP','TRACKSPEED','ADMINTEST123'];
for(const word of keywords)test(`${word}: formatting, Unicode, spacing and bounded repeated letters`,()=>{
 const stretched=word.replace(/[A-Z]/g,c=>c.repeat(3));
 const fullwidth=word.replace(/[!-~]/g,c=>String.fromCharCode(c.charCodeAt(0)+0xfee0));
 for(const value of [word,word.toLowerCase(),`!! ${word} ?!`,`🔥 ${word} 🏃‍♂️`,word.split('').join(' '),word.split('').join('.'),stretched,fullwidth,word+'\u200b']){
  assert(p.matchesCommentKeyword(value,word),value);
  assert.equal(p.findCommentKeyword(value,[...keywords].reverse()),word,value);
 }
});
for(const word of keywords)test(`${word}: sentences, unrelated words, URLs and combined campaigns rejected`,()=>{
 for(const text of [`I love ${word}`,`${word} please`,`Tell me about ${word}`,`${word} training`,`${word}ing`,`https://example.test/${word}`,`${word}@example.com`,`${word} + JUMP please`,word+'x','x'+word,'x'.repeat(200)+word])assert.equal(p.matchesCommentKeyword(text,word),false,text);
});
test('SPEED cannot steal NOVASPEED or TRACKSPEED; JUMP cannot steal TRACKJUMP',()=>{
 for(const word of ['NOVASPEED','TRACKSPEED'])assert.equal(p.matchesCommentKeyword(word,'SPEED'),false);
 assert.equal(p.matchesCommentKeyword('TRACKJUMP','JUMP'),false);
 for(const text of ['speed mindset','speed or jump','novaspeed speed','sped','speеd','speed\0','🔥'])assert.equal(p.findCommentKeyword(text,keywords),null,text);
 assert.equal(p.matchesCommentKeyword('s'+'p'+'e'.repeat(30)+'d','SPEED'),false);
});
test('exact normalized campaign spelling wins over elongation, independent of input order',()=>{
 assert.equal(p.findCommentKeyword('SPEED',['SPEED','SPEEED']),'SPEED');
 assert.equal(p.findCommentKeyword('SPEEED',['SPEED','SPEEED']),'SPEEED');
 assert.equal(p.findCommentKeyword(' NOVA SPEED! ',['SPEED','NOVASPEED']),'NOVASPEED');
});
test('malformed input and arbitrary regex metacharacters cannot broaden matching',()=>{
 for(const v of [null,undefined,{},12,''])assert.equal(p.matchesCommentKeyword(v,'SPEED'),false);
 assert.equal(p.matchesCommentKeyword('SPEED',null),false);
 assert.equal(p.matchesCommentKeyword('anything','.*'),false);
});

const {db}=require(base+'/firebase'),mem=require('./memory-firestore.cjs').memoryFirestore();
db.collection=mem.collection;db.runTransaction=mem.runTransaction;
const campaigns=require(base+'/services/mindsetCampaigns');
const account={id:'75w5QJJQUa4TGOq8bwzZ',userId:'uqBSZBen8DPLxIkzMFH8tRle62F3',instagramAccountId:'17841400489754274',username:'sondre_pv',isActive:true,connectionStatus:'connected'};
test.before(async()=>{
 for(const keyword of keywords)await db.collection('mindset_campaigns').doc('comment-'+keyword).set({ownerUserId:account.userId,accountId:account.id,name:keyword,keyword,status:keyword==='ADMINTEST123'?'test':'live',postIds:[],postMode:'any',template:'athlete_mindset_download'});
 await db.collection('mindset_campaigns').doc('wrong-owner').set({ownerUserId:'other-owner',accountId:account.id,keyword:'OTHER',status:'live',postMode:'any',postIds:[]});
});
test('actual stored comment resolver honors variations, full keywords, campaign status and owner',async()=>{
 for(const keyword of keywords.filter(k=>k!=='ADMINTEST123')){
  const result=await campaigns.resolveMindsetCampaignForComment(account,`🔥 ${keyword.toLowerCase().split('').join(' ')}!!!`,'synthetic-post');
  assert.equal(result?.keyword,keyword);
 }
 for(const text of ['OTHER','ADMINTEST123','I need SPEED training','novaspeed please','jump speed'])assert.equal(await campaigns.resolveMindsetCampaignForComment(account,text,'synthetic-post'),null,text);
 assert.equal(await campaigns.resolveMindsetCampaignForComment({...account,id:'wrong-account',username:'unrelated'},'SPEED','synthetic-post'),null);
});
