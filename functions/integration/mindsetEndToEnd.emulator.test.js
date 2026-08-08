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
  aiRequests.push({ systemPrompt, history });
  if (/refusjon|hacerme daño/i.test(history.at(-1)?.content || '')) {
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
const { DEFAULT_MINDSET_CAMPAIGN_JOURNEY } = require('../lib/services/mindsetCampaignJourney');
const { buildMindsetConversationId } = require('../lib/services/mindsetConversationIsolation');

const ownerUserId = 'owner-e2e';
const accountId = 'account-e2e';
const campaignId = 'campaign-e2e';
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

  assert.equal(await handleMindsetMessage(
    quickReply(userOne, `mindset:send_link:${leadOne.data.linkToken}`),
    account
  ), true);
  const linkMessage = outbound.at(-1);
  assert.equal(linkMessage.kind, 'button_dm');
  assert.equal(linkMessage.recipientId, userOne);
  assert.equal(linkMessage.buttons[0].title, 'Download App');
  assert.match(linkMessage.buttons[0].url, /mindsetDownload/);
  assert.match(linkMessage.buttons[0].url, new RegExp(leadOne.data.linkToken));

  leadOne = await leadFor(userOne);
  assert.equal(leadOne.data.stage, 'link_sent');
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
        message: 'here you go',
        recipientId: userResend,
        conversationId: resendLead.id,
      },
      {
        kind: 'dm',
        message: 'https://www.athletemindset.app/app',
        recipientId: userResend,
        conversationId: resendLead.id,
      },
    ]
  );
  assert.equal(aiRequests.length, aiBeforeResend, 'explicit resend unexpectedly called Claude');
  const resendAfter = await resendLead.ref.get();
  assert.equal(resendAfter.data().stage, 'ai_follow_up');
  assert.deepEqual(
    resendAfter.data().history.slice(-2).map((entry) => entry.content),
    ['here you go', 'https://www.athletemindset.app/app']
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
    'ai_sensitive_handoff'
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

  const userReplyLead = await seedLead('ig-user-reply');
  const pendingBeforeReply = await seedDueFollowUp(userReplyLead.id, 'link_reminder');
  await handleMindsetMessage(message(userReplyLead.data.instagramUserId, 'Can you explain the app?'), account);
  assert.equal((await pendingBeforeReply.get()).data().status, 'cancelled');

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
});
