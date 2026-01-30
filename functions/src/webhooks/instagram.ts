import * as functions from 'firebase-functions';
import { handleMessage, InstagramMessageEvent } from '../handlers/messageHandler';
import { handleComment, InstagramCommentEvent } from '../handlers/commentHandler';

/**
 * Instagram Webhook Handler
 * Receives events from Meta's webhook system
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
    const { object, entry } = req.body;

    // Validate it's an Instagram webhook
    if (object !== 'instagram') {
      console.log(`Received webhook for unsupported object: ${object}`);
      res.sendStatus(404);
      return;
    }

    // Process events BEFORE responding (Meta allows 20 seconds)
    // This ensures the function doesn't terminate before processing completes
    try {
      console.log('[Webhook] Processing events...');
      await processWebhookEvents(entry);
      console.log('[Webhook] Events processed successfully');
    } catch (error) {
      console.error('[Webhook] Error processing webhook events:', error);
      if (error instanceof Error) {
        console.error('[Webhook] Error stack:', error.stack);
      }
    }

    // Send response after processing
    res.sendStatus(200);
    return;
  }

  res.sendStatus(405);
});

/**
 * Process webhook events from Meta
 */
async function processWebhookEvents(entry: any[]): Promise<void> {
  for (const event of entry) {
    // Handle direct messages
    if (event.messaging && Array.isArray(event.messaging)) {
      for (const messagingEvent of event.messaging) {
        try {
          await handleMessage(messagingEvent as InstagramMessageEvent);
        } catch (error) {
          console.error('Error handling message:', error);
        }
      }
    }

    // Handle field changes (comments, mentions, etc.)
    if (event.changes && Array.isArray(event.changes)) {
      for (const change of event.changes) {
        try {
          switch (change.field) {
            case 'comments':
              await handleComment(change.value as InstagramCommentEvent);
              break;

            case 'mentions':
              console.log('Story mention received:', change.value);
              // Future: Handle story mentions
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
