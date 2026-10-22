const test=require('node:test'),assert=require('node:assert/strict');
const rate=require('../lib/utils/rateLimiter');rate.checkRateLimit=async()=>({allowed:true});rate.recordSentMessage=async()=>{};
const api=require('../lib/services/instagram');
const a={id:'synthetic-nova',userId:'synthetic-owner',instagramAccountId:'synthetic-ig',username:'novaspeedtiming',accessToken:'IG_SYNTHETIC_NOT_A_CREDENTIAL',platform:'instagram'};
test('comment-private transport makes one request for accepted, failed and uncertain outcomes',async()=>{
 for(const outcome of [true,false,'throw']){const calls=[];global.fetch=async(url,options)=>{
   calls.push({url,options});if(outcome==='throw')throw new Error('Synthetic network uncertainty');
   return {ok:outcome,status:outcome?200:400,json:async()=>outcome?{message_id:'synthetic-message'}:{error:{code:100,message:'synthetic error'}}};
  };
  const result=await api.sendInstagramCommentPrivateReplyOnce('synthetic-comment','Fixture text',a,Date.now()+60000);
  assert.equal(result,outcome===true);assert.equal(calls.length,1);assert.equal(calls[0].url,'https://graph.instagram.com/v21.0/me/messages');
  assert.equal(JSON.parse(calls[0].options.body).recipient.comment_id,'synthetic-comment');
 }
});
test('expired comment transport and Facebook account perform no request',async()=>{
 global.fetch=async()=>{throw new Error('Must not reach transport')};
 assert.equal(await api.sendInstagramCommentPrivateReplyOnce('c','text',a,Date.now()-1),false);
 assert.equal(await api.sendInstagramCommentPrivateReplyOnce('c','text',{...a,platform:'facebook'},Date.now()+60000),false);
});
