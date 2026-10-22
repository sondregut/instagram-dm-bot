export interface FacebookFeedChange {
  field?: unknown;
  value?: {
    item?: unknown;
    verb?: unknown;
    comment_id?: unknown;
    post_id?: unknown;
    parent_id?: unknown;
    message?: unknown;
    sender_id?: unknown;
    sender_name?: unknown;
    from?: {
      id?: unknown;
      name?: unknown;
    };
  };
}

export interface NormalizedFacebookComment {
  id: string;
  media: { id: string };
  from: { id: string; username: string };
  text: string;
}

/**
 * Accept only new, top-level comments made by someone other than the Page.
 * Comment replies are intentionally ignored so the keyword cannot recursively
 * trigger on the bot's own public reply or on a nested conversation.
 */
export function normalizeFacebookCommentChange(
  change: FacebookFeedChange,
  pageId: string
): NormalizedFacebookComment | null {
  if (change.field !== 'feed') return null;
  const value = change.value;
  if (!value || value.item !== 'comment' || value.verb !== 'add') return null;

  const commentId = typeof value.comment_id === 'string' ? value.comment_id : '';
  const postId = typeof value.post_id === 'string' ? value.post_id : '';
  const senderId = typeof value.from?.id === 'string'
    ? value.from.id
    : typeof value.sender_id === 'string' || typeof value.sender_id === 'number'
      ? String(value.sender_id)
      : '';
  const text = typeof value.message === 'string' ? value.message.trim() : '';
  if (!commentId || !postId || !senderId || !text || senderId === pageId) return null;

  const parentId = typeof value.parent_id === 'string' ? value.parent_id : '';
  if (parentId && parentId !== postId) return null;

  const senderName = typeof value.from?.name === 'string' && value.from.name.trim()
    ? value.from.name.trim()
    : typeof value.sender_name === 'string' && value.sender_name.trim()
      ? value.sender_name.trim()
      : 'Facebook user';
  return {
    id: commentId,
    media: { id: postId },
    from: { id: senderId, username: senderName },
    text,
  };
}
