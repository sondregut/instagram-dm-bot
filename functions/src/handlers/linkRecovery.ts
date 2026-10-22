import { createHash } from 'crypto';
import * as admin from 'firebase-admin';
import { db, InstagramAccount } from '../firebase';
import { sendInstagramDMOnce } from '../services/instagram';
import { isMindsetAccountAllowed, runtimeMindsetCampaign } from '../services/mindsetCampaigns';
import { buildMindsetConversationId, isMindsetConversationIdentityMatch } from '../services/mindsetConversationIsolation';
import { normalizeMindsetText, requiresMindsetHumanHandoff } from '../services/mindsetFlowLogic';
import { isLinkRecoveryRequest, isLinkOptOut, isVerifiedCampaignUrl, mentionedAppTemplates, VERIFIED_APP_LINKS } from '../services/linkRecoveryLogic';
import { getBotMode } from '../utils/runtimeMode';
import { JumpMessageEvent } from './jumpDirectMessage';
import { isPoleVaultAccount, POLE_VAULT_LINK_MESSAGE, POLE_VAULT_REPLY, POLE_VAULT_URL } from '../services/poleVaultAccount';
const WINDOW=24*60*60*1000;
const COOLDOWN=60*1000;

/** Deterministic requested link recovery; no AI, follow-up creation, queue, or send retry. */
export async function handleLinkRecovery(event: JumpMessageEvent, account: InstagramAccount): Promise<boolean> {
  const m=event.message;
  if (!['mindset','full'].includes(getBotMode()) || !isMindsetAccountAllowed(account)
    || account.platform==='facebook' || !account.isActive || account.connectionStatus!=='connected'
    || account.userId!=='uqBSZBen8DPLxIkzMFH8tRle62F3'
    || !event.sender?.id || event.sender.id===account.instagramAccountId
    || event.recipient?.id!==account.instagramAccountId || !m?.mid || typeof m.text!=='string'
    || m.is_echo || m.is_self || m.is_deleted || m.app_id || m.quick_reply || event.postback || m.attachments?.length) return false;
  const text=m.text;
  if(isLinkOptOut(text) || requiresMindsetHumanHandoff(text)) return false;
  const names=mentionedAppTemplates(text);
  const choice=names.length===1 && normalizeMindsetText(text).replace(/[.!?]/g,'')===VERIFIED_APP_LINKS[names[0]].name.toLowerCase();
  if(!isLinkRecoveryRequest(text) && !choice) return false;
  const now=Date.now();const incomingAt=event.timestamp;
  if(typeof incomingAt!=='number'||!Number.isFinite(incomingAt)||incomingAt>now+COOLDOWN||now>=incomingAt+WINDOW-COOLDOWN) return true;
  const sender=event.sender.id;
  const conversationId=buildMindsetConversationId(account.id,sender);
  const stateRef=db.collection('app_link_recovery_recipients').doc(conversationId);
  const receiptRef=db.collection('app_link_recovery_events').doc(createHash('sha256').update(`${account.id}:${m.mid}`).digest('hex'));
  const leadRef=db.collection('mindset_leads').doc(conversationId);
  const directRef=db.collection('jump_dm_recipients').doc(conversationId);
  const result=await db.runTransaction(async transaction=>{
    const [receipt,state,lead,direct,campaigns,followups]=await Promise.all([
      transaction.get(receiptRef),transaction.get(stateRef),transaction.get(leadRef),transaction.get(directRef),
      transaction.get(db.collection('mindset_campaigns').where('accountId','==',account.id).limit(100)),
      transaction.get(db.collection('mindset_followups').where('leadId','==',conversationId).limit(20)),
    ]);
    if(receipt.exists)return {handled:true};
    const previous=state.data();const conversation=lead.data();
    const choosing=choice && previous?.awaitingChoice && now-(previous?.lastAttemptAt?.toMillis()||0)<WINDOW;
    if(choice&&!choosing)return {handled:false};
    if(lead.exists&&(!conversation||!isMindsetConversationIdentityMatch(conversation,{
      documentId:conversationId,accountId:account.id,instagramUserId:sender,ownerUserId:account.userId,
    })||conversation.automationPaused||conversation.stage==='human_handoff'))return {handled:true};
    const history=(conversation?.history||[]).filter((h:any)=>h.campaignSessionId===conversation?.campaignSessionId);
    if(history.some((h:any)=>h.role==='user'&&isLinkOptOut(h.content||'')))return {handled:true};
    if(!choosing&&now-(previous?.lastAttemptAt?.toMillis()||0)<COOLDOWN)return {handled:true};
    const stored=campaigns.docs.map(d=>d.data());
    const runtime=runtimeMindsetCampaign(account);
    if(runtime&&!stored.some(c=>c.status==='live'&&c.keyword===runtime.keyword))stored.push(runtime);
    const vault=isPoleVaultAccount(account);
    const available=new Set(stored.filter(c=>c.accountId===account.id&&c.ownerUserId===account.userId&&c.status==='live'
      &&isVerifiedCampaignUrl(c.template,c.journey?.destinationUrl)
      &&(!vault||(c.keyword==='VAULT'&&c.template==='vault_tracker_download'&&c.journey?.destinationUrl===POLE_VAULT_URL&&c.journey?.linkMessage===POLE_VAULT_LINK_MESSAGE))).map(c=>c.template));
    if(available.size===0)return {handled:true};
    const contexts:Array<{template:string;at:number}>=[];
    const campaignAt=Math.max(0,...history.map((h:any)=>h.at?.toMillis?.()||0));
    if(conversation&&available.has(conversation.campaignTemplate)&&now-campaignAt<WINDOW
      &&isVerifiedCampaignUrl(conversation.campaignTemplate,conversation.campaignJourney?.destinationUrl))contexts.push({template:conversation.campaignTemplate,at:campaignAt});
    const directData=direct.data();
    if((directData?.template==='trackjump_download'||(vault&&directData?.template==='vault_tracker_download'))&&available.has(directData.template)&&now-(directData.lastAttemptAt?.toMillis()||0)<WINDOW)contexts.push({template:directData.template,at:directData.lastAttemptAt.toMillis()});
    if(previous?.template&&available.has(previous.template)&&now-(previous.lastAttemptAt?.toMillis()||0)<WINDOW)contexts.push({template:previous.template,at:previous.lastAttemptAt.toMillis()});
    contexts.sort((a,b)=>b.at-a.at);
    let template: string | undefined=choosing&&available.has(names[0])?names[0]:contexts[0]?.template;
    if(!choosing&&(names.length>1||(names.length===1&&names[0]!==template)
      ||(contexts[1]&&contexts[0].template!==contexts[1].template&&Math.abs(contexts[0].at-contexts[1].at)<1000)))template=undefined;
    const reply=template?(vault&&template==='vault_tracker_download'?POLE_VAULT_REPLY:`Here you go!\n\n${VERIFIED_APP_LINKS[template].url}`):`Which app link do you need? Reply with ${Array.from(available).map(t=>VERIFIED_APP_LINKS[t].name).join(', ')}.`;
    const at=admin.firestore.Timestamp.fromMillis(now);
    transaction.create(receiptRef,{accountId:account.id,recipientId:sender,status:'reserved',createdAt:at,template:template||null});
    transaction.set(stateRef,{accountId:account.id,recipientId:sender,lastAttemptAt:at,awaitingChoice:!template,template:template||null});
    if(lead.exists)transaction.update(leadRef,{lastUserInteractionAt:admin.firestore.Timestamp.fromMillis(incomingAt),unansweredFollowUpCount:0,updatedAt:at});
    for(const followup of followups.docs)if(followup.data().status==='pending')transaction.update(followup.ref,{status:'cancelled',cancelReason:'user_requested_link',updatedAt:at});
    return {handled:true,reply};
  });
  if(!result.reply)return result.handled;
  let sent=false;
  try {sent=await sendInstagramDMOnce(sender,result.reply,account,incomingAt+WINDOW-COOLDOWN);}
  finally {await receiptRef.update({status:sent?'sent':'not_confirmed',updatedAt:admin.firestore.Timestamp.now()});}
  return true;
}
