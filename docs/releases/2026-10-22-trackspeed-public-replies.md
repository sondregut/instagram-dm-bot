# TrackSpeed public acknowledgment

New qualifying SPEED comments on the verified `trackspeed_app` account now receive a public acknowledgment after Instagram accepts the private Following prompt. A fresh, successful Meta result of not following uses:

> Make sure you follow @trackspeed_app, then tap Following in your DMs so I can send you the link 👋

Confirmed followers, unknown/error results and stale or unverified cached results receive:

> Check your DMs for the next step 👋

The public reply does not claim that an app link was already sent or that Instagram cannot message non-followers. The existing Following button and fresh follower check still control release of the established App Store link.

Only a newly reserved TrackSpeed comment can enter this path. The private API response must be accepted before a public attempt is reserved. Permanent comment receipts prevent duplicate private/public messages on concurrent events, redelivery or uncertain provider responses. Following retries never post another public reply. Historical private-only comments are not replayed or backfilled.

Account identity, current session, account/conversation pauses, opt-outs and human-handoff guards are rechecked before the public attempt. Other campaigns, NovaSpeed message recording, its Sheet worker, account settings and credentials are unchanged.

Validation: the TypeScript build and all 297 network-blocked regression tests pass. Added checks cover true/false/unknown/stale follower states, follower lookup failure, private and public API uncertainty, rate limiting, repeated Following checks, historical receipts and account/handoff changes during lookup. Existing punctuation/case/spacing/Unicode matching and account-isolation regressions pass.

Only `services/trackSpeedCommentCampaign` and `handlers/mindsetHandler` source/emitted files are changed in the production archive. Live acceptance and actual recipient delivery must be distinguished; release verification sends no real test comments or messages.
