const test=require('node:test');const assert=require('node:assert/strict');const {createHmac}=require('node:crypto');
process.env.BOT_MODE='mindset';process.env.MINDSET_AUTOMATION_ENABLED='true';process.env.MINDSET_TARGET_ACCOUNT_USERNAMES='trackspeedapp';process.env.INSTAGRAM_APP_SECRET='local-test-secret';
const accounts=require('../lib/services/accounts');const mindset=require('../lib/handlers/mindsetHandler');const jump=require('../lib/handlers/jumpDirectMessage');const recovery=require('../lib/handlers/linkRecovery');
const calls=[];
accounts.getAccountByInstagramId=async()=>({id:'test-account',username:'trackspeedapp'});accounts.updateAccountWebhookTimestamp=async()=>{};
jump.handleJumpDirectMessage=async e=>{calls.push('jump');return e.message?.text==='jump';};
recovery.handleLinkRecovery=async e=>{calls.push('recovery');return e.message?.text==='missing link';};
mindset.handleMindsetMessage=async()=>{calls.push('existing-dm');return true;};mindset.handleMindsetComment=async()=>{calls.push('existing-comment');return true;};
const {instagramWebhook}=require('../lib/webhooks/instagram');
async function post(event,valid=true){calls.length=0;const body={object:'instagram',entry:[{id:'test',...event}]};const rawBody=Buffer.from(JSON.stringify(body));let status;const req={method:'POST',body,rawBody,get:()=>valid?'sha256='+createHmac('sha256',process.env.INSTAGRAM_APP_SECRET).update(rawBody).digest('hex'):'bad'};const res={status:s=>{status=s;return res;},send:()=>{},sendStatus:s=>{status=s;}};await instagramWebhook(req,res);return status;}
test('new direct and recovery routes stop duplicate fallback replies',async()=>{assert.equal(await post({messaging:[{message:{text:'jump'}}]}),200);assert.deepEqual(calls,['jump']);await post({messaging:[{message:{text:'missing link'}}]});assert.deepEqual(calls,['jump','recovery']);});
test('other DMs and all comment events retain existing routing',async()=>{await post({messaging:[{message:{text:'ordinary reply'}}]});assert.deepEqual(calls,['jump','recovery','existing-dm']);await post({changes:[{field:'comments',value:{text:'JUMP'}}]});assert.deepEqual(calls,['existing-comment']);});
test('signature validation still rejects unauthenticated requests before routing',async()=>{assert.equal(await post({messaging:[{message:{text:'jump'}}]},false),401);assert.deepEqual(calls,[]);});
