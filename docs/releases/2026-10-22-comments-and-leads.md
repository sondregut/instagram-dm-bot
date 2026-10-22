# Comment automation and Leads release — 2026-10-22

This commit reconciles the repository with the individually verified production sources, then records the authorized comment and Leads changes. Main previously lagged the deployed application; the Facebook channels, follower guards, personal MINDSET behavior and existing dashboard changes in this diff were already present in production/local deployment sources.

## Production components

- `instagramWebhook` v71: source archive SHA-256 `ff5ce154a75b80957a7cc79b8ec34cef3d6bb82b07bf216149b97691e6069df0`, active October 22 at 04:12:46 UTC. Exact downloaded archive matched the tested release.
- `instagramOAuthCallback` v21: preserve the separately deployed, verified callback source. Its archive SHA-256 is `3c7528dd14a00bcc71191b3f173516d55c2d2b527f44e7eee26595b4b384a6e2`. Do not roll this back to the older callback bundled in the webhook archive.
- `getLeadsApi` and `exportLeads` v19: exact downloaded source archives matched SHA-256 `4d779214140720ee7087ef1d14285a593249d7cd4abd5583521ed4bc27dd3c98`.
- Dashboard deployment `dpl_FkTeSN8yack3D3imfJHF8VSkWcas`: all 83 deployed file hashes matched the built static output.

## Resulting behavior

TrackSpeed uses a comment-only SPEED campaign on the verified `trackspeed_app` account. It sends a private follower prompt with the label **Following**, verifies current follower status, and then sends the existing TrackSpeed App Store offer. It does not add a public comment reply, DM keyword entry or follow-up sequence.

Existing comment keywords accept case, punctuation, emoji, spaced letters, Unicode normalization and bounded repeated letters. Full normalized comments must match; ordinary sentences, substrings, combined campaign requests and unrelated words remain rejected. Exact/longest keyword routing keeps SPEED separate from NOVASPEED and TRACKSPEED.

NovaSpeed email capture remains scoped to its verified brand account and the separate personal-account campaign. Its copy and manual email follow-up behavior remain unchanged. No automatic emails or historical comment replay are introduced.

The dashboard exposes Leads, supports the NovaSpeed campaign filter, includes both stored comment source labels and applies selected account/campaign/source/email filters to CSV exports. Exports include account, campaign, lead ID and notes, and escape formula-leading content. Callable authentication and owner isolation remain enforced.

## Validation and limits

- `cd functions && npm run test:comment-release`: 278 passing offline checks, with all external network transports blocked. Fixtures test duplicate handling, uncertainty, paused/manual conversations, ownership, expiry, keyword routing, follower verification and Leads filtering/export.
- TypeScript compilation passed.
- Dashboard production static build passed, including 15 routes.
- Deployment source/file hashes were verified independently.
- Offline checks and provider API acceptance are not proof of recipient inbox delivery. Fresh willing-account tests are still required for delivery confirmation.

Cloud environment values, credentials, source archives containing runtime configuration, real conversation records and local deployment artifacts are intentionally excluded from Git. Deploy only named approved components; this reconciled tree is not an instruction to redeploy every function.
