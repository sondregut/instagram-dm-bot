# Stop app-link automation from interrupting ordinary DMs

The app-link classifier matched the substring “give it” inside ordinary replies such as “I'll give it a shot.” The follower gate treated that as an independent link request even without an active campaign, then sent its app chooser. DM keyword entry also matched incidental keyword mentions inside longer sentences.

Link commands now match the whole request. Offers to send a link, quoted requests, and unrelated conversational sentences do not request an automated response. Direct DM keywords must be a standalone keyword or a bounded explicit request such as “send MINDSET please”; case, surrounding punctuation/emojis and Unicode compatibility characters are normalized. Ambiguous short replies such as “give it” require a recent, account-scoped bot prompt. Both follower-gate and direct-JUMP fallback entry use the same DM request rule.

Comment matching, NovaSpeed email/contact/note collection, the Sheet worker, TrackSpeed comment-only entry, follower verification, pause/opt-out rules and send deduplication are unchanged. The webhook release overlays only four modules (and their compiled files) on the verified v74 production source. Runtime configuration is not changed.

Validation: TypeScript build and all 322 offline tests pass. The regression tests reproduce the reported sentence and adjacent false positives before the repair, then verify silence, explicit link/keyword requests, contextual confirmations, duplicate events, echoes/self messages and account isolation after it. No comments or DMs were sent for testing and no historical events were replayed. Live deployment acceptance is verified separately from real inbox delivery.
