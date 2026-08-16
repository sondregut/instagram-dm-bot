const assert = require('node:assert/strict');
const test = require('node:test');
const { randomUUID } = require('node:crypto');

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('This integration test must run against the Firestore emulator');
}

process.env.BOT_MODE = 'test';
process.env.MINDSET_AUTOMATION_ENABLED = 'true';
process.env.MINDSET_TARGET_ACCOUNT_USERNAME = 'sondre_pv';
process.env.MINDSET_TRIGGER_KEYWORD = 'ADMINTEST123';

const admin = require('firebase-admin');
const instagram = require('../lib/services/instagram');
const ai = require('../lib/services/ai');
const profiles = require('../lib/services/mindsetProfiles');
const {
  RESETTABLE_CONVERSATION_COLLECTIONS,
  resetConversationDataForInstagramUsername,
} = require('../lib/services/mindsetConversationReset');

const outbound = [];
const aiRequests = [];
let failPrivateReply = false;

instagram.sendInstagramPrivateReply = async (commentId, message, replies) => {
  outbound.push({ kind: 'private_reply', commentId, message, replies });
  return !failPrivateReply;
};
instagram.replyToComment = async (commentId, message) => {
  outbound.push({ kind: 'public_reply', commentId, message });
  return true;
};
instagram.sendInstagramButtonDM = async (recipientId, message, buttons) => {
  outbound.push({ kind: 'button_dm', recipientId, message, buttons });
  return true;
};
instagram.sendInstagramDM = async (recipientId, message, _account, context) => {
  outbound.push({ kind: 'dm', recipientId, message, conversationId: context?.conversationId });
  return true;
};
profiles.refreshMindsetLeadProfile = async () => {};
ai.generateIsolatedAIResponseWithStatus = async (systemPrompt, history) => {
  const currentMessage = history.at(-1)?.content || '';
  const scopeClassifier = /strict routing classifier/i.test(systemPrompt);
  aiRequests.push({ systemPrompt, history, scopeClassifier });
  if (scopeClassifier) {
    if (/refusjon|hacerme daño/i.test(currentMessage)) {
      return { text: 'HUMAN_REQUIRED', usedAI: true };
    }
    if (/poles? and spikes?|what poles do you use|music do athletes listen|private messages/i.test(currentMessage)) {
      return { text: 'OFF_TOPIC', usedAI: true };
    }
    if (/what about that thing/i.test(currentMessage)) {
      return { text: 'UNCERTAIN', usedAI: true };
    }
    return { text: 'IN_SCOPE', usedAI: true };
  }
  if (/refusjon|hacerme daño/i.test(currentMessage)) {
    return { text: '[[HANDOFF]]', usedAI: true };
  }
  return {
    text: 'I can help with that. What would you like to know first?',
    usedAI: true,
  };
};

const { db } = require('../lib/firebase');
const {
  handleMindsetComment,
  handleMindsetMessage,
  processMindsetFollowUps,
  recordMindsetActivationEvent,
  recordMindsetConversionEvent,
  recordMindsetDownloadClick,
} = require('../lib/handlers/mindsetHandler');
const {
  DEFAULT_MINDSET_CAMPAIGN_JOURNEY,
  DEFAULT_VAULT_CAMPAIGN_JOURNEY,
} = require('../lib/services/mindsetCampaignJourney');
const { ANDROID_AVAILABILITY_REPLY } = require('../lib/services/mindsetProductKnowledge');
const { buildMindsetConversationId } = require('../lib/services/mindsetConversationIsolation');

const ownerUserId = 'owner-e2e';
const accountId = 'account-e2e';
const campaignId = 'campaign-e2e';
const vaultCampaignId = 'vault-campaign-e2e';
const account = {
  id: accountId,
  userId: ownerUserId,
  username: 'sondre_pv',
  instagramAccountId: 'ig-account-e2e',
  pageId: 'page-e2e',
  accessToken: 'IGTEST',
  aiPersonality: {
    name: 'Test',
    description: 'Test',
    systemPrompt: 'Test',
    tone: 'friendly',
    goals: [],
  },
  settings: {
    maxResponseLength: 200,
    collectEmail: false,
    collectPhone: false,
    autoWelcomeNewFollowers: false,
    businessHoursOnly: false,
    notifyOnNewLead: false,
    notifyOnHandoff: false,
  },
  isActive: true,
  connectionStatus: 'connected',
  createdAt: admin.firestore.Timestamp.now(),
};

function comment(id, instagramUserId, text = 'ADMINTEST123') {
  return {
    id,
    media: { id: 'media-e2e' },
    from: { id: instagramUserId, username: `user_${instagramUserId}` },
    text,
  };
}

function message(instagramUserId, text, recipientId = account.instagramAccountId) {
  return {
    sender: { id: instagramUserId },
    recipient: { id: recipientId },
    message: { text },
  };
}

function attachmentMessage(instagramUserId, text = '') {
  return {
    sender: { id: instagramUserId },
    recipient: { id: account.instagramAccountId },
    message: {
      text,
      attachments: [{ type: 'image', payload: { url: 'https://example.com/test.jpg' } }],
    },
  };
}

function quickReply(instagramUserId, payload) {
  return {
    sender: { id: instagramUserId },
    recipient: { id: account.instagramAccountId },
    message: { text: 'Button reply', quick_reply: { payload } },
  };
}

function followUpId(leadId, type) {
  return `${leadId}_${type}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 500);
}

async function leadFor(instagramUserId) {
  const id = buildMindsetConversationId(accountId, instagramUserId);
  const snapshot = await db.collection('mindset_leads').doc(id).get();
  assert.equal(snapshot.exists, true, `missing lead ${id}`);
  return { id, ref: snapshot.ref, data: snapshot.data() };
}

async function seedLead(instagramUserId, overrides = {}) {
  const id = buildMindsetConversationId(accountId, instagramUserId);
  const now = admin.firestore.Timestamp.now();
  const data = {
    id,
    accountId,
    ownerUserId,
    instagramUserId,
    username: `user_${instagramUserId}`,
    initialCommentId: `seed-${instagramUserId}`,
    initialMediaId: 'media-e2e',
    campaignId,
    campaignName: 'End-to-end test',
    campaignJourney: DEFAULT_MINDSET_CAMPAIGN_JOURNEY,
    triggerKeyword: 'ADMINTEST123',
    linkToken: randomUUID(),
    stage: 'link_sent',
    lastUserInteractionAt: now,
    unansweredFollowUpCount: 0,
    history: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
  await db.collection('mindset_leads').doc(id).set(data);
  return { id, ref: db.collection('mindset_leads').doc(id), data };
}

async function seedDueFollowUp(leadId, type) {
  const now = admin.firestore.Timestamp.now();
  const id = followUpId(leadId, type);
  await db.collection('mindset_followups').doc(id).set({
    id,
    leadId,
    accountId,
    type,
    status: 'pending',
    dueAt: admin.firestore.Timestamp.fromMillis(now.toMillis() - 1_000),
    createdAt: now,
    updatedAt: now,
  });
  return db.collection('mindset_followups').doc(id);
}

test('runs the protected comment, DM, tracking, AI, isolation, and follow-up journey', async () => {
  await db.collection('accounts').doc(accountId).set(account);
  await db.collection('mindset_campaigns').doc(campaignId).set({
    id: campaignId,
    ownerUserId,
    accountId,
    name: 'End-to-end test',
    keyword: 'ADMINTEST123',
    postIds: [],
    postMode: 'any',
    status: 'test',
    publicReplyEnabled: true,
    publicReplyText: 'Sent it. Check your DMs!',
    journey: DEFAULT_MINDSET_CAMPAIGN_JOURNEY,
    template: 'athlete_mindset_download',
  });
  await db.collection('mindset_campaigns').doc(vaultCampaignId).set({
    id: vaultCampaignId,
    ownerUserId,
    accountId,
    name: 'Vault download test',
    keyword: 'VAULT',
    postIds: [],
    postMode: 'any',
    status: 'test',
    publicReplyEnabled: true,
    publicReplyText: 'Sent the Vault link. Check your DMs!',
    journey: DEFAULT_VAULT_CAMPAIGN_JOURNEY,
    template: 'vault_tracker_download',
  });

  const userOne = 'ig-user-one';
  const firstComment = comment('comment-one', userOne);
  assert.equal(await handleMindsetComment(firstComment, account), true);
  assert.deepEqual(outbound.slice(0, 2).map((item) => item.kind), ['private_reply', 'public_reply']);
  assert.equal(outbound[0].replies[0].title, 'Send me the link');
  assert.match(outbound[1].message, /Check your DMs/);

  let leadOne = await leadFor(userOne);
  assert.equal(leadOne.data.stage, 'awaiting_link_request');
  assert.equal(leadOne.data.history.length, 2);
  assert.equal(leadOne.data.accountId, accountId);
  assert.equal(leadOne.data.instagramUserId, userOne);

  const sentBeforeDuplicate = outbound.length;
  assert.equal(await handleMindsetComment(firstComment, account), true);
  assert.equal(outbound.length, sentBeforeDuplicate, 'duplicate comment sent messages twice');

  const missingButtonUser = 'ig-missing-button';
  await handleMindsetComment(comment('comment-missing-button', missingButtonUser), account);
  const missingButtonBefore = outbound.length;
  const aiBeforeMissingButton = aiRequests.length;
  await handleMindsetMessage(message(missingButtonUser, 'link'), account);
  assert.deepEqual(
    outbound.slice(missingButtonBefore).map((item) => item.message),
    ['here you go! hope you like it', 'https://athletemindset.app/app']
  );
  assert.equal(aiRequests.length, aiBeforeMissingButton, 'missing-button fallback unexpectedly called Claude');
  assert.equal((await leadFor(missingButtonUser)).data.stage, 'link_sent');

  const initialLinkBefore = outbound.length;
  assert.equal(await handleMindsetMessage(
    quickReply(userOne, `mindset:send_link:${leadOne.data.linkToken}`),
    account
  ), true);
  assert.deepEqual(
    outbound.slice(initialLinkBefore).map((item) => ({
      kind: item.kind,
      message: item.message,
      recipientId: item.recipientId,
      conversationId: item.conversationId,
    })),
    [
      {
        kind: 'dm',
        message: 'here you go! hope you like it',
        recipientId: userOne,
        conversationId: leadOne.id,
      },
      {
        kind: 'dm',
        message: 'https://athletemindset.app/app',
        recipientId: userOne,
        conversationId: leadOne.id,
      },
    ]
  );

  leadOne = await leadFor(userOne);
  assert.equal(leadOne.data.stage, 'link_sent');
  const missingDeliveryBefore = outbound.length;
  const aiBeforeMissingDelivery = aiRequests.length;
  await handleMindsetMessage(message(userOne, "i didn't get it"), account);
  assert.deepEqual(
    outbound.slice(missingDeliveryBefore).map((item) => item.message),
    ['here you go! hope you like it', 'https://athletemindset.app/app']
  );
  assert.equal(aiRequests.length, aiBeforeMissingDelivery, 'failed link delivery unexpectedly called Claude');
  assert.equal((await leadFor(userOne)).data.stage, 'link_sent');

  let linkReminder = await db.collection('mindset_followups')
    .doc(followUpId(leadOne.id, 'link_reminder')).get();
  assert.equal(linkReminder.data().status, 'pending');

  const destination = await recordMindsetDownloadClick(leadOne.data.linkToken);
  assert.ok(destination);
  const destinationUrl = new URL(destination);
  assert.equal(destinationUrl.origin + destinationUrl.pathname, 'https://athletemindset.app/app');
  assert.equal(destinationUrl.searchParams.get('utm_source'), 'instagram');
  assert.equal(destinationUrl.searchParams.get('ig_lead'), leadOne.data.linkToken);

  leadOne = await leadFor(userOne);
  assert.equal(leadOne.data.stage, 'link_clicked');
  assert.ok(leadOne.data.downloadClickedAt);
  let downloadCheck = await db.collection('mindset_followups')
    .doc(followUpId(leadOne.id, 'download_check')).get();
  assert.equal(downloadCheck.data().status, 'pending');

  assert.equal(await recordMindsetActivationEvent(leadOne.data.linkToken, 'app_opened'), true);
  linkReminder = await linkReminder.ref.get();
  downloadCheck = await downloadCheck.ref.get();
  assert.equal(linkReminder.data().status, 'cancelled');
  assert.equal(downloadCheck.data().status, 'cancelled');
  let useCheck = await db.collection('mindset_followups')
    .doc(followUpId(leadOne.id, 'use_check')).get();
  assert.equal(useCheck.data().status, 'pending');

  assert.equal(await recordMindsetActivationEvent(leadOne.data.linkToken, 'first_rep_started'), true);
  useCheck = await useCheck.ref.get();
  assert.equal(useCheck.data().status, 'cancelled');
  assert.equal(await recordMindsetActivationEvent(leadOne.data.linkToken, 'first_rep_completed'), true);
  let feedbackCheck = await db.collection('mindset_followups')
    .doc(followUpId(leadOne.id, 'feedback_check')).get();
  assert.equal(feedbackCheck.data().status, 'pending');

  assert.equal(await recordMindsetConversionEvent(
    leadOne.data.linkToken,
    'subscribed',
    'revenuecat-e2e'
  ), true);
  feedbackCheck = await feedbackCheck.ref.get();
  assert.equal(feedbackCheck.data().status, 'cancelled');
  leadOne = await leadFor(userOne);
  assert.equal(leadOne.data.stage, 'subscribed');
  assert.ok(leadOne.data.subscriptionVerifiedAt);

  const userTwo = 'ig-user-two';
  const userThree = 'ig-user-three';
  await handleMindsetComment(comment('comment-two', userTwo, 'ADMINTEST123 USER_TWO_ONLY'), account);
  await handleMindsetComment(comment('comment-three', userThree), account);
  const outboundBeforeAI = outbound.length;
  assert.equal(await handleMindsetMessage(
    message(userThree, 'Does this help pole vaulters with competition nerves?'),
    account
  ), true);
  assert.equal(outbound.length, outboundBeforeAI + 1);
  assert.equal(outbound.at(-1).kind, 'dm');
  assert.equal(outbound.at(-1).recipientId, userThree);
  assert.ok(aiRequests.length > 0);
  const latestAIHistory = aiRequests.at(-1).history.map((entry) => entry.content).join(' ');
  assert.doesNotMatch(latestAIHistory, /USER_TWO_ONLY/);
  assert.match(latestAIHistory, /competition nerves/);

  const userYes = 'ig-user-yes';
  await handleMindsetComment(comment('comment-yes', userYes), account);
  const yesLead = await leadFor(userYes);
  await yesLead.ref.set({ stage: 'awaiting_download_status' }, { merge: true });
  const yesBefore = outbound.length;
  await handleMindsetMessage(message(userYes, 'Yes'), account);
  assert.equal(outbound.length, yesBefore + 1);
  assert.equal(outbound.at(-1).message, 'Awesome, excited to hear what you think about it.');
  assert.equal((await yesLead.ref.get()).data().stage, 'awaiting_use_status');

  const feedbackUser = 'ig-feedback-terminal';
  await handleMindsetComment(comment('comment-feedback-terminal', feedbackUser), account);
  const feedbackLead = await leadFor(feedbackUser);
  await feedbackLead.ref.set({ stage: 'awaiting_download_status' }, { merge: true });
  const pendingUseCheck = await seedDueFollowUp(feedbackLead.id, 'use_check');
  const pendingFeedbackCheck = await seedDueFollowUp(feedbackLead.id, 'feedback_check');

  const gotItBefore = outbound.length;
  await handleMindsetMessage(message(feedbackUser, 'I got it'), account);
  assert.equal(outbound.length, gotItBefore + 1);
  assert.equal(outbound.at(-1).message, 'Awesome, excited to hear what you think about it.');
  assert.equal((await feedbackLead.ref.get()).data().stage, 'awaiting_use_status');

  const likedItBefore = outbound.length;
  const aiBeforeLikedIt = aiRequests.length;
  await handleMindsetMessage(message(feedbackUser, 'I like it'), account);
  assert.equal(outbound.length, likedItBefore + 1);
  assert.equal(outbound.at(-1).message, 'love to hear that!');
  assert.equal(aiRequests.length, aiBeforeLikedIt, 'clear feedback unexpectedly called Claude');
  assert.equal((await feedbackLead.ref.get()).data().stage, 'completed');
  assert.equal((await pendingUseCheck.get()).data().status, 'cancelled');
  assert.equal((await pendingFeedbackCheck.get()).data().status, 'cancelled');

  const afterCompletion = outbound.length;
  const aiAfterCompletion = aiRequests.length;
  await handleMindsetMessage(message(feedbackUser, 'I tried a rep'), account);
  await handleMindsetMessage(message(feedbackUser, 'Good'), account);
  assert.equal(outbound.length, afterCompletion, 'completed feedback journey kept replying');
  assert.equal(aiRequests.length, aiAfterCompletion, 'completed feedback journey called Claude');

  const completedResendBefore = outbound.length;
  await handleMindsetMessage(message(feedbackUser, 'Send me the app link again'), account);
  assert.deepEqual(
    outbound.slice(completedResendBefore).map((item) => item.message),
    ['here you go! hope you like it', 'https://athletemindset.app/app']
  );
  assert.equal((await feedbackLead.ref.get()).data().stage, 'completed');

  const completedAndroidBefore = outbound.length;
  const aiBeforeCompletedAndroid = aiRequests.length;
  await handleMindsetMessage(message(feedbackUser, 'is it available on android?'), account);
  assert.deepEqual(
    outbound.slice(completedAndroidBefore).map((item) => item.message),
    [ANDROID_AVAILABILITY_REPLY]
  );
  assert.equal(aiRequests.length, aiBeforeCompletedAndroid);
  assert.equal((await feedbackLead.ref.get()).data().stage, 'completed');

  const userResend = 'ig-user-resend';
  await handleMindsetComment(comment('comment-resend', userResend), account);
  const resendLead = await leadFor(userResend);
  await resendLead.ref.set({ stage: 'ai_follow_up' }, { merge: true });
  const resendBefore = outbound.length;
  const aiBeforeResend = aiRequests.length;
  await handleMindsetMessage(message(userResend, 'Send it again'), account);
  assert.deepEqual(
    outbound.slice(resendBefore).map((item) => ({
      kind: item.kind,
      message: item.message,
      recipientId: item.recipientId,
      conversationId: item.conversationId,
    })),
    [
      {
        kind: 'dm',
        message: 'here you go! hope you like it',
        recipientId: userResend,
        conversationId: resendLead.id,
      },
      {
        kind: 'dm',
        message: 'https://athletemindset.app/app',
        recipientId: userResend,
        conversationId: resendLead.id,
      },
    ]
  );
  assert.equal(aiRequests.length, aiBeforeResend + 1, 'explicit resend did not pass through the scope gate');
  assert.equal(aiRequests.at(-1).scopeClassifier, true);
  const resendAfter = await resendLead.ref.get();
  assert.equal(resendAfter.data().stage, 'ai_follow_up');
  assert.deepEqual(
    resendAfter.data().history.slice(-2).map((entry) => entry.content),
    ['here you go! hope you like it', 'https://athletemindset.app/app']
  );

  const wrongRecipientBefore = outbound.length;
  assert.equal(await handleMindsetMessage(
    message(userThree, 'This should be blocked', 'another-account'),
    account
  ), true);
  assert.equal(outbound.length, wrongRecipientBefore);

  const userFour = 'ig-user-four';
  await handleMindsetComment(comment('comment-four', userFour), account);
  const userFourLead = await leadFor(userFour);
  await handleMindsetMessage(
    quickReply(userFour, `mindset:send_link:${userFourLead.data.linkToken}`),
    account
  );
  const refusalStart = outbound.length;
  await handleMindsetMessage(message(userFour, 'No I did not'), account);
  await handleMindsetMessage(message(userFour, "I don't want the app"), account);
  assert.deepEqual(
    outbound.slice(refusalStart).map((item) => item.message),
    [
      'I can help with that. What would you like to know first?',
      'No worries, thanks for letting me know.',
    ]
  );
  let refusedLead = await leadFor(userFour);
  assert.equal(refusedLead.data.stage, 'completed');
  const afterRefusal = outbound.length;
  await handleMindsetMessage(message(userFour, 'Stop messaging me'), account);
  assert.equal(outbound.length, afterRefusal, 'terminal refusal received another reply');

  const userFive = 'ig-user-five';
  await handleMindsetComment(comment('comment-five', userFive), account);
  const handoffBefore = outbound.length;
  await handleMindsetMessage(message(userFive, 'I was charged twice and need a refund'), account);
  assert.equal(outbound.length, handoffBefore, 'billing handoff sent an automated reply');
  const handoffLead = await leadFor(userFive);
  assert.equal(handoffLead.data.stage, 'human_handoff');
  assert.equal(handoffLead.data.automationPaused, true);
  const handoff = await db.collection('mindset_handoffs').doc(handoffLead.id).get();
  assert.equal(handoff.data().status, 'open');

  const multilingualUser = 'ig-multilingual-handoff';
  await handleMindsetComment(comment('comment-multilingual-handoff', multilingualUser), account);
  const multilingualBefore = outbound.length;
  await handleMindsetMessage(
    message(multilingualUser, 'Jeg ble belastet to ganger og vil ha refusjon.'),
    account
  );
  assert.equal(outbound.length, multilingualBefore, 'multilingual handoff sent an automated reply');
  const multilingualLead = await leadFor(multilingualUser);
  assert.equal(multilingualLead.data.stage, 'human_handoff');
  assert.equal(multilingualLead.data.automationPaused, true);
  assert.equal(
    (await db.collection('mindset_handoffs').doc(multilingualLead.id).get()).data().reason,
    'scope_human_required'
  );

  const offTopicUser = 'ig-off-topic';
  await handleMindsetComment(comment('comment-off-topic', offTopicUser), account);
  const offTopicLeadBefore = await leadFor(offTopicUser);
  await handleMindsetMessage(
    quickReply(offTopicUser, `mindset:send_link:${offTopicLeadBefore.data.linkToken}`),
    account
  );
  const offTopicReminder = await db.collection('mindset_followups')
    .doc(followUpId(offTopicLeadBefore.id, 'link_reminder')).get();
  assert.equal(offTopicReminder.data().status, 'pending');
  const offTopicOutboundBefore = outbound.length;
  await handleMindsetMessage(message(offTopicUser, 'What poles and spikes do you use?'), account);
  assert.equal(outbound.length, offTopicOutboundBefore, 'off-topic message received a bot reply');
  const offTopicLead = await leadFor(offTopicUser);
  assert.equal(offTopicLead.data.stage, 'human_handoff');
  assert.equal(offTopicLead.data.automationPaused, true);
  assert.equal((await offTopicReminder.ref.get()).data().status, 'cancelled');
  assert.equal(
    (await db.collection('mindset_handoffs').doc(offTopicLead.id).get()).data().reason,
    'off_topic'
  );

  const pausedCommentOutboundBefore = outbound.length;
  await handleMindsetComment(
    comment('comment-off-topic-again', offTopicUser, 'ADMINTEST123 again'),
    account
  );
  assert.equal(
    outbound.length,
    pausedCommentOutboundBefore,
    'a human-owned conversation restarted from a keyword comment'
  );
  const pausedCommentReceipt = await db.collection('mindset_comment_events')
    .doc(`${accountId}_comment-off-topic-again`).get();
  assert.equal(pausedCommentReceipt.data().status, 'completed');
  assert.equal(pausedCommentReceipt.data().skippedReason, 'automation_paused');

  const mixedTopicUser = 'ig-mixed-topic';
  await handleMindsetComment(comment('comment-mixed-topic', mixedTopicUser), account);
  const mixedTopicOutboundBefore = outbound.length;
  await handleMindsetMessage(
    message(mixedTopicUser, 'Thanks for the app link. What poles do you use?'),
    account
  );
  assert.equal(outbound.length, mixedTopicOutboundBefore, 'mixed-topic message received a bot reply');
  const mixedTopicLead = await leadFor(mixedTopicUser);
  assert.equal(mixedTopicLead.data.stage, 'human_handoff');
  assert.equal(
    (await db.collection('mindset_handoffs').doc(mixedTopicLead.id).get()).data().reason,
    'off_topic'
  );

  const uncertainUser = 'ig-uncertain';
  await handleMindsetComment(comment('comment-uncertain', uncertainUser), account);
  const uncertainOutboundBefore = outbound.length;
  await handleMindsetMessage(message(uncertainUser, 'What about that thing?'), account);
  assert.equal(outbound.length, uncertainOutboundBefore, 'uncertain message received a bot reply');
  const uncertainLead = await leadFor(uncertainUser);
  assert.equal(
    (await db.collection('mindset_handoffs').doc(uncertainLead.id).get()).data().reason,
    'scope_uncertain'
  );

  const attachmentUser = 'ig-attachment';
  await handleMindsetComment(comment('comment-attachment', attachmentUser), account);
  const attachmentOutboundBefore = outbound.length;
  await handleMindsetMessage(attachmentMessage(attachmentUser, 'What do you think?'), account);
  assert.equal(outbound.length, attachmentOutboundBefore, 'attachment received a bot reply');
  const attachmentLead = await leadFor(attachmentUser);
  assert.equal(attachmentLead.data.stage, 'human_handoff');
  assert.equal(
    (await db.collection('mindset_handoffs').doc(attachmentLead.id).get()).data().reason,
    'attachment_requires_review'
  );

  const atCapacity = await seedLead('ig-at-capacity', { unansweredFollowUpCount: 2 });
  const atCapacityFollowUp = await seedDueFollowUp(atCapacity.id, 'link_reminder');
  const stale = await seedLead('ig-stale-window', {
    lastUserInteractionAt: admin.firestore.Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000),
  });
  const staleFollowUp = await seedDueFollowUp(stale.id, 'link_reminder');
  const oneRemaining = await seedLead('ig-one-remaining', { unansweredFollowUpCount: 1 });
  const oneRemainingFirst = await seedDueFollowUp(oneRemaining.id, 'link_reminder');
  const oneRemainingSecond = await seedDueFollowUp(oneRemaining.id, 'download_check');
  const followUpSendStart = outbound.length;
  await processMindsetFollowUps();
  assert.equal(outbound.length, followUpSendStart + 1, 'follow-up capacity did not allow exactly one send');
  assert.equal((await atCapacityFollowUp.get()).data().status, 'skipped_unanswered_limit');
  assert.equal((await staleFollowUp.get()).data().status, 'skipped_window_closed');
  const oneStatuses = [
    (await oneRemainingFirst.get()).data().status,
    (await oneRemainingSecond.get()).data().status,
  ];
  assert.equal(oneStatuses.filter((status) => status === 'completed').length, 1);
  assert.equal(oneStatuses.filter((status) => status === 'skipped_unanswered_limit').length, 1);
  assert.equal((await oneRemaining.ref.get()).data().unansweredFollowUpCount, 2);

  const plainReminder = await seedLead('ig-plain-reminder');
  const plainReminderFollowUp = await seedDueFollowUp(plainReminder.id, 'link_reminder');
  const plainReminderSendStart = outbound.length;
  await processMindsetFollowUps();
  assert.equal(outbound.length, plainReminderSendStart + 1);
  assert.deepEqual(outbound.at(-1), {
    kind: 'dm',
    recipientId: plainReminder.data.instagramUserId,
    message: 'hi, just curious what you think of the app so far if you’ve had a chance to try it yet',
    conversationId: plainReminder.id,
  });
  assert.equal((await plainReminderFollowUp.get()).data().status, 'completed');

  const userReplyLead = await seedLead('ig-user-reply');
  const pendingBeforeReply = await seedDueFollowUp(userReplyLead.id, 'link_reminder');
  await handleMindsetMessage(message(userReplyLead.data.instagramUserId, 'Can you explain the app?'), account);
  assert.equal((await pendingBeforeReply.get()).data().status, 'cancelled');

  const crossProductUser = 'ig-cross-product';
  await handleMindsetComment(
    comment('comment-cross-product-mindset', crossProductUser, 'ADMINTEST123 OLD_PRODUCT_ONLY'),
    account
  );
  let crossProductLead = await leadFor(crossProductUser);
  const mindsetSessionId = crossProductLead.data.campaignSessionId;
  const mindsetToken = crossProductLead.data.linkToken;
  await handleMindsetMessage(
    quickReply(crossProductUser, `mindset:send_link:${mindsetToken}`),
    account
  );
  const oldReminderRef = db.collection('mindset_followups')
    .doc(followUpId(crossProductLead.id, 'link_reminder'));
  assert.equal((await oldReminderRef.get()).data().status, 'pending');

  const vaultCommentStart = outbound.length;
  await handleMindsetComment(
    comment('comment-cross-product-vault', crossProductUser, 'VAULT'),
    account
  );
  assert.equal(outbound[vaultCommentStart].kind, 'private_reply');
  assert.match(outbound[vaultCommentStart].message, /download Vault/i);
  crossProductLead = await leadFor(crossProductUser);
  assert.equal(crossProductLead.data.campaignTemplate, 'vault_tracker_download');
  assert.equal(crossProductLead.data.campaignId, vaultCampaignId);
  assert.notEqual(crossProductLead.data.campaignSessionId, mindsetSessionId);
  assert.equal((await oldReminderRef.get()).data().status, 'cancelled');

  const staleButtonStart = outbound.length;
  await handleMindsetMessage(
    quickReply(crossProductUser, `mindset:send_link:${mindsetToken}`),
    account
  );
  assert.equal(outbound.length, staleButtonStart, 'an older product button sent a link');

  const vaultLinkStart = outbound.length;
  await handleMindsetMessage(
    quickReply(crossProductUser, `mindset:send_link:${crossProductLead.data.linkToken}`),
    account
  );
  assert.deepEqual(
    outbound.slice(vaultLinkStart).map((item) => item.message),
    ['here you go! hope you like it', 'https://stavhopp.no/get?src=instagram']
  );
  const vaultReminder = await oldReminderRef.get();
  assert.equal(vaultReminder.data().status, 'pending');
  assert.equal(vaultReminder.data().campaignSessionId, crossProductLead.data.campaignSessionId);

  const vaultResendStart = outbound.length;
  const aiBeforeVaultResend = aiRequests.length;
  await handleMindsetMessage(message(crossProductUser, "i didn't get it"), account);
  assert.deepEqual(
    outbound.slice(vaultResendStart).map((item) => item.message),
    ['here you go! hope you like it', 'https://stavhopp.no/get?src=instagram']
  );
  assert.equal(aiRequests.length, aiBeforeVaultResend);

  const vaultAndroidStart = outbound.length;
  const aiBeforeVaultAndroid = aiRequests.length;
  await handleMindsetMessage(message(crossProductUser, 'does it work on samsung?'), account);
  assert.deepEqual(
    outbound.slice(vaultAndroidStart).map((item) => item.message),
    [ANDROID_AVAILABILITY_REPLY]
  );
  assert.equal(aiRequests.length, aiBeforeVaultAndroid);
  assert.equal((await leadFor(crossProductUser)).data.stage, 'link_sent');

  const vaultAIStart = aiRequests.length;
  await handleMindsetMessage(message(crossProductUser, 'How do I add a pole in Vault?'), account);
  const vaultAIRequests = aiRequests.slice(vaultAIStart);
  assert.ok(vaultAIRequests.length >= 2);
  assert.match(vaultAIRequests.at(-1).systemPrompt, /CANONICAL VAULT PRODUCT GUIDE/);
  assert.doesNotMatch(
    vaultAIRequests.at(-1).history.map((entry) => entry.content).join(' '),
    /OLD_PRODUCT_ONLY/
  );

  const staleFollowUpStart = outbound.length;
  await oldReminderRef.set({
    status: 'pending',
    campaignSessionId: mindsetSessionId,
    dueAt: admin.firestore.Timestamp.fromMillis(Date.now() - 1_000),
  }, { merge: true });
  await processMindsetFollowUps();
  assert.equal(outbound.length, staleFollowUpStart, 'an older product follow-up was sent');
  assert.equal((await oldReminderRef.get()).data().status, 'cancelled_isolation_violation');

  failPrivateReply = true;
  const publicRepliesBeforeFailure = outbound.filter((item) => item.kind === 'public_reply').length;
  await assert.rejects(
    handleMindsetComment(comment('comment-private-failure', 'ig-private-failure'), account),
    /private reply failed/i
  );
  failPrivateReply = false;
  const publicRepliesAfterFailure = outbound.filter((item) => item.kind === 'public_reply').length;
  assert.equal(publicRepliesAfterFailure, publicRepliesBeforeFailure);
  const failedComment = await db.collection('mindset_comment_events')
    .doc(`${accountId}_comment-private-failure`).get();
  assert.equal(failedComment.data().status, 'failed');

  await Promise.all([
    db.collection('conversations').doc('legacy-conversation').set({ accountId }),
    db.collection('leads').doc('legacy-lead').set({ accountId }),
    db.collection('message_queue').doc('queued-message').set({ accountId }),
    db.collection('accounts').doc('other-account').set({ username: 'another_account' }),
    db.collection('conversations').doc('other-conversation').set({ accountId: 'other-account' }),
  ]);
  const resetResult = await resetConversationDataForInstagramUsername('SONDRE_PV');
  assert.equal(resetResult.accountsMatched, 1);
  assert.ok(resetResult.totalDeleted > 0);
  for (const collectionName of RESETTABLE_CONVERSATION_COLLECTIONS) {
    const remaining = await db.collection(collectionName)
      .where('accountId', '==', accountId)
      .get();
    assert.equal(remaining.empty, true, `${collectionName} retained account conversation state`);
  }
  assert.equal((await db.collection('accounts').doc(accountId).get()).exists, true);
  assert.equal((await db.collection('mindset_campaigns').doc(campaignId).get()).exists, true);
  assert.equal((await db.collection('mindset_campaigns').doc(vaultCampaignId).get()).exists, true);
  assert.equal((await db.collection('conversations').doc('other-conversation').get()).exists, true);
});
