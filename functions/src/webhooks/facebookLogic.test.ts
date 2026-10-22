import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFacebookCommentChange } from './facebookLogic';

const pageId = 'page-123';

test('normalizes a new top-level Facebook Page comment', () => {
  assert.deepEqual(normalizeFacebookCommentChange({
    field: 'feed',
    value: {
      item: 'comment',
      verb: 'add',
      comment_id: 'comment-1',
      post_id: 'page-123_post-1',
      parent_id: 'page-123_post-1',
      message: '  FBADMINTEST123  ',
      from: { id: 'psid-1', name: 'Test Athlete' },
    },
  }, pageId), {
    id: 'comment-1',
    media: { id: 'page-123_post-1' },
    from: { id: 'psid-1', username: 'Test Athlete' },
    text: 'FBADMINTEST123',
  });
});

test('accepts Meta feed payloads that use sender_id and sender_name', () => {
  assert.deepEqual(normalizeFacebookCommentChange({
    field: 'feed',
    value: {
      item: 'comment',
      verb: 'add',
      comment_id: 'comment-legacy-shape',
      post_id: 'page-123_post-2',
      parent_id: 'page-123_post-2',
      message: 'FBADMINTEST123',
      sender_id: 987654321,
      sender_name: 'Another Test Athlete',
    },
  }, pageId), {
    id: 'comment-legacy-shape',
    media: { id: 'page-123_post-2' },
    from: { id: '987654321', username: 'Another Test Athlete' },
    text: 'FBADMINTEST123',
  });
});

test('ignores Page-authored, nested, removed, and non-comment feed events', () => {
  const base = {
    field: 'feed',
    value: {
      item: 'comment',
      verb: 'add',
      comment_id: 'comment-1',
      post_id: 'post-1',
      parent_id: 'post-1',
      message: 'FBADMINTEST123',
      from: { id: 'psid-1', name: 'Test Athlete' },
    },
  };
  assert.equal(normalizeFacebookCommentChange({
    ...base,
    value: { ...base.value, from: { id: pageId, name: 'The Page' } },
  }, pageId), null);
  assert.equal(normalizeFacebookCommentChange({
    ...base,
    value: { ...base.value, parent_id: 'another-comment' },
  }, pageId), null);
  assert.equal(normalizeFacebookCommentChange({
    ...base,
    value: { ...base.value, verb: 'remove' },
  }, pageId), null);
  assert.equal(normalizeFacebookCommentChange({
    ...base,
    value: { ...base.value, item: 'post' },
  }, pageId), null);
});
