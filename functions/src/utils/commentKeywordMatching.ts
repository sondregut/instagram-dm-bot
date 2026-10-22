/** Whole-comment matching only. Never use this for DM intent or opt-out routing. */
export function normalizeCommentKeyword(value: unknown): string | null {
  if (typeof value !== 'string' || !value || value.length > 160) return null;
  const compact = value.normalize('NFKC').toLowerCase()
    .replace(/[\s\p{P}\p{S}\p{Cf}\p{M}]/gu, '');
  return compact && /^[\p{L}\p{N}]+$/u.test(compact) ? compact : null;
}

/** Exact normalized spelling wins over bounded letter elongation. No omissions/substitutions. */
export function commentKeywordMatchRank(text: unknown, keyword: unknown): number {
  const input = normalizeCommentKeyword(text), expected = normalizeCommentKeyword(keyword);
  if (!input || !expected || expected.length > 64) return 0;
  if (input === expected) return 2;
  const runs = Array.from(expected.matchAll(/(.)\1*/gu), match => match[0]);
  const pattern = runs.map(run => {
    const letter = Array.from(run)[0], count = Array.from(run).length;
    return /\p{L}/u.test(letter) ? `${letter}{${count},${count + 12}}` : run;
  }).join('');
  return new RegExp(`^${pattern}$`, 'u').test(input) ? 1 : 0;
}

export function matchesCommentKeyword(text: unknown, keyword: unknown): boolean {
  return commentKeywordMatchRank(text, keyword) > 0;
}

export function compareCommentKeywords(text: unknown, left: string, right: string): number {
  return commentKeywordMatchRank(text, right) - commentKeywordMatchRank(text, left)
    || (normalizeCommentKeyword(right)?.length || 0) - (normalizeCommentKeyword(left)?.length || 0);
}

export function findCommentKeyword(text: unknown, keywords: string[]): string | null {
  return keywords.filter(keyword => matchesCommentKeyword(text, keyword))
    .sort((left, right) => compareCommentKeywords(text, left, right))[0] || null;
}
