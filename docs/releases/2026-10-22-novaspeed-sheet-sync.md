# NovaSpeed lead and message sync — 2026-10-22

The NovaSpeed campaign on `sondre_pv` and `novaspeedtiming` saves campaign-attributed DM text and accepted bot replies to Firestore, then independently syncs them to the existing private NovaSpeed Sheet. It does not send emails, replay comments or change the other brands' campaigns.

## Data and attribution

- `novaspeed_messages`: incoming text (including invalid-email free text), accepted outgoing text, timestamps, account, campaign, stable conversation/lead/message IDs and optional provider message IDs.
- `novaspeed_message_links`: provider IDs tied to the exact campaign conversation, for explicit reply attribution and echo deduplication.
- `novaspeed_sheet_outbox`: durable per-record jobs; one dedicated Firestore-triggered worker retries Sheet operations independently of Instagram delivery.
- Unconfirmed send attempts stay private in Firestore and are never exported as confirmed outgoing messages.
- Notes after email capture and manual outbound echoes require an explicit NovaSpeed mention or a reply to a recorded NovaSpeed message. Existing campaign expiry, opt-outs and newer unrelated personal campaigns remain respected. Ambiguous personal DMs are not exported.
- Capture is prospective from this release. Earlier DM text was not stored and must not be reconstructed as if it were recorded. Existing verified NovaSpeed email leads may be synced without resending a DM.

## Sheet write boundaries

Destination spreadsheet: `135d_fwLhZA42ryvNLw9mVr2vuOqxTKUj9pDV_PNbKmA`.

- Leads: writes A:E and I:J only. Manual F:H (follow-up status, sent date, notes) are preserved.
- Messages: writes A:H only. Manual I (notes) is preserved.
- Exact sheet IDs, titles and headers are checked before writing. Changed structure or exhausted capacity leaves work pending for review.
- RAW value input prevents formula execution from incoming text. Stable IDs and an expiring single-writer lease prevent duplicate rows on retries or uncertain responses. Do not manually edit stable IDs.
- Existing runtime service account uses application default credentials. The only new access is the specifically approved Editor grant to this Sheet; no keys or user credentials are created.

## Verification

`cd functions && npm run test:comment-release` passes 290 offline tests. New coverage includes scope rejection, free-text preservation, post-email note attribution, human-pause preservation, outbound uncertainty, formula-safe RAW writes, duplicate/uncertain Sheet responses, manual-column preservation and lock contention. All network access is blocked in the suite.

This test count is separate from real Instagram delivery and live Sheet write evidence. API acceptance does not prove recipient inbox delivery. No test DMs or automatic emails are sent by release verification.

The worker initializes the legacy Firebase project variable from the existing runtime identity, validates the exact project, and preserves Firebase trigger metadata. This accommodates the Node runtime without setting reserved persistent environment variables.

## Live release evidence

- `syncNovaSpeedSheet` v2 became ACTIVE at 04:52:39 UTC. Its deployed archive exactly matched the tested worker source at 04:54:20 UTC.
- `instagramWebhook` v72 became ACTIVE at 04:57:31 UTC. Its deployed archive exactly matched the tested recording release at 05:00:31 UTC (SHA-256 `2fbeab5393b6701cc564cf0ec0751d38ab4d180f952ae020ef9ba6e8528f1cd3`). Existing MINDSET, personal NOVASPEED and TrackSpeed behavior is preserved.
- The worker verified Sheet headers and synced one existing real NovaSpeed email lead from `sondre_pv`. Sheet row readback confirmed account, campaign, capture timestamp and stable IDs. No historical DM was replayed.
- At 05:01 UTC, the personal account had one completed real comment event: private/public API acceptance, an email saved, and acknowledgement API acceptance. The brand account remained connected, subscribed and enabled with no qualifying comment event yet.
- No new campaign messages have been observed since recording activation. A fresh user comment and DM reply are still needed to verify the live Messages-tab path. Older message text was not stored and has not been invented or backfilled.
