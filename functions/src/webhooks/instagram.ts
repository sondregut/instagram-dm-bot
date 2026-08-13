import * as functions from 'firebase-functions';
import { handleMessage, InstagramMessageEvent } from '../handlers/messageHandler';
import { handleComment, InstagramCommentEvent } from '../handlers/commentHandler';
import {
  handleStoryMention,
  handleStoryReply,
  isStoryMentionEvent,
  isStoryReplyEvent,
  InstagramStoryMentionEvent,
  InstagramStoryReplyEvent,
} from '../handlers/storyHandler';
import { getAccountByInstagramId, updateAccountWebhookTimestamp } from '../services/accounts';
import { InstagramAccount } from '../firebase';
import { handleMindsetComment, handleMindsetMessage } from '../handlers/mindsetHandler';
import { isMindsetAccountAllowed } from '../services/mindsetCampaigns';
import { BotMode, getBotMode, shouldRunLegacyAutomation } from '../utils/runtimeMode';
import { verifyMetaWebhookSignature } from '../utils/webhookSignature';

/**
 * Instagram Webhook Handler
 * Receives events from Meta's webhook system
 * Routes events to the correct account in multi-tenant setup
 */
export const instagramWebhook = functions.https.onRequest(async (req, res) => {
  // Webhook verification (GET request from Meta)
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    const verifyToken = process.env.VERIFY_TOKEN || 'instagram_dm_bot_verify_123';

    if (mode === 'subscribe' && token === verifyToken) {
      console.log('Webhook verified successfully');
      res.status(200).send(challenge);
      return;
    }

    console.error('Webhook verification failed');
    res.sendStatus(403);
    return;
  }

  // Handle webhook events (POST request)
  if (req.method === 'POST') {
    const mode = getBotMode();
    if (mode === 'disabled') {
      console.log('[Webhook] Bot is disabled - ignoring all events');
      res.sendStatus(200);
      return;
    }

    const signature = req.get('x-hub-signature-256') || undefined;
    if (!verifyMetaWebhookSignature(req.rawBody, signature, process.env.INSTAGRAM_APP_SECRET)) {
      console.warn('[Webhook] Rejected request with invalid signature');
      res.sendStatus(401);
      return;
    }

    const { object, entry } = req.body || {};
    if (object !== 'instagram' || !Array.isArray(entry)) {
      res.sendStatus(404);
      return;
    }

    try {
      await processWebhookEvents(entry, mode);
    } catch (error) {
      console.error('[Webhook] Event processing failed:', error instanceof Error ? error.message : 'unknown');
    }

    res.sendStatus(200);
    return;
  }

  res.sendStatus(405);
});

/**
 * Process webhook events from Meta
 * Routes events to the correct account based on recipient ID
 */
async function processWebhookEvents(entry: any[], mode: BotMode): Promise<void> {
  for (const event of entry) {
    // The event.id is the Instagram Account ID that received the event
    const instagramAccountId = event.id;

    // Look up which account this belongs to
    const account = await getAccountByInstagramId(instagramAccountId);

    if (!account) {
      console.log(`[Webhook] Unknown Instagram account: ${instagramAccountId}`);
      // Could be a legacy account or unregistered - skip
      continue;
    }

    // Update last webhook timestamp
    await updateAccountWebhookTimestamp(account.id);

    console.log(`[Webhook] Processing event for account: ${account.username} (${account.id})`);
    const mindsetTargetAccount = isMindsetAccountAllowed(account);
    const legacyAutomationAllowed = shouldRunLegacyAutomation(mode, mindsetTargetAccount);

    // Handle direct messages and story events
    if (event.messaging && Array.isArray(event.messaging)) {
      for (const messagingEvent of event.messaging) {
        try {
          // Check for story mention events
          if (isStoryMentionEvent(messagingEvent)) {
            if (!legacyAutomationAllowed) continue;
            console.log('[Webhook] Processing story mention event');
            await handleStoryMention(messagingEvent as InstagramStoryMentionEvent, account);
            continue;
          }

          // Check for story reply events (message with story context)
          if (isStoryReplyEvent(messagingEvent)) {
            if (!legacyAutomationAllowed) continue;
            console.log('[Webhook] Processing story reply event');
            await handleStoryReply(messagingEvent as InstagramStoryReplyEvent, account);
            continue;
          }

          const mindsetHandled = await handleMindsetMessage(messagingEvent as InstagramMessageEvent, account);
          if (mindsetHandled || !legacyAutomationAllowed) continue;

          // Legacy regular message handling is available only in explicit full mode.
          await handleMessage(messagingEvent as InstagramMessageEvent, account);
        } catch (error) {
          console.error('Error handling message/story event:', error);
        }
      }
    }

    // Handle field changes (comments, mentions, etc.)
    if (event.changes && Array.isArray(event.changes)) {
      for (const change of event.changes) {
        try {
          switch (change.field) {
            case 'comments':
              const mindsetHandled = await handleMindsetComment(change.value as InstagramCommentEvent, account);
              if (mindsetHandled || !legacyAutomationAllowed) break;
              await handleComment(change.value as InstagramCommentEvent, account);
              break;

            case 'mentions':
              if (!legacyAutomationAllowed) break;
              // Handle story mentions from changes field (alternative format)
              console.log('[Webhook] Story mention from changes:', change.value);
              if (change.value?.media_type === 'STORY' || change.value?.story_id) {
                // Convert to our event format and handle
                const mentionEvent: InstagramStoryMentionEvent = {
                  sender: { id: change.value.user_id || change.value.from?.id },
                  recipient: { id: account.instagramAccountId },
                  timestamp: Date.now(),
                  story_mention: {
                    id: change.value.story_id || change.value.media_id,
                    link: change.value.permalink || '',
                  },
                };
                await handleStoryMention(mentionEvent, account);
              }
              break;

            default:
              console.log(`Unhandled change field: ${change.field}`);
          }
        } catch (error) {
          console.error(`Error handling ${change.field} change:`, error);
        }
      }
    }
  }
}

/**
 * Webhook event types reference:
 *
 * Messaging events (event.messaging):
 * - message: New message received
 * - message_reads: Message was read
 * - message_reactions: Reaction to a message
 * - messaging_postbacks: Quick reply button clicked
 *
 * Change events (event.changes):
 * - comments: New comment on a post
 * - mentions: Tagged in a story
 * - story_insights: Story view insights
 */
