export interface AnthropicContentBlockLike {
  type: string;
  text?: unknown;
}

/** Claude can place non-text blocks before its answer. Collect every text block. */
export function extractAnthropicText(
  content: readonly AnthropicContentBlockLike[]
): string | null {
  const text = content
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => (block.text as string).trim())
    .filter(Boolean)
    .join('\n')
    .trim();

  return text || null;
}
