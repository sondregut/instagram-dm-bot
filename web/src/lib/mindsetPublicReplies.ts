export const MINDSET_PUBLIC_REPLY_VARIANTS = [
  'Got you. Check your DMs!',
  'I sent you the link. Check your DMs!',
  'The link is in your DMs. Let me know what you think!',
  'Just sent the link over. Check your DMs!',
  'Your link should be waiting in your DMs!',
];

export const DEFAULT_MINDSET_PUBLIC_REPLY_TEXT = MINDSET_PUBLIC_REPLY_VARIANTS.join('\n');

export function parseMindsetPublicReplyVariants(value: string): string[] {
  return Array.from(new Set(value
    .split(/\r?\n/)
    .map((reply) => reply.trim())
    .filter(Boolean)));
}
