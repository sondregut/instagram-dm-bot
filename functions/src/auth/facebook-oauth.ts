import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { db, InstagramAccount, OAuthState } from "../firebase";
import { encrypt, generateToken } from "../utils/encryption";
import { subscribeFacebookPage } from "../services/facebook";
import { clearAccountCache } from "../services/accounts";
import { DEFAULT_MINDSET_CAMPAIGN_JOURNEY } from "../services/mindsetCampaignJourney";
import { MINDSET_CAMPAIGNS_COLLECTION } from "../services/mindsetCampaigns";

const GRAPH_API_VERSION = "v21.0";
const FACEBOOK_GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

const getFacebookOAuthConfig = () => ({
  appId: process.env.FACEBOOK_APP_ID || "",
  appSecret: process.env.FACEBOOK_APP_SECRET || "",
  redirectUri: process.env.FACEBOOK_OAUTH_REDIRECT_URI || "",
  webUrl: process.env.WEB_URL || "https://athlete-mindset-dm-bot.vercel.app",
});

const FACEBOOK_OAUTH_SCOPES = [
  "pages_show_list",
  "pages_messaging",
  "pages_manage_metadata",
  "pages_read_engagement",
  "pages_read_user_content",
  "pages_manage_engagement",
].join(",");

interface FacebookPageToken {
  id?: unknown;
  name?: unknown;
  access_token?: unknown;
  tasks?: unknown;
  picture?: { data?: { url?: unknown } };
}

function safeRedirectPath(value?: string): string {
  return value && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/settings";
}

function redirectWithError(
  res: functions.Response,
  webUrl: string,
  code: string,
): void {
  res.redirect(`${webUrl}/settings?facebook_error=${encodeURIComponent(code)}`);
}

export const getFacebookOAuthUrl = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Authentication required",
      );
    }
    const config = getFacebookOAuthConfig();
    if (!config.appId || !config.redirectUri) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Facebook Page connection is not configured yet",
      );
    }

    const stateToken = generateToken(32);
    const stateRef = db.collection("oauth_state").doc();
    const oauthState: OAuthState = {
      id: stateRef.id,
      userId: context.auth.uid,
      state: stateToken,
      platform: "facebook",
      redirectUrl: safeRedirectPath(data?.redirectUrl),
      createdAt: admin.firestore.Timestamp.now(),
      expiresAt: admin.firestore.Timestamp.fromMillis(
        Date.now() + 10 * 60 * 1000,
      ),
    };
    await stateRef.set(oauthState);

    const oauthUrl = new URL(
      `https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth`,
    );
    oauthUrl.searchParams.set("client_id", config.appId);
    oauthUrl.searchParams.set("redirect_uri", config.redirectUri);
    oauthUrl.searchParams.set("scope", FACEBOOK_OAUTH_SCOPES);
    oauthUrl.searchParams.set("state", stateToken);
    oauthUrl.searchParams.set("response_type", "code");
    oauthUrl.searchParams.set("auth_type", "rerequest");
    return { url: oauthUrl.toString(), state: stateToken };
  },
);

export const facebookOAuthCallback = functions
  .runWith({ secrets: ["FACEBOOK_APP_SECRET"] })
  .https.onRequest(async (req, res) => {
    const config = getFacebookOAuthConfig();
    const { code, state, error } = req.query;
    if (error) {
      redirectWithError(res, config.webUrl, String(error));
      return;
    }
    if (!config.appId || !config.appSecret || !config.redirectUri) {
      redirectWithError(res, config.webUrl, "oauth_not_configured");
      return;
    }
    if (typeof code !== "string" || typeof state !== "string") {
      redirectWithError(res, config.webUrl, "missing_params");
      return;
    }

    let stateDoc: FirebaseFirestore.QueryDocumentSnapshot | undefined;
    try {
      const stateQuery = await db
        .collection("oauth_state")
        .where("state", "==", state)
        .limit(2)
        .get();
      if (stateQuery.size !== 1) {
        redirectWithError(res, config.webUrl, "invalid_state");
        return;
      }
      stateDoc = stateQuery.docs[0];
      const oauthState = stateDoc.data() as OAuthState;
      if (
        oauthState.platform !== "facebook" ||
        oauthState.expiresAt.toMillis() <= Date.now()
      ) {
        await stateDoc.ref.delete();
        redirectWithError(res, config.webUrl, "invalid_or_expired_state");
        return;
      }
      await stateDoc.ref.delete();

      const tokenUrl = new URL(`${FACEBOOK_GRAPH_API_BASE}/oauth/access_token`);
      tokenUrl.searchParams.set("client_id", config.appId);
      tokenUrl.searchParams.set("client_secret", config.appSecret);
      tokenUrl.searchParams.set("redirect_uri", config.redirectUri);
      tokenUrl.searchParams.set("code", code);
      const tokenResponse = await fetch(tokenUrl);
      const tokenData = await tokenResponse.json();
      if (!tokenResponse.ok || !tokenData?.access_token) {
        console.error("[Facebook OAuth] Code exchange failed");
        redirectWithError(res, config.webUrl, "token_exchange_failed");
        return;
      }

      let userAccessToken = String(tokenData.access_token);
      let expiresIn = Number(tokenData.expires_in) || 3600;
      const longTokenUrl = new URL(
        `${FACEBOOK_GRAPH_API_BASE}/oauth/access_token`,
      );
      longTokenUrl.searchParams.set("grant_type", "fb_exchange_token");
      longTokenUrl.searchParams.set("client_id", config.appId);
      longTokenUrl.searchParams.set("client_secret", config.appSecret);
      longTokenUrl.searchParams.set("fb_exchange_token", userAccessToken);
      const longTokenResponse = await fetch(longTokenUrl);
      const longTokenData = await longTokenResponse.json().catch(() => ({}));
      if (longTokenResponse.ok && longTokenData?.access_token) {
        userAccessToken = String(longTokenData.access_token);
        expiresIn = Number(longTokenData.expires_in) || 60 * 24 * 60 * 60;
      }

      const pagesFields = encodeURIComponent(
        "id,name,access_token,tasks,picture{url}",
      );
      const pagesResponse = await fetch(
        `${FACEBOOK_GRAPH_API_BASE}/me/accounts?fields=${pagesFields}&limit=100`,
        { headers: { Authorization: `Bearer ${userAccessToken}` } },
      );
      const pagesData = await pagesResponse.json();
      if (!pagesResponse.ok || !Array.isArray(pagesData?.data)) {
        console.error("[Facebook OAuth] Page discovery failed");
        redirectWithError(res, config.webUrl, "page_discovery_failed");
        return;
      }

      const pages = (pagesData.data as FacebookPageToken[]).filter(
        (page) =>
          typeof page.id === "string" &&
          typeof page.name === "string" &&
          typeof page.access_token === "string",
      );
      if (pages.length === 0) {
        redirectWithError(res, config.webUrl, "no_eligible_pages");
        return;
      }

      let saved = 0;
      let subscribed = 0;
      for (const page of pages) {
        const pageId = String(page.id);
        const pageName = String(page.name).trim();
        const pageToken = String(page.access_token);
        const existing = await db
          .collection("accounts")
          .where("pageId", "==", pageId)
          .limit(3)
          .get();
        const existingFacebookDocs = existing.docs.filter(
          (doc) => doc.data()?.platform === "facebook",
        );
        if (existingFacebookDocs.length > 1) {
          console.error("[Facebook OAuth] Duplicate Page mapping rejected");
          continue;
        }
        if (
          existingFacebookDocs[0] &&
          existingFacebookDocs[0].data()?.userId !== oauthState.userId
        ) {
          console.error(
            "[Facebook OAuth] Page is already owned by another workspace",
          );
          continue;
        }

        const didSubscribe = await subscribeFacebookPage(pageId, pageToken);
        if (didSubscribe) subscribed++;
        const now = admin.firestore.Timestamp.now();
        const accountRef =
          existingFacebookDocs[0]?.ref || db.collection("accounts").doc();
        const existingAccount = existingFacebookDocs[0]?.data() as
          | InstagramAccount
          | undefined;
        const account: InstagramAccount = {
          id: accountRef.id,
          userId: oauthState.userId,
          platform: "facebook",
          username: pageName,
          instagramAccountId: pageId,
          pageId,
          pageName,
          profilePictureUrl:
            typeof page.picture?.data?.url === "string"
              ? page.picture.data.url
              : existingAccount?.profilePictureUrl,
          accessToken: encrypt(pageToken),
          tokenExpiresAt: admin.firestore.Timestamp.fromMillis(
            Date.now() + Math.max(3600, expiresIn) * 1000,
          ),
          automationMode: existingAccount?.automationMode || "test",
          isMindsetWorkspace: true,
          webhookSubscribed: didSubscribe,
          ...(didSubscribe ? { webhookSubscribedAt: now } : {}),
          aiPersonality: existingAccount?.aiPersonality || {
            name: `${pageName}'s Assistant`,
            description: "Facebook Messenger download assistant",
            systemPrompt: `Help only with the active app-download campaign and stop silently when a message is outside that scope.`,
            tone: "friendly",
            goals: [
              "Send the requested app link",
              "Collect optional product feedback",
            ],
          },
          settings: existingAccount?.settings || {
            maxResponseLength: 500,
            collectEmail: false,
            collectPhone: false,
            autoWelcomeNewFollowers: false,
            businessHoursOnly: false,
            notifyOnNewLead: true,
            notifyOnHandoff: true,
          },
          isActive: true,
          connectionStatus: "connected",
          createdAt: existingAccount?.createdAt || now,
          updatedAt: now,
        };
        await accountRef.set(account, { merge: true });
        const existingCampaigns = await db
          .collection(MINDSET_CAMPAIGNS_COLLECTION)
          .where("accountId", "==", accountRef.id)
          .limit(1)
          .get();
        if (existingCampaigns.empty) {
          const campaignRef = db.collection(MINDSET_CAMPAIGNS_COLLECTION).doc();
          await campaignRef.set({
            id: campaignRef.id,
            ownerUserId: oauthState.userId,
            accountId: accountRef.id,
            name: "Facebook Athlete Mindset test",
            keyword: "FBADMINTEST123",
            postIds: [],
            postMode: "any",
            status: "test",
            publicReplyEnabled: true,
            publicReplyText: [
              "sent you the link in Messenger!",
              "check Messenger, I sent the link!",
              "the link is waiting in Messenger, let me know what you think!",
            ].join("\n"),
            template: "athlete_mindset_download",
            journey: {
              ...DEFAULT_MINDSET_CAMPAIGN_JOURNEY,
              openingMessage:
                "reply link and I’ll send you the link to download Athlete Mindset\n\nAppreciate you,\nSondre",
            },
            createdAt: now,
            updatedAt: now,
          });
        }
        clearAccountCache(pageId);
        saved++;
      }

      const redirectPath = safeRedirectPath(oauthState.redirectUrl);
      res.redirect(
        `${config.webUrl}${redirectPath}?facebook_success=true&pages=${saved}&subscribed=${subscribed}`,
      );
    } catch (callbackError) {
      console.error(
        "[Facebook OAuth] Callback failed:",
        callbackError instanceof Error ? callbackError.message : "unknown",
      );
      if (stateDoc?.exists) await stateDoc.ref.delete().catch(() => undefined);
      redirectWithError(res, config.webUrl, "internal_error");
    }
  });
