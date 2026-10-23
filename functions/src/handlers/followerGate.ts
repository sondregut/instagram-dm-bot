import { createHash, randomUUID } from 'crypto';
import { isSondreVaultTrainingDestination } from '../services/vaultTrainingDestination';
import * as admin from 'firebase-admin';
import { db, InstagramAccount } from '../firebase';
import { getBotMode, isMindsetModeActive } from '../utils/runtimeMode';
import { getStoredMindsetCampaigns, runtimeMindsetCampaign, isMindsetAccountAllowed, MindsetCampaign } from '../services/mindsetCampaigns';
import { buildMindsetConversationId, isMindsetConversationIdentityMatch } from '../services/mindsetConversationIsolation';
import { classifyMindsetReplyForStage, isMindsetDirectKeywordRequest, normalizeMindsetText, requiresMindsetHumanHandoff } from '../services/mindsetFlowLogic';
import { isLinkOptOut, isLinkRecoveryRequest, isVerifiedCampaignUrl, mentionedAppTemplates, VERIFIED_APP_LINKS } from '../services/linkRecoveryLogic';
import { sendInstagramDMOnce, sendInstagramGatePromptOnce } from '../services/instagram';
import { verifyFollower } from '../services/followerVerification';
import { followerDirectKeywordCampaigns } from '../services/followerDirectKeywords';
import { isTrackSpeedOnlyAccount, isTrackSpeedOnlyScope } from '../services/trackSpeedOnlyPolicy';
import { trackSpeedCommentCampaign, isCurrentTrackSpeedCommentLead } from '../services/trackSpeedCommentCampaign';
import { enqueueAppLinkFollowUp, recordAppLinkFollowUpInteraction } from '../services/appLinkFollowUps';
import { isFollowerGateEnabled, isFollowerGateRecipientBlocked, followerGatePrompt, followerGateRetry, followerGateButtonTitle, FOLLOWER_RECHECK_MS,
  FOLLOWER_LINK_COOLDOWN_MS, FOLLOWER_WINDOW_MS, FOLLOWER_WINDOW_MARGIN_MS, withVerifiedFollowerLink } from '../services/followerGatePolicy';

export interface FollowerGateEvent {
  sender?: { id?: string }; recipient?: { id?: string }; timestamp?: number;
  postback?: { mid?: string; payload?: string };
  message?: { mid?: string; text?: string; is_echo?: boolean; is_self?: boolean; is_deleted?: boolean;
    app_id?: unknown; attachments?: unknown[]; quick_reply?: { payload?: string } };
}
const millis = (value: any): number => value?.toMillis?.() || 0;
const optOut = (text: string): boolean => isLinkOptOut(text)
  || /^stop[.!?]*$/.test(normalizeMindsetText(text))
  || classifyMindsetReplyForStage(text, 'awaiting_link_request') === 'not_interested';

// These words do not independently request an app or consent to a bot conversation.
const bareConfirmation = (text: string): boolean => /^(?:yes(?: please| i did)?|yeah|yep|yup|sure(?: did)?|please|ok|okay|i did|already did|done|(?:send|share|drop|give)(?: me)? (?:it|that))[.!\s]*$/
  .test(normalizeMindsetText(text));

function recentCampaignConfirmation(lead: any, identity: Parameters<typeof isMindsetConversationIdentityMatch>[1],
  campaigns: MindsetCampaign[], incomingAt: number, now: number): string | null {
  if (!lead || !isMindsetConversationIdentityMatch(lead, identity) || lead.automationPaused
    || !lead.campaignSessionId || !['awaiting_link_request', 'link_sent', 'awaiting_download_status', 'awaiting_use_status'].includes(lead.stage)
    || !campaigns.some(c => c.id === lead.campaignId && c.template === lead.campaignTemplate
      && c.journey.destinationUrl === lead.campaignJourney?.destinationUrl)) return null;
  const history = (lead.history || []).filter((h: any) => h.conversationId === identity.documentId
    && h.campaignSessionId === lead.campaignSessionId);
  const prompt = history[history.length - 1];
  const at = millis(prompt?.at);
  if (prompt?.role !== 'assistant' || prompt.source === 'human' || !at || at > incomingAt
    || now - at >= FOLLOWER_WINDOW_MS - FOLLOWER_WINDOW_MARGIN_MS) return null;
  const content = normalizeMindsetText(prompt.content || '');
  const expectsLink = ['awaiting_link_request', 'link_sent'].includes(lead.stage);
  if (expectsLink
    ? !/\blink\b/.test(content) || !/\b(?:tap|click|reply|want|send|get)\b/.test(content)
    : !content.includes('?') || !/\b(?:app|download|downloaded|open|opened|install|installed|try|tried|use|used|rep|session)\b/.test(content)) return null;
  return JSON.stringify([lead.campaignId, lead.campaignSessionId, lead.stage, at, prompt.content]);
}

/** All gated link sends are responses to this fresh inbound event. No timers, queues or replay. */
export async function handleFollowerGateMessage(event: FollowerGateEvent, account: InstagramAccount,
  options: { forceLinkRequest?: boolean } = {}): Promise<boolean> {
  const speedOnly = isTrackSpeedOnlyAccount(account);
  if (isTrackSpeedOnlyScope(account) && !speedOnly) return true;
  if (speedOnly && !isMindsetModeActive()) return true;
  if (!isFollowerGateEnabled(account) || (!speedOnly && !isMindsetAccountAllowed(account))
    || !['mindset', 'full'].includes(getBotMode())) return false;
  const m = event.message; const sender = event.sender?.id; const text = m?.text || '';
  const payload = m?.quick_reply?.payload || event.postback?.payload || '';
  if (!account.isActive || account.connectionStatus !== 'connected' || !sender
    || !/^[a-zA-Z0-9_-]{1,200}$/.test(sender) || sender === account.instagramAccountId
    || event.recipient?.id !== account.instagramAccountId || m?.is_echo || m?.is_self
    || m?.is_deleted || m?.app_id) return true;
  const now = Date.now(); const incomingAt = event.timestamp;
  if (typeof incomingAt !== 'number' || !Number.isFinite(incomingAt) || incomingAt > now + 60000
    || now >= incomingAt + FOLLOWER_WINDOW_MS - FOLLOWER_WINDOW_MARGIN_MS) return true;
  if ((m?.mid && (text.trim() || m.attachments?.length || m.quick_reply?.payload)) || event.postback?.payload) {
    await recordAppLinkFollowUpInteraction(account, sender, incomingAt);
  }
  if (m?.attachments?.length) return false;
  if (optOut(text) || requiresMindsetHumanHandoff(text)) {
    const id = buildMindsetConversationId(account.id, sender);
    const state = db.collection('follower_gate_recipients').doc(id);
    const existingLead = await db.collection('mindset_leads').doc(id).get();
    await state.set({ accountId: account.id, recipientId: sender,
      ...(optOut(text) ? { optedOut: true } : { humanHandoff: true,
        humanHandoffAt: admin.firestore.Timestamp.now(), handoffHadLead: existingLead.exists }),
      lastInboundAt: admin.firestore.Timestamp.fromMillis(incomingAt),
    }, { merge: true });
    if (optOut(text)) {
      if (existingLead.exists) await existingLead.ref.update({
        lastUserInteractionAt: admin.firestore.Timestamp.fromMillis(incomingAt),
        updatedAt: admin.firestore.Timestamp.now(),
        history: admin.firestore.FieldValue.arrayUnion({ role: 'user', content: text,
          at: admin.firestore.Timestamp.fromMillis(incomingAt), conversationId: id,
          ...(existingLead.data()?.campaignSessionId ? { campaignSessionId: existingLead.data()!.campaignSessionId } : {}),
        }),
      });
      return true;
    }
    return false; // Existing conversation handling still records opt-out or human handoff.
  }
  const normalized = normalizeMindsetText(text).replace(/[.!?]+$/g, '');
  const isRecheck = payload.startsWith('follow_gate:check:') || /^(?:check again|i(?:'m| am) following|i(?: have|'ve)? followed|done)$/.test(normalized);
  const isLinkButton = payload.startsWith('mindset:send_link:');
  const possibleKeyword = !payload && Boolean(text.trim()) && !/https?:\/\//i.test(text);
  const confirmation = !payload && bareConfirmation(text);
  let recovery = !payload && (isLinkRecoveryRequest(text)
    || (!confirmation && classifyMindsetReplyForStage(text, 'awaiting_link_request') === 'app_link_request'));
  const appNames = mentionedAppTemplates(text);
  if (speedOnly && !payload && appNames.some(template => template !== 'trackspeed_download')) return true;
  const appChoice = appNames.length === 1 && normalized === VERIFIED_APP_LINKS[appNames[0]].name.toLowerCase();
  if (!isRecheck && !isLinkButton && !possibleKeyword && !recovery && !appChoice && !options.forceLinkRequest) return false;
  const expiresAt = incomingAt + FOLLOWER_WINDOW_MS - FOLLOWER_WINDOW_MARGIN_MS;
  const mid = m?.mid || event.postback?.mid || (payload ? `postback:${incomingAt}:${payload}` : '');
  if (!mid || typeof mid !== 'string') return true;
  const conversationId = buildMindsetConversationId(account.id, sender);
  const leadRef = db.collection('mindset_leads').doc(conversationId);
  const stateRef = db.collection('follower_gate_recipients').doc(conversationId);
  const receiptRef = db.collection('follower_gate_events').doc(createHash('sha256').update(`${account.id}:${mid}`).digest('hex'));
  const [leadSnapshot, stateSnapshot, stored, directSnapshot, recoverySnapshot] = await Promise.all([
    leadRef.get(), stateRef.get(), speedOnly ? Promise.resolve([] as MindsetCampaign[]) : getStoredMindsetCampaigns(account.id),
    db.collection('jump_dm_recipients').doc(conversationId).get(),
    db.collection('app_link_recovery_recipients').doc(conversationId).get(),
  ]);
  const lead = leadSnapshot.data(); const prior = stateSnapshot.data();
  if (isFollowerGateRecipientBlocked(prior, lead)) return true;
  const runtime = runtimeMindsetCampaign(account);
  if (runtime && !stored.some(c => c.status === 'live' && c.keyword === runtime.keyword)) stored.push(runtime);
  const speedComment = speedOnly ? trackSpeedCommentCampaign(account) : null;
  const directCampaigns = speedOnly ? (speedComment ? [speedComment] : []) : followerDirectKeywordCampaigns(account);
  const campaigns = [...stored, ...directCampaigns].filter(c => c.status === 'live' && c.accountId === account.id
    && c.ownerUserId === account.userId && (isVerifiedCampaignUrl(c.template, c.journey.destinationUrl)
      || isSondreVaultTrainingDestination(account, c)));
  if (campaigns.length === 0) return true;
  const identity = { documentId: conversationId, accountId: account.id, instagramUserId: sender, ownerUserId: account.userId };
  const blockedLead = (value: any) => value && (!isMindsetConversationIdentityMatch(value, identity)
    || value.automationPaused || value.stage === 'human_handoff'
    || (value.history || []).some((h: any) => h.role === 'user' && h.campaignSessionId === value.campaignSessionId && optOut(h.content || '')));
  if (blockedLead(lead) || (speedOnly && !isCurrentTrackSpeedCommentLead(lead, account, sender, incomingAt, now))) return true;
  const confirmationContext = confirmation
    ? recentCampaignConfirmation(lead, identity, campaigns, incomingAt, now) : null;
  // A typed "done" can still recheck an explicit, unexpired follower prompt.
  const pendingRecheck = isRecheck && prior?.campaignId && millis(prior.expiresAt) > now
    && campaigns.some(c => c.id === prior.campaignId && c.template === prior.template);
  if (confirmation) {
    // Consume an unscoped confirmation here so neither recovery nor AI can reply.
    if (!confirmationContext && !pendingRecheck) return true;
    if (confirmationContext) {
      const intent = classifyMindsetReplyForStage(text, lead?.stage || '');
      if (intent === 'downloaded' || intent === 'used') return false;
      if (intent !== 'app_link_request' && !isRecheck) return true;
      recovery = intent === 'app_link_request';
    }
  }
  // Only explicit keyword requests enter from DMs; incidental mentions stay silent.
  // TrackSpeed continues to have no direct-message keyword entry.
  const explicitMatches = !speedOnly && possibleKeyword ? directCampaigns.filter(c => isMindsetDirectKeywordRequest(text, c.keyword)) : [];
  const directMatches = explicitMatches.length ? explicitMatches
    : !speedOnly && possibleKeyword ? stored.filter(c => campaigns.includes(c) && isMindsetDirectKeywordRequest(text, c.keyword)) : [];
  if (!isRecheck && !isLinkButton && directMatches.length === 0 && !recovery && !appChoice && !options.forceLinkRequest) return false;
  if (appChoice && !prior?.awaitingChoice && directMatches.length === 0) return false;
  const recheckUsesPending = isRecheck && Boolean(prior?.campaignId);
  let selected: MindsetCampaign | undefined;
  if (isLinkButton) {
    if (!lead || payload !== `mindset:send_link:${lead.linkToken}`) return true;
    selected = campaigns.find(c => c.id === lead.campaignId && c.template === lead.campaignTemplate);
  } else if (isRecheck) {
    if (recheckUsesPending) {
      if (millis(prior?.expiresAt) <= now
        || (payload && payload !== `follow_gate:check:${prior?.checkToken}`)) return true;
      selected = campaigns.find(c => c.id === prior?.campaignId && c.template === prior?.template);
    } else {
      // A typed reply to the opening comment DM is also an opt-in, not proof of follow.
      const latestComment = Math.max(0, ...(lead?.history || []).filter((h: any) => h.role === 'user'
        && h.campaignSessionId === lead?.campaignSessionId && /^\[Comment\]/.test(h.content || '')).map((h: any) => millis(h.at)));
      if (payload || lead?.stage !== 'awaiting_link_request' || now - latestComment >= FOLLOWER_WINDOW_MS) return true;
      selected = campaigns.find(c => c.id === lead?.campaignId && c.template === lead?.campaignTemplate);
    }
  } else if (confirmationContext) selected = campaigns.find(c => c.id === lead?.campaignId && c.template === lead?.campaignTemplate);
  else if (directMatches.length > 0) selected = directMatches.length === 1 ? directMatches[0] : undefined;
  else if (appChoice) selected = campaigns.find(c => c.template === appNames[0]);
  else {
    const contexts: Array<{ template: string; at: number }> = [];
    const historyAt = Math.max(0, ...(lead?.history || []).filter((h: any) => h.campaignSessionId === lead?.campaignSessionId).map((h: any) => millis(h.at)));
    if (lead?.campaignTemplate && now - historyAt < FOLLOWER_WINDOW_MS) contexts.push({ template: lead.campaignTemplate, at: historyAt });
    for (const context of [prior, directSnapshot.data(), recoverySnapshot.data()]) {
      const at = millis(context?.lastInboundAt) || millis(context?.lastAttemptAt);
      if (context?.template && now - at < FOLLOWER_WINDOW_MS) contexts.push({ template: context.template, at });
    }
    contexts.sort((a, b) => b.at - a.at);
    if (contexts[0] && !(contexts[1] && contexts[0].template !== contexts[1].template && Math.abs(contexts[0].at - contexts[1].at) < 1000)) {
      selected = campaigns.find(c => c.template === contexts[0].template);
    }
    if (appNames.length > 1 || (appNames.length === 1 && appNames[0] !== selected?.template)) selected = undefined;
  }
  // An unscoped link request cannot start a campaign or a chooser on this account.
  if (speedOnly && !selected) return true;
  const expected = selected; const checkToken = randomUUID();
  const reservation = await db.runTransaction(async tx => {
    const [receipt, state, currentLead, currentCampaign, followups] = await Promise.all([
      tx.get(receiptRef), tx.get(stateRef), tx.get(leadRef),
      expected && expected.id !== 'runtime-default' && !directCampaigns.some(c => c.id === expected.id)
        ? tx.get(db.collection('mindset_campaigns').doc(expected.id)) : Promise.resolve(null),
      tx.get(db.collection('mindset_followups').where('leadId', '==', conversationId).limit(20)),
    ]);
    if (receipt.exists || blockedLead(currentLead.data())) return null;
    if (speedOnly && (!isCurrentTrackSpeedCommentLead(currentLead.data(), account, sender, incomingAt, Date.now())
      || currentLead.data()?.campaignSessionId !== lead?.campaignSessionId)) return null;
    if (confirmationContext && recentCampaignConfirmation(currentLead.data(), identity, campaigns, incomingAt, Date.now()) !== confirmationContext) return null;
    const stateData = state.data();
    if (isFollowerGateRecipientBlocked(stateData, currentLead.data())) return null;
    if (millis(stateData?.lastInboundAt) > incomingAt || now - millis(stateData?.lastAttemptAt) < FOLLOWER_RECHECK_MS) return null;
    if (now - Math.max(millis(stateData?.lastLinkSentAt), millis(directSnapshot.data()?.lastAttemptAt)) < FOLLOWER_LINK_COOLDOWN_MS) return null;
    if (recheckUsesPending && (stateData?.checkToken !== prior?.checkToken || millis(stateData?.expiresAt) <= now)) return null;
    if (isLinkButton && currentLead.data()?.linkToken !== lead?.linkToken) return null;
    if (currentCampaign) {
      const c = currentCampaign.data();
      if (!c || c.status !== 'live' || c.accountId !== account.id || c.ownerUserId !== account.userId
        || c.template !== expected?.template || c.journey?.destinationUrl !== expected?.journey.destinationUrl
        || c.journey?.linkMessage !== expected?.journey.linkMessage) return null;
      if (isSondreVaultTrainingDestination(account, expected!) && c.keyword !== 'VAULT') return null;
    }
    const at = admin.firestore.Timestamp.fromMillis(now);
    tx.create(receiptRef, { accountId: account.id, recipientId: sender, campaignId: expected?.id || null,
      template: expected?.template || null, status: 'reserved', createdAt: at,
      incomingAt: admin.firestore.Timestamp.fromMillis(incomingAt), expiresAt: admin.firestore.Timestamp.fromMillis(expiresAt) });
    tx.set(stateRef, { accountId: account.id, recipientId: sender, campaignId: expected?.id || null,
      template: expected?.template || null, awaitingChoice: !expected, checkToken,
      lastAttemptAt: at, lastInboundAt: admin.firestore.Timestamp.fromMillis(incomingAt),
      expiresAt: admin.firestore.Timestamp.fromMillis(expiresAt) }, { merge: true });
    if (currentLead.exists) tx.update(leadRef, { lastUserInteractionAt: admin.firestore.Timestamp.fromMillis(incomingAt), unansweredFollowUpCount: 0, updatedAt: at });
    for (const f of followups.docs) if (f.data().status === 'pending') tx.update(f.ref, { status: 'cancelled', cancelReason: 'follower_gate_user_interaction', updatedAt: at });
    return { checkToken };
  });
  if (!reservation) return true;
  if (!expected) {
    const choices = [...new Set(campaigns.map(c => VERIFIED_APP_LINKS[c.template].name))];
    const sent = await sendInstagramDMOnce(sender, `Which app link do you need? Reply with ${choices.join(', ')}.`, account, expiresAt);
    await receiptRef.update({ status: sent ? 'choice_sent' : 'not_confirmed', updatedAt: admin.firestore.Timestamp.now() });
    return true;
  }
  const result = await verifyFollower(account, sender, true);
  await receiptRef.update({ follows: result.follows, followerCheckedAt: admin.firestore.Timestamp.fromMillis(result.checkedAt),
    followerCheckSource: result.source, followerCheckErrorCode: result.errorCode || null });
  // Recheck human ownership and ordering after the external API wait, immediately before sending.
  const [latestLead, latestState] = await Promise.all([leadRef.get(), stateRef.get()]);
  if (blockedLead(latestLead.data()) || isFollowerGateRecipientBlocked(latestState.data(), latestLead.data())
    || (speedOnly && (!isCurrentTrackSpeedCommentLead(latestLead.data(), account, sender, incomingAt, Date.now())
      || latestLead.data()?.campaignSessionId !== lead?.campaignSessionId))
    || (confirmationContext && recentCampaignConfirmation(latestLead.data(), identity, campaigns, incomingAt, Date.now()) !== confirmationContext)
    || latestState.data()?.checkToken !== reservation.checkToken || Date.now() >= expiresAt) {
    await receiptRef.update({ status: 'blocked_before_send', updatedAt: admin.firestore.Timestamp.now() }); return true;
  }
  const link = `${expected.journey.linkMessage}\n\n${expected.journey.destinationUrl}`;
  let sent = false;
  if (result.follows === true) {
    sent = await withVerifiedFollowerLink(account.id, sender, link, result.checkedAt, expiresAt,
      () => sendInstagramDMOnce(sender, link, account, expiresAt));
    if (sent) {
      const at = admin.firestore.Timestamp.now();
      await stateRef.set({ lastLinkSentAt: at }, { merge: true });
      const current = latestLead.data();
      if (latestLead.exists && current?.campaignTemplate === expected.template) await leadRef.update({
        stage: 'link_sent', updatedAt: at, history: admin.firestore.FieldValue.arrayUnion({
          role: 'assistant', content: link, at, source: 'automation', conversationId,
          ...(current.campaignSessionId ? { campaignSessionId: current.campaignSessionId } : {}),
        }),
      });
    }
  } else {
    sent = await sendInstagramGatePromptOnce(sender, result.follows === false ? followerGatePrompt(account) : followerGateRetry(account),
      [{ title: followerGateButtonTitle(account), payload: `follow_gate:check:${reservation.checkToken}` }], account, expiresAt);
  }
  await receiptRef.update({ status: sent ? result.follows === true ? 'link_sent' : result.follows === false ? 'follow_prompt_sent' : 'retry_prompt_sent' : 'not_confirmed',
    ...(sent && result.follows === true ? { linkDeliveredAt: admin.firestore.Timestamp.now() } : {}),
    updatedAt: admin.firestore.Timestamp.now() });
  // The website campaign is not an app download; do not enqueue an app-use reminder.
  if (sent && result.follows === true && !isSondreVaultTrainingDestination(account, expected)) {
    await enqueueAppLinkFollowUp(account, receiptRef.id);
  }
  console.log(`[FollowGate] account=${account.id} follows=${String(result.follows)} source=${result.source} sent=${sent}`);
  return true;
}
