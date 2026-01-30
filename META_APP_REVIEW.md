# Meta App Review Submission Guide

This guide walks you through submitting your Instagram DM Bot app for Meta App Review to get production access.

## Prerequisites

Before submitting for App Review, ensure you have:
- [ ] Working webhook endpoint (deployed and responding)
- [ ] Working dashboard (deployed and accessible)
- [ ] Privacy Policy URL
- [ ] Terms of Service URL (optional but recommended)
- [ ] Test Instagram Business account

---

## Step 1: Configure Your Meta App

### 1.1 App Settings

Go to [Meta Developer Dashboard](https://developers.facebook.com/apps/) → Your App → Settings → Basic

Fill in required fields:
- **Display Name**: Your app name (e.g., "DM Automation Platform")
- **App Domains**: Your dashboard domain (e.g., `instagram-dm-bot-app.web.app`)
- **Privacy Policy URL**: `https://your-domain.com/privacy`
- **Terms of Service URL**: `https://your-domain.com/terms`
- **App Icon**: Upload a 1024x1024 icon
- **Category**: Business and Pages

### 1.2 Configure Products

Ensure these products are added to your app:
1. **Instagram Graph API**
2. **Facebook Login**
3. **Webhooks**

---

## Step 2: Set Up Use Cases

Go to **App Review** → **Permissions and Features**

### Required Permissions

| Permission | Use Case Description |
|------------|---------------------|
| `instagram_basic` | Display connected Instagram account info in dashboard |
| `instagram_manage_messages` | Send automated DM responses to users |
| `instagram_manage_comments` | Read comments to trigger comment-to-DM automations |
| `pages_show_list` | Display user's Facebook Pages for account connection |
| `pages_messaging` | Send messages on behalf of connected Pages |
| `pages_read_engagement` | Read Page engagement data for analytics |

### Submitting Each Permission

For each permission, you'll need:
1. **Detailed Use Case** - How your app uses this permission
2. **Screencast** - Video showing the feature in action
3. **Step-by-step instructions** - How reviewers can test

---

## Step 3: Create Screencasts

Record separate screencasts (1-3 minutes each) showing:

### Screencast 1: Account Connection
Show the OAuth flow:
1. User logs into your dashboard
2. Clicks "Connect Instagram Account"
3. Redirected to Facebook OAuth
4. Grants permissions
5. Redirected back with account connected
6. Account appears in dashboard

### Screencast 2: Automated DM Response
Show the messaging feature:
1. User creates an automation in dashboard
2. Sets trigger keyword (e.g., "INFO")
3. Sets response message
4. Someone DMs the keyword to the Instagram account
5. Automated response is sent

### Screencast 3: Comment-to-DM Automation
Show the comment trigger:
1. User creates comment-to-DM automation
2. Sets trigger keyword
3. Someone comments the keyword on a post
4. User receives automated DM

### Screencast 4: Lead Collection
Show data collection:
1. User enables email collection in settings
2. Bot asks for email in conversation
3. User provides email
4. Email appears in Leads dashboard

---

## Step 4: Write Use Case Descriptions

### instagram_manage_messages

```
Our app enables Instagram Business accounts to automate DM responses for customer engagement.

HOW WE USE THIS PERMISSION:
1. Users connect their Instagram Business account via Facebook Login
2. Users configure automated responses in our dashboard
3. When someone DMs the connected account with specific keywords, our system sends an automated response
4. All conversations are logged and viewable in the user's dashboard

USER BENEFIT:
- Instant responses to common inquiries
- Lead collection through automated conversations
- 24/7 customer engagement without manual monitoring

DATA HANDLING:
- Message content is processed only to generate responses
- Conversation logs are stored securely and only accessible to the account owner
- Users can delete their data at any time
```

### instagram_manage_comments

```
Our app reads comments on Instagram posts to trigger automated DM responses.

HOW WE USE THIS PERMISSION:
1. Users create "Comment-to-DM" automations in our dashboard
2. Users specify trigger keywords (e.g., "FREE", "INFO")
3. When someone comments with the keyword, our system sends them a DM
4. This enables lead generation from post engagement

USER BENEFIT:
- Convert post engagement into direct conversations
- Automate content delivery to interested followers
- Collect leads from viral posts

DATA HANDLING:
- We only read comment text to detect trigger keywords
- Comment data is not stored permanently
- Users control which keywords trigger automations
```

### pages_messaging

```
Our app sends messages on behalf of Facebook Pages connected to Instagram Business accounts.

HOW WE USE THIS PERMISSION:
1. Users connect their Facebook Page during OAuth
2. The Page Access Token is used to send Instagram DMs
3. Messages are sent as automated responses or welcome messages

USER BENEFIT:
- Seamless Instagram DM automation through Page connection
- Consistent brand messaging across platforms

DATA HANDLING:
- Page Access Tokens are encrypted and stored securely
- Tokens are automatically refreshed before expiration
- Users can disconnect their Page at any time
```

---

## Step 5: Prepare Test Account

Create a test account for Meta reviewers:

1. Go to your dashboard login page
2. Create a test user account:
   - Email: `meta-reviewer@yourdomain.com`
   - Password: (generate a secure password)

3. Connect a test Instagram Business account to this user

4. Create sample automations so reviewers can see the feature

5. **Document these credentials** - you'll provide them in the submission

---

## Step 6: Submit for Review

### Go to App Review

1. Navigate to **App Review** → **Requests**
2. Click **Request Permissions or Features**

### For Each Permission:

1. Select the permission
2. Provide the use case description
3. Upload the screencast
4. Add testing instructions:

```
TESTING INSTRUCTIONS:

1. Go to: https://instagram-dm-bot-app.web.app
2. Log in with:
   - Email: meta-reviewer@yourdomain.com
   - Password: [provided password]
3. You'll see a connected Instagram account (@test_account)
4. Go to "Automations" and view the existing automation
5. To test the DM automation:
   - Send "INFO" to @test_account on Instagram
   - You should receive an automated response
6. Check "Conversations" to see the logged conversation
```

### Complete Business Verification (if required)

For some permissions, Meta requires business verification:
1. Go to **Settings** → **Business Verification**
2. Upload business documents
3. Wait for verification (2-5 business days)

---

## Step 7: After Submission

### Review Timeline
- Initial response: 1-5 business days
- Full review: 5-15 business days

### If Rejected
Common rejection reasons:
1. **Screencast doesn't show the feature** - Re-record with clearer demonstration
2. **Use case not clear** - Rewrite with more specific details
3. **Missing privacy policy** - Add a proper privacy policy
4. **Test account doesn't work** - Ensure credentials are correct

### If Approved
1. Your app moves from Development to Live mode
2. Permissions are granted for all users (not just testers)
3. You can onboard customers

---

## Privacy Policy Template

Your privacy policy should include:

```markdown
# Privacy Policy

Last updated: [DATE]

## Information We Collect
- Instagram account information (username, account ID)
- Facebook Page information
- Message content for automation purposes
- Email addresses provided by Instagram users

## How We Use Information
- To provide automated DM responses
- To display analytics in your dashboard
- To collect leads on your behalf

## Data Storage
- Data is stored securely on Google Cloud Platform
- Access tokens are encrypted at rest
- You can delete your data at any time

## Third-Party Services
- Meta (Facebook/Instagram) for account connection
- Google Cloud for hosting
- Anthropic (Claude AI) for AI-powered responses

## Contact
Email: support@yourdomain.com
```

---

## Webhook Configuration

Ensure your webhook is properly configured:

### Webhook URL
```
https://us-central1-instagram-dm-bot-app.cloudfunctions.net/instagramWebhook
```

### Subscribed Fields
- `messages` - Receive new DMs
- `messaging_postbacks` - Receive button clicks
- `comments` - Receive comment notifications

### Verify Token
Set in Firebase config:
```bash
firebase functions:config:set verify.token="your_verify_token_here"
```

---

## OAuth Configuration

### Valid OAuth Redirect URIs
Add to your Meta App settings:
```
https://us-central1-instagram-dm-bot-app.cloudfunctions.net/instagramOAuthCallback
```

### App ID and Secret
Set in Firebase:
```bash
firebase functions:config:set facebook.app_id="YOUR_APP_ID"
firebase functions:config:set facebook.app_secret="YOUR_APP_SECRET"
firebase functions:config:set app.oauth_redirect_uri="https://us-central1-instagram-dm-bot-app.cloudfunctions.net/instagramOAuthCallback"
firebase functions:config:set app.web_url="https://instagram-dm-bot-app.web.app"
```

---

## Checklist Before Submission

- [ ] App Settings complete (icon, privacy policy, etc.)
- [ ] Webhook deployed and responding to verification
- [ ] Dashboard deployed and accessible
- [ ] OAuth flow working end-to-end
- [ ] Test account created with sample data
- [ ] Screencasts recorded for each permission
- [ ] Use case descriptions written
- [ ] Privacy policy published
- [ ] All functions deployed to Firebase

---

## Support

If you need help with App Review:
- Meta Developer Support: https://developers.facebook.com/support/
- Developer Community: https://developers.facebook.com/community/
