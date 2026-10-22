// This isolated candidate uses whole-text matching for TrackSpeed SPEED comments.
// Other account triggers, opt-outs, handoffs and in-session confirmation logic are unchanged.
export function matchesDmCampaignKeyword(text: unknown, keyword: unknown): boolean {
  if (typeof text !== 'string' || typeof keyword !== 'string') return false;
  const normalize = (value: string): string => value.normalize('NFC').trim().toLowerCase().replace(/\s+/gu, ' ');
  const configured = normalize(keyword);
  if (!configured) return false;
  const escaped = configured.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Keep emoji, symbols, URL/handle markers and extra words significant.
  const edge = `[\\s.,!?;:'"“”‘’()\\[\\]{}…]*`;
  return new RegExp(`^${edge}${escaped}${edge}$`, 'u').test(normalize(text));
}
