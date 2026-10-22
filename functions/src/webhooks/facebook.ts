import * as functions from "firebase-functions";
import {
  handleMindsetComment,
  handleMindsetMessage,
} from "../handlers/mindsetHandler";
import {
  getAccountByFacebookPageId,
  updateAccountWebhookTimestamp,
} from "../services/accounts";
import { isMindsetAccountAllowed } from "../services/mindsetCampaigns";
import { getBotMode } from "../utils/runtimeMode";
import { verifyMetaWebhookSignature } from "../utils/webhookSignature";
import { normalizeFacebookCommentChange } from "./facebookLogic";

/**
 * Dedicated Facebook Page webhook. Channel-specific credentials and account
 * lookup prevent Page traffic from being routed into an Instagram account.
 */
export const facebookWebhook = functions
  .runWith({ secrets: ["FACEBOOK_APP_SECRET"] })
  .https.onRequest(async (req, res) => {
    if (req.method === "GET") {
      const mode = req.query["hub.mode"];
      const token = req.query["hub.verify_token"];
      const challenge = req.query["hub.challenge"];
      const verifyToken =
        process.env.VERIFY_TOKEN || "instagram_dm_bot_verify_123";
      if (mode === "subscribe" && token === verifyToken) {
        res.status(200).send(challenge);
        return;
      }
      res.sendStatus(403);
      return;
    }

    if (req.method !== "POST") {
      res.sendStatus(405);
      return;
    }

    if (getBotMode() === "disabled") {
      res.sendStatus(200);
      return;
    }

    const signature = req.get("x-hub-signature-256") || undefined;
    if (
      !verifyMetaWebhookSignature(
        req.rawBody,
        signature,
        process.env.FACEBOOK_APP_SECRET,
      )
    ) {
      console.warn(
        "[Facebook webhook] Rejected request with invalid signature",
      );
      res.sendStatus(401);
      return;
    }

    const { object, entry } = req.body || {};
    if (object !== "page" || !Array.isArray(entry)) {
      res.sendStatus(404);
      return;
    }

    // Acknowledge Meta before doing Graph and Firestore work. The async handler
    // remains alive until processing finishes, while Meta receives its 200 fast.
    res.status(200).send("EVENT_RECEIVED");
    try {
      await processFacebookWebhookEntries(entry);
    } catch (error) {
      console.error(
        "[Facebook webhook] Event processing failed:",
        error instanceof Error ? error.message : "unknown",
      );
    }
  });

async function processFacebookWebhookEntries(entries: any[]): Promise<void> {
  for (const entry of entries) {
    const pageId = typeof entry?.id === "string" ? entry.id : "";
    if (!pageId) continue;
    const account = await getAccountByFacebookPageId(pageId);
    if (!account) {
      console.log(
        `[Facebook webhook] Ignoring an unregistered Page (${pageId})`,
      );
      continue;
    }
    await updateAccountWebhookTimestamp(account.id);
    if (!isMindsetAccountAllowed(account)) continue;

    if (Array.isArray(entry.messaging)) {
      for (const messagingEvent of entry.messaging) {
        try {
          await handleMindsetMessage(messagingEvent, account);
        } catch (error) {
          console.error(
            "[Facebook webhook] Message event failed:",
            error instanceof Error ? error.message : "unknown",
          );
        }
      }
    }

    if (Array.isArray(entry.changes)) {
      for (const change of entry.changes) {
        const comment = normalizeFacebookCommentChange(change, pageId);
        if (!comment) continue;
        try {
          await handleMindsetComment(comment, account);
        } catch (error) {
          console.error(
            "[Facebook webhook] Comment event failed:",
            error instanceof Error ? error.message : "unknown",
          );
        }
      }
    }
  }
}
