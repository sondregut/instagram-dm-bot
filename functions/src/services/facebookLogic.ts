import { truncateMessage } from '../utils/validators';

export function buildFacebookTextMessagePayload(recipientId: string, message: string): object {
  return {
    messaging_type: 'RESPONSE',
    recipient: { id: recipientId },
    message: { text: truncateMessage(message, 2000) },
  };
}

export function buildFacebookQuickReplyPayload(
  recipientId: string,
  message: string,
  quickReplies: { title: string; payload: string }[]
): object {
  return {
    messaging_type: 'RESPONSE',
    recipient: { id: recipientId },
    message: {
      text: truncateMessage(message, 2000),
      quick_replies: quickReplies.slice(0, 13).map((reply) => ({
        content_type: 'text',
        title: reply.title.substring(0, 20),
        payload: reply.payload,
      })),
    },
  };
}

export function buildFacebookButtonMessagePayload(
  recipientId: string,
  title: string,
  buttons: { title: string; url: string }[]
): object {
  return {
    messaging_type: 'RESPONSE',
    recipient: { id: recipientId },
    message: {
      attachment: {
        type: 'template',
        payload: {
          template_type: 'generic',
          elements: [{
            title: title.substring(0, 80),
            buttons: buttons.slice(0, 3).map((button) => ({
              type: 'web_url',
              title: button.title.substring(0, 20),
              url: button.url,
            })),
          }],
        },
      },
    },
  };
}

export function buildFacebookPrivateReplyPayload(message: string): object {
  return { message: truncateMessage(message, 2000) };
}
