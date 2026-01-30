# Instagram DM Automation Platform

A ManyChat alternative for your own Instagram Business account with AI-powered conversations.

## Features

- **Comment-to-DM Automation**: Users comment keyword on post → receive DM
- **Keyword DM Responses**: Auto-respond to specific words in DMs
- **Lead Collection**: Capture emails and contact info
- **Auto-DM New Followers**: Welcome new followers automatically
- **AI-Powered Conversations**: Dynamic AI-generated responses using OpenAI

## Tech Stack

- **Backend**: Firebase Cloud Functions (TypeScript)
- **Database**: Firestore
- **Frontend**: Next.js 14 + Tailwind CSS
- **AI**: OpenAI GPT-4o-mini
- **API**: Meta Graph API / Instagram Messaging API

## Project Structure

```
instagram-dm-bot/
├── functions/           # Firebase Cloud Functions
│   ├── src/
│   │   ├── index.ts           # Main entry point
│   │   ├── firebase.ts        # Firebase config & types
│   │   ├── webhooks/          # Instagram webhook handlers
│   │   ├── handlers/          # Message/comment/follower handlers
│   │   ├── services/          # Instagram API, AI, leads
│   │   └── utils/             # Rate limiter, encryption, validators
│   └── package.json
├── web/                 # Next.js Dashboard
│   ├── src/
│   │   ├── app/              # App router pages
│   │   ├── components/       # UI components
│   │   ├── hooks/            # React hooks
│   │   └── lib/              # Firebase client, utils
│   └── package.json
├── firebase.json        # Firebase config
├── firestore.rules      # Security rules
└── firestore.indexes.json
```

## Setup Instructions

### 1. Firebase Setup

1. Create a new Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable Firestore Database
3. Enable Authentication (Email/Password)
4. Upgrade to Blaze plan (required for external API calls)
5. Create a user account for dashboard access

### 2. Meta Developer Setup

1. Go to [developers.facebook.com](https://developers.facebook.com)
2. Create a new app → Select "Business" type
3. Add products: **Instagram Graph API**, **Webhooks**
4. Note your App ID and App Secret

### 3. Instagram Connection

1. Link your Instagram Business/Creator account to a Facebook Page
2. Generate a Page Access Token with permissions:
   - `instagram_basic`
   - `instagram_manage_messages`
   - `instagram_manage_comments`
   - `pages_messaging`
3. Exchange for a long-lived token (60 days):

```bash
curl "https://graph.facebook.com/v18.0/oauth/access_token?\
grant_type=fb_exchange_token&\
client_id={app-id}&\
client_secret={app-secret}&\
fb_exchange_token={short-lived-token}"
```

### 4. Environment Variables

**Functions** (`.env` in `/functions`):

```bash
OPENAI_API_KEY=sk-...
INSTAGRAM_APP_ID=123456789
INSTAGRAM_APP_SECRET=abc123...
VERIFY_TOKEN=your_webhook_verify_token
ENCRYPTION_KEY=32_character_encryption_key_here
```

**Web** (`.env.local` in `/web`):

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123
```

### 5. Deploy

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login
firebase login

# Initialize (select existing project)
firebase init

# Deploy functions
cd functions
npm install
npm run build
firebase deploy --only functions

# Note the webhook URL:
# https://us-central1-YOUR_PROJECT.cloudfunctions.net/instagramWebhook
```

### 6. Configure Webhook

In Meta Developer Portal:

1. Go to Webhooks product
2. Add callback URL: `https://us-central1-YOUR_PROJECT.cloudfunctions.net/instagramWebhook`
3. Set verify token (same as VERIFY_TOKEN env var)
4. Subscribe to:
   - `messages`
   - `messaging_postbacks`
   - `comments`
   - `mentions`

### 7. Run Dashboard Locally

```bash
cd web
npm install
npm run dev
# Open http://localhost:3000
```

## API Rate Limits

| Constraint | Limit | Handling |
|------------|-------|----------|
| DM Rate Limit | 200/hour | Built-in rate limiter + queue |
| Messaging Window | 24 hours | Track last interaction |
| Message Length | 1000 bytes | Auto-truncate |
| Token Expiry | 60 days | Weekly auto-refresh |

## Creating Automations

### Comment-to-DM

Triggers when users comment specific keywords on your posts:

```json
{
  "type": "comment_to_dm",
  "trigger": {
    "keywords": ["FREE", "GUIDE", "LINK"],
    "postIds": [] // Leave empty for all posts
  },
  "response": {
    "type": "ai",
    "aiPrompt": "You are a friendly assistant..."
  },
  "collectEmail": true
}
```

### Keyword DM Response

Triggers when users send DMs containing specific words:

```json
{
  "type": "keyword_dm",
  "trigger": {
    "keywords": ["PRICING", "COST", "BUY"]
  },
  "response": {
    "type": "static",
    "staticMessage": "Thanks for your interest! Our pricing starts at..."
  }
}
```

### New Follower Welcome

Automatically DMs new followers:

```json
{
  "type": "new_follower",
  "trigger": {
    "keywords": [] // Not used for this type
  },
  "response": {
    "type": "ai",
    "aiPrompt": "Generate a warm welcome message for new followers of a fitness brand"
  }
}
```

## Cost Estimate

| Service | Monthly Cost |
|---------|-------------|
| Firebase Blaze | ~$5-25 (pay as you go) |
| OpenAI API | ~$5-50 (depends on volume) |
| **Total** | **~$10-75/month** |

## Troubleshooting

### Webhook not receiving events

1. Verify webhook URL is correct in Meta Developer Portal
2. Check VERIFY_TOKEN matches
3. View Cloud Functions logs: `firebase functions:log`

### Messages not sending

1. Check rate limit status in dashboard
2. Verify access token hasn't expired
3. Ensure user has interacted within 24 hours (messaging window)

### AI responses not working

1. Verify OPENAI_API_KEY is set
2. Check OpenAI API quota/billing
3. Review automation's AI prompt

## License

MIT
