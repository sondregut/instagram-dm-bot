import { MINDSET_PRODUCT_KNOWLEDGE } from './mindsetProductKnowledge';

export const DEFAULT_TEST_KEYWORD = 'AMDMTEST8472';
export const MESSAGING_WINDOW_MS = 23 * 60 * 60 * 1000;
export const TEST_DOWNLOAD_CHECK_DELAY_MS = 2 * 60 * 1000;
export const DOWNLOAD_CHECK_DELAY_MS = 30 * 60 * 1000;
export const MAX_UNANSWERED_MINDSET_FOLLOW_UPS = 2;

export type MindsetMilestoneFollowUp = 'use_check' | 'feedback_check';

const MILESTONE_FOLLOW_UP_DELAYS_MS: Record<MindsetMilestoneFollowUp, number> = {
  use_check: 45 * 60 * 1000,
  feedback_check: 5 * 60 * 1000,
};

export type MindsetReplyIntent =
  | 'downloaded'
  | 'used'
  | 'trial_started'
  | 'subscribed'
  | 'price_objection'
  | 'price_question'
  | 'feedback_positive'
  | 'feedback_unsure'
  | 'feedback_negative'
  | 'reason_navigation'
  | 'not_yet'
  | 'problem'
  | 'gratitude'
  | 'human'
  | 'other';

const PUBLIC_REPLIES = [
  'Sent it 🙌 Check your DMs!',
  'Just sent it. Check your DMs!',
  'It should be in your DMs now 🙌',
];

export function hasMindsetFollowUpCapacity(unansweredFollowUpCount: unknown): boolean {
  const count = typeof unansweredFollowUpCount === 'number'
    && Number.isFinite(unansweredFollowUpCount)
    ? Math.max(0, Math.floor(unansweredFollowUpCount))
    : 0;
  return count < MAX_UNANSWERED_MINDSET_FOLLOW_UPS;
}

export function getConfiguredMindsetKeyword(): string {
  return (process.env.MINDSET_TRIGGER_KEYWORD || DEFAULT_TEST_KEYWORD).trim();
}

export function validateMindsetTestConfiguration(
  accountUsername: string,
  keyword: string,
  mode: string
): { allowed: boolean; reason?: string } {
  if (mode !== 'test') return { allowed: true };

  if (keyword.trim().toLowerCase() === 'mindset') {
    return { allowed: false, reason: 'Live Manychat keyword is blocked in test mode' };
  }

  if (!accountUsername.trim() || !keyword.trim()) {
    return { allowed: false, reason: 'Target account and keyword are required' };
  }

  return { allowed: true };
}

export function containsConfiguredMindsetKeyword(
  text: string,
  keyword: string = getConfiguredMindsetKeyword()
): boolean {
  const normalizedKeyword = keyword.trim().toLowerCase();
  if (!normalizedKeyword) return false;

  const normalizedText = text.trim().toLowerCase();
  const escaped = normalizedKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^a-z0-9_])${escaped}(?:$|[^a-z0-9_])`, 'i')
    .test(normalizedText);
}

export function chooseMindsetPublicReply(commentId: string): string {
  const hash = Array.from(commentId).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return PUBLIC_REPLIES[hash % PUBLIC_REPLIES.length];
}

export function classifyMindsetReply(text: string): MindsetReplyIntent {
  const normalized = normalizeMindsetText(text);

  if (/\b(?:talk|speak|chat|connect|put me in touch)\b.{0,40}\b(?:human|person|sondre|support)\b/.test(normalized)
      || /\b(?:real human|real person|support agent)\b/.test(normalized)) return 'human';
  if (!normalized.endsWith('?') && (
    /\b(?:i|we)(?:'ve| have)? (?:already )?(?:started|got) (?:the )?trial\b/.test(normalized)
      || /\b(?:i'm|i am|we're|we are) on (?:the )?trial\b/.test(normalized)
      || /^(?:started (?:the )?trial|on (?:the )?trial)[.!]*$/.test(normalized)
  )) return 'trial_started';
  if (!normalized.endsWith('?') && (
    /\b(?:i|we)(?:'ve| have)? (?:already )?(?:subscribed|paid(?: for it)?|bought it|purchased it)\b/.test(normalized)
      || /\b(?:i'm|i am|we're|we are) subscribed\b/.test(normalized)
      || /^(?:subscribed|paid|purchased)[.!]*$/.test(normalized)
  )) return 'subscribed';
  if (/\b(too expensive|expensive|overpriced|cannot afford|can'?t afford|costs? too much|price (is )?(too )?high)\b/.test(normalized)) return 'price_objection';
  if (/\b(how much|what(?:'s| is) the (?:price|cost)|price|pricing|trial terms?)\b/.test(normalized)) return 'price_question';
  if (/\b(did not|didn'?t|was not|wasn'?t) (?:like|help)|\bnot (?:helpful|useful)|\b(?:bad|unhelpful)\b/.test(normalized)) return 'feedback_negative';
  if (/\b(?:it )?(?:helped|was helpful|was useful|felt good)|\b(?:liked|loved) it\b/.test(normalized)) return 'feedback_positive';
  if (/\b(?:not sure|hard to tell|too early to tell|need more time to tell)\b/.test(normalized)) return 'feedback_unsure';
  if (/\b(can'?t|cannot|could not|couldn'?t) find\b|\bwhere (?:is|do i find) (?:the )?(?:first )?(?:rep|session)\b/.test(normalized)) return 'reason_navigation';
  if (/\b(problem|issue|error|broken|doesn'?t work|didn'?t work|can'?t open|cannot open|stuck)\b/.test(normalized)) return 'problem';
  if (/\b(did not|didn'?t|have not|haven'?t|not yet)\s+(download(?:ed)?|install(?:ed)?|open(?:ed)?|use(?:d)?|try|tried|complete(?:d)?|finish(?:ed)?)\b/.test(normalized)) return 'not_yet';
  if (/\b(tried|used|completed|finished|did (it|a rep)|first rep)\b/.test(normalized)) return 'used';
  if (/^(?:thanks?(?:\s+(?:so much|a lot|for (?:this|that|the help|your help)))?|thank you(?:\s+(?:so much|very much|for (?:this|that|the help|your help)))?|thx|ty|cheers|appreciate it|much appreciated|got it(?:,?\s*thanks?)?)[.!\s🙏😊🙂]*$/.test(normalized)) return 'gratitude';
  if (/\b(downloaded|installed|got it|opened it)\b/.test(normalized)) return 'downloaded';
  if (/\b(not yet|later|busy|no time|haven'?t|didn'?t|don'?t|not|no)\b/.test(normalized)) return 'not_yet';
  return 'other';
}

export function normalizeMindsetText(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[\u2018\u2019\u0060\u00b4]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function requiresMindsetHumanHandoff(text: string): boolean {
  const normalized = normalizeMindsetText(text);
  return /\b(refund|charged|billing|payment problem|cancel (my )?subscription|complaint|report this|unsafe|injur(?:y|ed)|crisis|depress(?:ed|ion)|eating disorder|anorexi(?:a|c)|bulimi(?:a|c)|trauma|abuse|self[- ]?harm|suicid(?:e|al)|(?:talk|speak|chat) to (?:a )?(?:human|person|sondre)|real person)\b/.test(normalized)
    || /\b(?:need|want|looking for|seeking|require|provide|give me) (?:medical|clinical|therapy|therapeutic)\b/.test(normalized)
    || /\bmedical (?:help|advice|emergency|problem|issue|condition|symptoms?|support)\b/.test(normalized);
}

export function isWithinMessagingWindow(
  lastUserInteractionMs: number,
  nowMs: number = Date.now()
): boolean {
  const elapsed = nowMs - lastUserInteractionMs;
  return elapsed >= 0 && elapsed < MESSAGING_WINDOW_MS;
}

export function getDownloadCheckDelayMs(mode: string): number {
  return mode === 'test'
    ? TEST_DOWNLOAD_CHECK_DELAY_MS
    : DOWNLOAD_CHECK_DELAY_MS;
}

export function getMindsetMilestoneFollowUpDelayMs(
  type: MindsetMilestoneFollowUp,
  mode: string
): number {
  return mode === 'test' ? TEST_DOWNLOAD_CHECK_DELAY_MS : MILESTONE_FOLLOW_UP_DELAYS_MS[type];
}

export function buildMindsetDownloadRedirectUrl(token: string): string {
  const base = process.env.MINDSET_DOWNLOAD_REDIRECT_URL ||
    'https://us-central1-instagram-dm-bot-app.cloudfunctions.net/mindsetDownload';
  const url = new URL(base);
  url.searchParams.set('token', token);
  return url.toString();
}

export function buildMindsetDownloadDestination(token: string): string {
  const base = process.env.MINDSET_DOWNLOAD_DESTINATION ||
    'https://www.athletemindset.app/app';
  const url = new URL(base);
  url.searchParams.set('utm_source', 'instagram');
  url.searchParams.set('utm_medium', 'dm');
  url.searchParams.set('utm_campaign', 'mindset_comment');
  url.searchParams.set('ig_lead', token);
  return url.toString();
}

export function buildMindsetActivationUrl(token: string): string {
  const base = process.env.MINDSET_ACTIVATION_URL ||
    'https://us-central1-instagram-dm-bot-app.cloudfunctions.net/mindsetOpen';
  const url = new URL(base);
  url.searchParams.set('token', token);
  return url.toString();
}

export function buildMindsetAppOpenUrl(token: string): string {
  const url = new URL('athletemindset://open/mental-rep');
  url.searchParams.set('utm_source', 'instagram');
  url.searchParams.set('utm_medium', 'dm');
  url.searchParams.set('utm_campaign', 'mindset_activation');
  url.searchParams.set('ig_lead', token);
  return url.toString();
}

export function buildMindsetAISystemPrompt(stage: string): string {
  const stageGuidance = mindsetStageGuidance(stage);
  return `You are the automated Instagram assistant for Athlete Mindset, an app built by Sondre for athletes.

Current conversation stage: ${stage}
Stage guidance: ${stageGuidance}

Your goal is to help this person download Athlete Mindset, get through the personalized setup, experience the first mental-rep preview, understand the in-app offer, and then get real value from the app if access is verified. If they did not continue, learn the real reason and help with the blocker.

${MINDSET_PRODUCT_KNOWLEDGE}

Rules:
- Keep each reply natural, warm, and under 200 characters.
- Ask only one question at a time.
- Answer the person's actual message before guiding them toward the next relevant step.
- If they only thank you or acknowledge the message, respond warmly without asking a question, troubleshooting, or pushing another step.
- If their message is unrelated, respond briefly and naturally, then use one soft question to return to the current stage. Never repeat a CTA mechanically.
- Never ask whether they subscribed, paid, started a trial, or decided to start the offer. Those milestones are tracked through verified app events.
- Do not use em dashes.
- Never pretend to be Sondre. If asked, say you are his automated assistant.
- Do not invent features, prices, guarantees, or medical claims.
- Never ask for payment details or take payment in Instagram. Purchases happen only inside the iOS app, where the App Store shows the current price and trial terms.
- If the person says they already subscribed or started a trial, stop selling and help them get value from the app.
- Do not pressure or shame the person.
- Refunds, account access, safety concerns, complaints, and requests for a person are silently routed to Sondre before the model is called.
- Do not send any URL except one supplied in the conversation context.
- Respond in the same language as the user.`;
}

export function constrainMindsetAIReply(text: string, maxLength: number = 240): string {
  const compact = text
    .replace(/\s*[\u2013\u2014]\s*([a-z])/g, (_match, next: string) => `. ${next.toUpperCase()}`)
    .replace(/\s*[\u2013\u2014]\s*/g, '. ')
    .replace(/\s+/g, ' ')
    .trim();
  if (compact.length <= maxLength) return compact;

  const sentences = compact.match(/[^.!?]+[.!?]+/g) || [];
  let prefix = '';
  for (const sentence of sentences) {
    const candidate = `${prefix}${sentence}`.trim();
    if (candidate.length > maxLength) break;
    prefix = `${candidate} `;
  }
  const completePrefix = prefix.trim();
  if (completePrefix.length >= 60) return completePrefix;

  const slice = compact.slice(0, Math.max(1, maxLength - 1));
  const lastSpace = slice.lastIndexOf(' ');
  const safe = lastSpace >= Math.floor(maxLength * 0.6) ? slice.slice(0, lastSpace) : slice;
  return `${safe.trim()}…`;
}

export function shouldSuppressMindsetAutomatedReply(text: string): boolean {
  const normalized = normalizeMindsetText(text);
  if (!normalized) return true;
  return /\b(?:i )?(?:do not|don't) want to guess\b/.test(normalized)
    || /\b(?:flag(?:ged|ging)?|ask(?:ing)?|get(?:ting)?)\b.{0,60}\bsondre\b/.test(normalized)
    || /\bsondre\b.{0,60}\b(?:follow up|reply|answer|take over)\b/.test(normalized)
    || /\b(?:have|did|do|are|were|will|would|can) you\b[^?]{0,100}\b(?:subscrib|paid|purchas|trial|offer)\w*\b[^?]*\?/.test(normalized)
    || /\b(?:subscribed|paid|purchased|started (?:the )?trial) yet\b[^?]*\?/.test(normalized);
}

function mindsetStageGuidance(stage: string): string {
  switch (stage) {
    case 'awaiting_link_request':
    case 'link_sent':
    case 'link_clicked':
    case 'awaiting_download_status':
      return 'The person has not confirmed opening the app. Help with downloading or opening it; do not discuss payment yet.';
    case 'awaiting_activation':
    case 'awaiting_use_status':
      return 'The person has already downloaded or opened the app. Never ask them to download again. A new user goes through personalized setup, then a guided mental-rep preview or optional Aomi experience, then a personalized result and the App Store offer. If you do not know their screen, ask what they see before giving one navigation step.';
    case 'awaiting_feedback':
      return 'The person completed a first preview or mental rep. Discuss what did or did not feel useful. If they are still onboarding, the personalized result and App Store offer come next. Do not ask them to download or ask whether they subscribed.';
    case 'awaiting_offer_status':
    case 'awaiting_subscription_status':
      return 'The person has experienced the app and may be considering the in-app offer. Answer any question they chose to ask, but never ask whether they subscribed or started a trial.';
    case 'trial_claimed':
      return 'The person says they converted, but the app has not verified it yet. Stop selling and help them get value without claiming the purchase is verified.';
    case 'subscription_claimed':
      return 'The person says they subscribed, but the app has not verified it yet. Stop selling. Respond warmly to what convinced them or to their product feedback without claiming the purchase is verified.';
    case 'trial_started':
      return "The app has verified the conversion. Stop selling and help them get value. They can use Home for Today's Mental Rep, Training for guided sessions, Progress for history and reflections, or Aomi for a conversation.";
    case 'subscribed':
      return "The app has verified the subscription. Stop selling. Welcome honest product feedback and help them get value. They can use Home for Today's Mental Rep, Training for guided sessions, Progress for history and reflections, or Aomi for a conversation.";
    case 'human_handoff':
      return 'A human handoff is required. Do not troubleshoot or sell.';
    case 'completed':
      return 'The conversation is complete. Do not restart the sales funnel.';
    default:
      return 'Use the recent conversation to answer the current blocker. Ask a question only when it is genuinely useful, and never ask for subscription status.';
  }
}
