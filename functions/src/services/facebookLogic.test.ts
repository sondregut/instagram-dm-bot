import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFacebookButtonMessagePayload,
  buildFacebookPrivateReplyPayload,
  buildFacebookQuickReplyPayload,
  buildFacebookTextMessagePayload,
} from './facebookLogic';

test('builds a Messenger RESPONSE addressed only to the requested PSID', () => {
  assert.deepEqual(buildFacebookTextMessagePayload('psid-one', 'here you go'), {
    messaging_type: 'RESPONSE',
    recipient: { id: 'psid-one' },
    message: { text: 'here you go' },
  });
});

test('keeps comment private replies text-only', () => {
  assert.deepEqual(buildFacebookPrivateReplyPayload('reply link'), {
    message: 'reply link',
  });
});

test('bounds Messenger quick replies and buttons to Meta limits', () => {
  const quickReplies = Array.from({ length: 15 }, (_, index) => ({
    title: `reply-${index}-with-a-title-that-is-too-long`,
    payload: `payload-${index}`,
  }));
  const quickPayload = buildFacebookQuickReplyPayload('psid-two', 'choose', quickReplies) as any;
  assert.equal(quickPayload.message.quick_replies.length, 13);
  assert.ok(quickPayload.message.quick_replies.every((reply: any) => reply.title.length <= 20));

  const buttonPayload = buildFacebookButtonMessagePayload('psid-three', 'Download', [
    { title: 'first', url: 'https://example.com/1' },
    { title: 'second', url: 'https://example.com/2' },
    { title: 'third', url: 'https://example.com/3' },
    { title: 'fourth', url: 'https://example.com/4' },
  ]) as any;
  assert.equal(buttonPayload.message.attachment.payload.elements[0].buttons.length, 3);
  assert.equal(buttonPayload.recipient.id, 'psid-three');
});
