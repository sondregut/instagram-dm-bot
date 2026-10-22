const test=require('node:test'),assert=require('node:assert/strict');
process.env.BOT_MODE='mindset';process.env.MINDSET_AUTOMATION_ENABLED='true';
const admin=require('firebase-admin'),{db}=require('../lib/firebase');
const mem=require('./memory-firestore.cjs').memoryFirestore();db.collection=mem.collection;db.runTransaction=mem.runTransaction;
const records=require('../lib/services/novaSpeedRecords'),p=require('../lib/webhooks/instagram');
const api=require('../lib/services/instagram');let seq=0;const sent=[];
api.sendInstagramCommentPrivateReplyOnce=async(id,text,a,expiry,observe)=>{const mid='out-'+(++seq);sent.push({mid,text});observe?.(true,mid);return true};
api.sendInstagramDMOnce=async(id,text,a,expiry,observe)=>{const mid='out-'+(++seq);sent.push({mid,text});observe?.(true,mid);return true};
api.replyToComment=async()=>true;
const accounts=records.NOVA_IDENTITIES.map(a=>({...a,platform:'instagram',isActive:true,connectionStatus:'connected',webhookSubscribed:true,automationMode:'live'}));
const msg=(a,r,text,reply,echo=false)=>({sender:{id:echo?a.instagramAccountId:r},recipient:{id:echo?r:a.instagramAccountId},timestamp:Date.now(),message:{mid:'in-'+(++seq),text,...(reply?{reply_to:{mid:reply}}:{}),...(echo?{is_echo:true}:{})}});
const rows=()=>[...mem.records.entries()].filter(([k])=>k.startsWith('novaspeed_messages/')).map(([,v])=>v);
const receipt=(a,r)=>mem.records.get('novaspeed_sessions/'+a.id+'_'+r);
async function begin(a,r){await p.handleNovaSpeedComment({id:'comment-'+r,media:{id:'media'},from:{id:r,username:'fixture'},text:'Novaspeed',timestamp:new Date().toISOString()},a,Date.now());}
test.before(async()=>{for(const a of accounts)await db.collection('accounts').doc(a.id).set(a)});
for(const a of accounts)test(a.username+': opening, invalid free-text notes, email, acknowledgement and explicit later notes are saved',async()=>{
 const r='fixture-'+a.username;await begin(a,r);const opening=sent.at(-1);assert.equal(rows().filter(x=>x.accountId===a.id&&x.instagramUserId===r).length,1);
 const note=msg(a,r,'I coach a club and need two timing gates.');await p.handleNovaSpeedMessage(note,a);assert(rows().some(x=>x.text===note.message.text&&x.accountId===a.id));
 const note2=msg(a,r,'We have twenty athletes, please include setup information.');const before=sent.length;await p.handleNovaSpeedMessage(note2,a);assert.equal(sent.length,before);assert(rows().some(x=>x.text===note2.message.text));
 const email=msg(a,r,'fixture@example.test');await p.handleNovaSpeedMessage(email,a);const ack=sent.at(-1);
 const lead=mem.records.get('leads/novaspeed_'+a.id+'_'+r);assert.equal(lead.conversationId,a.id+'_'+r+'_comment-'+r);assert.equal(lead.followUpEmailSent,false);
 const beforeRows=rows().length;await p.handleNovaSpeedMessage(email,a);assert.equal(rows().length,beforeRows);
 const later=msg(a,r,'Please include prices for a club package.',ack.mid);assert.equal(await p.handleNovaSpeedNoteOrEcho(later,a),true);assert(rows().some(x=>x.text===later.message.text));assert.equal(sent.at(-1),ack);
 const ambiguous=msg(a,r,'Are we meeting for dinner?');const count=rows().length;assert.equal(await p.handleNovaSpeedNoteOrEcho(ambiguous,a),false);assert.equal(rows().length,count);
 const explicit=msg(a,r,'For NovaSpeed, can we use it indoors?');assert.equal(await p.handleNovaSpeedNoteOrEcho(explicit,a),true);
 const manual=msg(a,r,'I will send the NovaSpeed information manually.',email.message.mid,true);assert.equal(await p.handleNovaSpeedNoteOrEcho(manual,a),true);assert(rows().some(x=>x.text===manual.message.text&&x.direction==='Outgoing'));
 const echo={...manual,message:{mid:opening.mid,is_echo:true,text:opening.text}};const n=rows().length;assert.equal(await p.handleNovaSpeedNoteOrEcho(echo,a),true);assert.equal(rows().length,n);
 assert([...mem.records.entries()].filter(([k])=>k.startsWith('novaspeed_sheet_outbox/')).every(([,v])=>v.campaignId===records.NOVA_CAMPAIGN));
});
test('other-account and stale/newer personal campaign messages never enter NovaSpeed records',async()=>{
 const a=accounts[0],r='fixture-sondre_pv',before=rows().length;
 assert.equal(await p.handleNovaSpeedNoteOrEcho(msg(a,r,'NovaSpeed details'),{...a,id:'another-account'}),false);
 await db.collection('mindset_leads').doc(a.id+'_'+r).set({accountId:a.id,ownerUserId:a.userId,campaignSessionId:'new-mindset',lastUserInteractionAt:admin.firestore.Timestamp.now()});
 assert.equal(await p.handleNovaSpeedNoteOrEcho(msg(a,r,'NovaSpeed details'),a),false);assert.equal(rows().length,before);
});
test('unconfirmed outbound attempt is retained privately but never exported as a sent message',async()=>{
 const a=accounts[1],s=receipt(a,'fixture-novaspeedtiming'),key='uncertain-test';
 await records.recordNovaOutbound(a,s,key,'Synthetic uncertain outgoing','attempt_reserved');
 await records.recordNovaOutbound(a,s,key,'Synthetic uncertain outgoing','not_confirmed');
 const id=records.novaRecordId(a.id,key);assert.equal(mem.records.get('novaspeed_messages/'+id).status,'not_confirmed');assert.equal(mem.records.has('novaspeed_sheet_outbox/message_'+id),false);
});
test('explicit manual-conversation notes can be archived without clearing a human pause; opted-out sessions remain excluded',async()=>{
 const a=accounts[1],r='fixture-novaspeedtiming';
 const ref=db.collection('novaspeed_sessions').doc(a.id+'_'+r);await ref.update({status:'human_handoff',paused:true});
 const note=msg(a,r,'NovaSpeed note for the person handling this conversation.');const n=sent.length;
 assert.equal(await p.handleNovaSpeedNoteOrEcho(note,a),true);assert.equal(sent.length,n);assert.equal(receipt(a,r).paused,true);
 await ref.update({status:'opted_out'});const count=rows().length;assert.equal(await p.handleNovaSpeedNoteOrEcho(msg(a,r,'NovaSpeed follow-up'),a),false);assert.equal(rows().length,count);
});
