# Manychat Complete Feature Research

> Comprehensive documentation of Manychat's features, pricing, capabilities, and ecosystem.
> Last Updated: January 2025

---

## Table of Contents

1. [Overview](#overview)
2. [Pricing Plans](#pricing-plans)
3. [Supported Channels](#supported-channels)
4. [Core Automation Features](#core-automation-features)
5. [Flow Builder](#flow-builder)
6. [Triggers & Keywords](#triggers--keywords)
7. [AI Features](#ai-features)
8. [Growth Tools](#growth-tools)
9. [Live Chat & Inbox](#live-chat--inbox)
10. [Analytics & Reporting](#analytics--reporting)
11. [Integrations](#integrations)
12. [E-commerce Features](#e-commerce-features)
13. [User Management](#user-management)
14. [Templates](#templates)
15. [Mobile App](#mobile-app)
16. [Messaging Rules & Limitations](#messaging-rules--limitations)
17. [Security & Compliance](#security--compliance)
18. [Competitors Comparison](#competitors-comparison)

---

## Overview

Manychat is a chat automation and marketing platform that enables businesses to automate conversations across multiple messaging channels. It's officially approved as a **Meta Business Partner**, making it safe and compliant for use with Instagram, Facebook Messenger, and WhatsApp.

### Key Statistics
- **90% open rates** on Instagram DMs (vs 20-25% for email)
- **60% reply rates** on automated messages
- **28% click-through rates** from DMs (vs 2-3% for email)
- **1+ million businesses** using the platform
- **80% more sales** reported by businesses mastering drip campaigns

### Supported Platforms
- Instagram DMs
- Facebook Messenger
- WhatsApp Business
- SMS
- Email
- Telegram
- TikTok (Beta)

---

## Pricing Plans

### Free Plan - $0/month
**Includes:**
- Up to 1,000 contacts
- Unlimited custom flows
- Basic Growth Tools
- 10 customer Tags
- Basic automation triggers
- Live Chat support for Messenger and Instagram
- Manychat branding on messages

**Limitations:**
- Contacts cannot be deleted or unsubscribed
- Only 10 customer tags
- Limited features and heavily branded

---

### Pro Plan - Starting at $15/month
**Pricing by Contact Count:**
| Contacts | Monthly Price |
|----------|---------------|
| 500 | $15 |
| 1,000 | $25 |
| 5,000 | $45 |
| 10,000 | $65 |
| 25,000 | $145 |
| 50,000 | $265 |
| 100,000 | $485 |
| 500,000 | $2,175 |
| 1M | $4,175 |
| 2M | $8,175+ |

**Includes Everything in Free, Plus:**
- Unlimited contacts (scaled pricing)
- Unlimited Growth Tools and Keywords
- Unlimited Tags, Custom Fields, & Advanced Segments
- Manychat Analytics & Insights
- All integrations
- SMS and Email channels
- WhatsApp Business API
- Remove Manychat branding
- Advanced automation features

---

### AI Add-on - $29/month
**Requires Pro or Elite plan. Includes:**
- AI Intent Recognition
- AI Step automation blocks
- AI Text Improver
- AI Flow Builder Assistant
- Automatic AI-powered responses

---

### Inbox Pro - $99/month
**For larger support/sales teams:**
- 3 Live Chat agent seats included
- Additional seats: $39/month each
- Unlimited collaborator seats
- Advanced conversation management
- Auto-assignment rules

---

### Elite/Enterprise Plan - Custom Pricing
**For large businesses and agencies:**
- Dedicated Customer Success Manager
- Custom solutions
- Priority support
- Contact sales for quote

---

### Additional Costs
- **WhatsApp messages**: Per-message pricing based on template category and destination country
- **SMS messages**: Per-message pricing
- **Email messages**: Per-message pricing
- **First 1,000 user-initiated WhatsApp conversations**: Free

---

## Supported Channels

### Instagram DMs
- Comment-to-DM automation
- Story reply triggers
- Follow-to-DM automation (new followers)
- Keyword triggers in DMs
- Live Chat management
- Reel comment automation

### Facebook Messenger
- Full chatbot functionality
- Quick Replies (up to 11 options)
- Buttons and Cards/Galleries
- Messenger Lists (recurring notifications)
- Message Tags for outside 24-hour window
- Native buy buttons

### WhatsApp Business
- Message Templates (pre-approved by WhatsApp)
- 24-hour messaging window
- Broadcast campaigns
- Marketing, Utility, and Authentication templates
- Requires Facebook Business Manager verification
- Tiered sending limits (1K to unlimited/day)

### SMS
- Broadcast campaigns
- Drip sequences
- Two-way conversations
- Per-message pricing
- Opt-in/opt-out management

### Email
- Broadcast campaigns
- Drip sequences
- Integration with automations
- Per-message pricing

### Telegram
- No messaging limitations
- Full automation support
- Send messages anytime

### TikTok (Beta)
**Currently Available:**
- "User sends a message" trigger
- "User clicks a link" trigger (Ref URL)
- "User scans QR code" trigger
- Live Chat management
- Flow builder with conditions
- Keyword triggers
- Welcome messages and default replies

**Current Limitations:**
- Cannot auto-DM commenters (user must message first)
- 48-hour reply window
- Links not clickable in DMs
- Not available in UK/EU

**Coming Soon:**
- Comment-to-Message triggers
- Clickable links and buttons

---

## Core Automation Features

### Comment-to-DM Automation
Automatically send DMs to users who comment on posts or reels with specific keywords.

**How It Works:**
1. User comments on your post/reel with a trigger keyword (e.g., "INFO", "LINK", "FREE")
2. Manychat detects the keyword and triggers the automation
3. Optionally sends a public reply to the comment
4. Sends a private DM with your content (lead magnet, link, conversation starter)

**Features:**
- Keyword matching (exact or contains)
- Keyword exclusion (ignore certain words)
- Public reply option (comment back publicly)
- Private DM follow-up
- Works on posts, reels, and live videos
- Multiple keyword variations supported
- Case-insensitive matching

**Configuration Options:**
| Setting | Description |
|---------|-------------|
| **Trigger Keywords** | Words that activate the automation |
| **Excluded Keywords** | Words that prevent triggering |
| **Public Reply** | Optional comment reply (multiple variants for natural feel) |
| **DM Content** | The private message flow to send |
| **Specific Posts** | Limit to certain posts or all posts |

**Important Limitations:**
- One trigger per unique user per post (Instagram API limitation)
- If same user comments again with keyword, automation won't fire twice
- Public replies should be varied and lengthy to avoid spam detection

**Best Practices:**
- Use multiple public reply variants (rotate randomly)
- Make public replies conversational, not robotic
- Use specific keywords related to your offer
- Add typo variations (e.g., "free", "fre", "freee")

---

### Story Reply Automation
Trigger automations when users reply to Instagram Stories.

**How It Works:**
1. User replies to your story (text, emoji, or reaction)
2. Manychat detects the reply and optional keyword/emoji
3. Triggers your automation flow
4. Sends automated response in DMs

**Features:**
- All responses trigger OR keyword-specific
- Emoji triggers supported (🔥, ❤️, etc.)
- Works with story highlights (if "All stories" selected)
- Text and reaction detection
- Immediate response capability

**Configuration Options:**
| Setting | Description |
|---------|-------------|
| **All Stories** | Trigger on any story reply |
| **Specific Keywords** | Only trigger on certain words/emojis |
| **All Responses** | Trigger on any reply type |
| **Emoji Triggers** | Specific emoji reactions |

**Limitations:**
- Does NOT work with Close Friends stories
- Cannot attach to specific highlight stories
- Story must still exist OR be in highlights for trigger to work

**Use Cases:**
- Poll responses → personalized follow-up
- "DM me INFO" story → automated delivery
- Emoji reactions → engagement acknowledgment
- Q&A responses → automated answers

---

### Follow-to-DM (New Feature 2025)
Automatically send a message when someone follows your account. **Most requested feature** - now available.

**How It Works:**
1. New user follows your Instagram account
2. Manychat detects the new follower event
3. Automatically sends welcome DM
4. Starts conversation at peak interest moment

**Features:**
- Instant trigger on new follow
- Personalized welcome messages
- Lead capture opportunity
- Immediate engagement
- High open rates (user just followed = interested)

**Use Cases:**
| Use Case | Example Message |
|----------|-----------------|
| **Welcome** | "Hey! Thanks for the follow 🙌 What brought you here?" |
| **Discount** | "Welcome! Here's 10% off your first order: CODE10" |
| **Lead Magnet** | "Thanks for following! Want my free guide? Reply YES" |
| **Cross-Promote** | "Hey! I also post exclusive content on YouTube: [link]" |
| **Giveaway** | "You're entered! Reply with your email to confirm" |
| **Qualify** | "Thanks! Are you looking for [A] or [B]?" |

**Best Practices:**
- Keep first message short and friendly
- Ask a question to encourage reply
- Don't immediately sell - build rapport first
- Personalize with {{first_name}} if available

---

### Keyword DM Response
Trigger automations based on keywords in direct messages.

**How It Works:**
1. User sends a DM containing a trigger keyword
2. Manychat matches keyword (exact or partial)
3. Triggers corresponding automation flow
4. Sends automated response

**Keyword Configuration:**

| Match Type | Description | Example |
|------------|-------------|---------|
| **Is** | Exact match only | "price" matches "price" not "prices" |
| **Contains** | Partial match | "price" matches "what's the price?" |
| **Begins with** | Starts with keyword | "help" matches "help me please" |
| **Ends with** | Ends with keyword | "info" matches "send info" |

**Features:**
- Multiple keywords per trigger
- Case-insensitive matching
- Typo tolerance (add variations)
- Exclusion keywords
- Priority ordering (first match wins)

**Best Practices:**
- Use specific, relevant keywords (not "hi" or "yes")
- Add common typos as variations
- Keep keywords related to your offer
- Use exclusion to prevent false triggers
- Test thoroughly before going live

**Example Keyword Setup:**
```
Trigger: Free Guide
Keywords: free, guide, ebook, download, freebie, freee, giude
Exclusion: unsubscribe, stop, cancel
```

---

### Quick Automations
Step-by-step guided automation creation for beginners - no flow builder knowledge needed.

**Available Quick Automations:**

| Type | Description | Output |
|------|-------------|--------|
| **Comment Auto-Reply** | Reply to post comments | Public reply + DM |
| **Email Collection** | Capture email addresses | Lead capture flow |
| **Link Delivery** | Send links on keyword | Automated link sender |
| **Follow-Up Offer** | Send offers after interaction | Sales sequence |
| **Lead Generation** | Qualify and capture leads | Multi-step form |

**How It Works:**
1. Select Quick Automation type
2. Follow step-by-step wizard
3. Fill in your content (messages, keywords, links)
4. Preview and test
5. Publish

**Ideal For:**
- Beginners new to automation
- Simple use cases
- Quick setup (under 5 minutes)
- Testing before building complex flows

---

### Default Reply
Catch-all response when no other automation matches.

**Features:**
- Fires when no keyword/trigger matches
- Prevents users from being ignored
- Can route to human or provide options
- Customizable message

**Best Practices:**
- Acknowledge the message
- Provide common options
- Offer human support option
- Don't leave users hanging

---

### Welcome Message
First message when user initiates conversation.

**Features:**
- Triggers on first-ever message
- Sets the tone for the conversation
- Can include quick replies for routing
- Brand introduction opportunity

---

## Flow Builder

### Overview
Visual drag-and-drop editor for creating automation sequences without coding. The heart of Manychat's automation system.

### Interface Components

**Canvas:**
- Infinite scrollable workspace
- Zoom in/out (mouse wheel or buttons)
- Pan by dragging
- Grid background for alignment
- Mini-map for navigation (large flows)

**Toolbar:**
- Add blocks
- Undo/redo
- Auto-arrange
- Preview/test
- Publish
- Settings

**Side Panel:**
- Block configuration
- Variables
- Conditions
- Settings

### Key Features

**Visual Editor:**
- Bird's-eye view of entire automation
- Drag and drop interface
- Zoom and pan navigation
- Auto-arrange for clean layouts
- Real-time preview
- Connection lines show flow
- Color-coded block types

**Starting Step:**
Every flow begins with a Starting Step that defines:
- Which trigger(s) activate the flow
- Entry conditions
- Channel (Instagram, Messenger, etc.)

---

### Building Blocks (Detailed)

#### Content Blocks

| Block | Description | Options |
|-------|-------------|---------|
| **Text** | Send text message | Variables, emoji, formatting |
| **Image** | Send image | Upload or URL, caption |
| **Video** | Send video | Upload or URL, caption |
| **Audio** | Send audio file | Upload or URL |
| **File** | Send document | PDF, etc. |
| **Card** | Rich card with image | Image, title, subtitle, buttons |
| **Gallery** | Horizontal card carousel | Up to 10-11 cards |
| **Typing** | Show typing indicator | Duration setting |

#### Action Blocks

| Block | Description | Use Case |
|-------|-------------|----------|
| **Set Custom Field** | Store user data | Save email, preferences |
| **Add Tag** | Label user | Segment users |
| **Remove Tag** | Remove label | Update segments |
| **Subscribe to Sequence** | Add to drip | Start email series |
| **Unsubscribe from Sequence** | Remove from drip | Stop messages |
| **Notify Admin** | Alert team member | Human escalation |
| **External Request** | HTTP API call | Webhook, integration |
| **Zapier** | Trigger Zap | External automation |
| **Google Sheets** | Add row | Data logging |
| **Convert Channel** | Switch channel | Move to SMS/Email |
| **Log Conversion** | Track conversion | Analytics |
| **Mark as Open/Closed** | Live Chat status | Handoff |

#### Logic Blocks

| Block | Description | Use Case |
|-------|-------------|----------|
| **Condition** | If/then branching | Route by user data |
| **Randomizer** | Random path selection | A/B testing |
| **Smart Delay** | Wait before next step | Timing sequences |
| **Go-To** | Jump to another flow | Reuse flows |
| **AI Step** | AI conversation | Dynamic responses |

---

### Quick Replies (Detailed)

Interactive buttons that appear below a message. User taps to respond.

**Specifications:**
- Maximum: 10-11 quick replies per message
- Character limit: ~20 characters per button
- Icon support: Add emoji or image before text
- Cannot combine with regular buttons in same message

**Configuration Options:**

| Option | Description |
|--------|-------------|
| **Label** | Button text shown to user |
| **Icon** | Optional emoji/image |
| **Go to step** | Where to route when clicked |
| **Follow-up timeout** | Auto-message if no response |
| **Retry attempts** | Re-send if user types instead of clicking |

**Follow-up Settings:**
- Enable "Follow up if contact hasn't engaged"
- Set delay (seconds to 24 hours)
- Define follow-up message
- Up to 5 retry attempts if user doesn't use quick replies

**Example Quick Reply Setup:**
```
Message: "What are you interested in?"

Quick Replies:
[📦 Products] → Product flow
[💰 Pricing] → Pricing flow
[❓ Support] → Support flow
[👋 Talk to human] → Live Chat
```

---

### Buttons (Detailed)

Persistent buttons attached to cards or messages.

**Button Types:**

| Type | Action | Example |
|------|--------|---------|
| **URL** | Open website | "Visit Shop" → yoursite.com |
| **Phone** | Open dialer | "Call Us" → +1234567890 |
| **Postback** | Trigger flow step | "Learn More" → Info flow |
| **Share** | Share message | "Share with friend" |
| **Buy** | Payment (Messenger) | "Buy Now" → Checkout |

**Specifications:**
- Maximum: 3 buttons per card/message
- Character limit: ~20 characters
- Can track clicks for analytics

**URL Button Options:**
- Full-size webview
- Half-size webview
- Compact webview
- Open in browser

---

### Cards & Galleries (Detailed)

Rich media format for showcasing products, options, or content.

**Single Card:**
```
┌─────────────────────┐
│      [IMAGE]        │
├─────────────────────┤
│ Title               │
│ Subtitle text here  │
├─────────────────────┤
│ [Button 1]          │
│ [Button 2]          │
│ [Button 3]          │
└─────────────────────┘
```

**Card Specifications:**
- Image: Required (recommended 1.91:1 ratio)
- Title: Required, ~80 characters
- Subtitle: Optional, ~80 characters
- Buttons: 1-3 buttons
- Default action: Tap card to open URL

**Gallery (Carousel):**
```
┌────────┐ ┌────────┐ ┌────────┐
│ Card 1 │ │ Card 2 │ │ Card 3 │ → scroll →
└────────┘ └────────┘ └────────┘
```

**Gallery Specifications:**
- Maximum: 10-11 cards
- Horizontal scroll on mobile
- All cards share same structure
- Great for products, services, options

**Use Cases:**
- Product catalog display
- Service menu
- Multiple choice with images
- Portfolio showcase

---

### Conditions (Detailed)

Branch logic based on user data or system values.

**Condition Structure:**
```
IF [Field] [Operator] [Value]
  → THEN path (matches)
  → ELSE path (doesn't match)
```

**Available Operators:**

| Type | Operators |
|------|-----------|
| **Text** | is, is not, contains, doesn't contain, starts with, ends with, is set, is not set |
| **Number** | equals, not equals, greater than, less than, greater or equal, less or equal |
| **Boolean** | is true, is false |
| **Date** | before, after, is, is not, within last X days |
| **Array** | contains, doesn't contain |

**Condition Sources:**

| Source | Examples |
|--------|----------|
| **Tags** | has tag "VIP", doesn't have "Unsubscribed" |
| **Custom Fields** | email is set, score > 50 |
| **System Fields** | gender is "male", locale contains "en" |
| **Sequences** | subscribed to "Welcome Series" |
| **Segments** | is in segment "Hot Leads" |
| **Time** | current hour between 9-17 |

**Multiple Conditions:**
- AND: All conditions must match
- OR: Any condition can match
- Combine for complex logic

**Example:**
```
IF tag "Purchased" is set
AND custom field "satisfaction" > 4
  → Send review request
ELSE
  → Send follow-up offer
```

---

### Smart Delay (Detailed)

Pause automation for specified time before continuing.

**Delay Options:**

| Unit | Range | Use Case |
|------|-------|----------|
| **Seconds** | 1-59 | Typing simulation |
| **Minutes** | 1-59 | Short follow-up |
| **Hours** | 1-23 | Same-day follow-up |
| **Days** | 1-30+ | Drip campaign spacing |

**Advanced Options:**
- **Specific time**: Send at exact time (e.g., 9 AM)
- **Day of week**: Only send on certain days
- **Timezone**: Respect user's timezone
- **Business hours**: Only during set hours

**Smart Delay vs Sequence:**
- Smart Delay: Single wait within a flow
- Sequence: Multi-message drip campaign with scheduling

**Example Drip Flow:**
```
Welcome Message
  ↓ [Smart Delay: 1 day]
Follow-up Message
  ↓ [Smart Delay: 3 days]
Offer Message
  ↓ [Smart Delay: 7 days]
Final Reminder
```

---

### Go-To Block (Detailed)

Jump to another flow or specific step.

**Use Cases:**
- Reuse common flows (FAQ, Support)
- Modular flow design
- Reduce duplication
- Organize complex automations

**Options:**
- Go to another flow (start)
- Go to specific step in current flow
- Go to specific step in another flow

---

### Randomizer (Detailed)

Split traffic randomly for A/B testing or variety.

**Configuration:**
```
Randomizer
  ├─ Path A (50%) → Message variant A
  └─ Path B (50%) → Message variant B
```

**Options:**
- 2-5+ paths
- Custom percentage per path
- Equal split option

**Use Cases:**
- A/B test messages
- A/B test offers
- Randomize responses (feel natural)
- Test different flows

---

### Variables & Personalization

Insert dynamic content into messages.

**System Variables:**
| Variable | Description |
|----------|-------------|
| `{{first_name}}` | User's first name |
| `{{last_name}}` | User's last name |
| `{{full_name}}` | User's full name |
| `{{messenger_user_id}}` | Unique user ID |
| `{{timezone}}` | User's timezone |
| `{{locale}}` | User's language |

**Custom Variables:**
- Any Custom User Field
- Bot Fields (global values)
- Flow-specific variables

**Fallback Values:**
```
Hi {{first_name | there}}!
```
If first_name is empty, shows "Hi there!"

### Conditions
Filter users based on:
- Tags (has/doesn't have)
- Custom User Fields
- System Fields
- Sequence subscription status
- Time-based conditions
- Segments
- Combine with AND/OR logic

### Rules System
**Trigger → Condition → Action**
- Trigger: Event that starts the rule
- Condition: Filter criteria
- Action: What happens

---

## Triggers & Keywords

### Available Triggers

**Instagram:**
- User sends a message
- User comments on post/reel
- User replies to story
- User clicks referral link
- User scans QR code
- New follower (Follow-to-DM)

**Messenger:**
- User sends a message
- User clicks referral link
- User scans QR code
- Checkbox plugin opt-in
- Customer chat widget
- Recurring notification opt-in

**WhatsApp:**
- User sends a message
- User clicks referral link

**TikTok (Beta):**
- User sends a message
- User clicks referral link
- User scans QR code

**General:**
- Keyword match
- Intent recognition (AI)
- Custom event
- Zapier trigger
- Shopify triggers (abandoned cart, order placed, etc.)

### Keyword Settings
- Exact match or contains
- Case insensitive
- Multiple keywords per trigger
- Exclusion keywords
- Typo variations recommended

---

## AI Features

### Requires AI Add-on ($29/month on Pro/Elite)

### Intent Recognition
- Understands meaning, not just keywords
- Handles typos and natural language
- More accurate than keyword matching
- Works on Instagram, Messenger, WhatsApp, Telegram

### AI Step
- Scripted AI-driven conversations
- Lead qualification automation
- Email/phone collection
- Custom goals and guidance
- Natural conversation flow

### AI Text Improver
- Rewrite messages for clarity
- Adjust tone of voice (Professional, Friendly, Humorous, Informative)
- Grammar and phrasing suggestions
- Translation support

### AI Flow Builder Assistant
- Creates automations from natural language descriptions
- Generates complete flows from single goals
- Available for Instagram, Messenger, WhatsApp, Telegram

### Automatic AI Responses (New)
- Runs continuously in background
- Analyzes incoming messages and comments
- Automatically responds to business questions
- Reacts to positive comments

---

## Growth Tools

### Overlay Widgets (Messenger - Deprecated Sept 2024)
- Modal pop-ups
- Slide-ins
- Page takeover
- Bar widgets
- **Note:** Facebook widgets for web-to-Messenger no longer available as of Sept 30, 2024

### Embeddable Widgets

**Button Widget:**
- Low-key call-to-action
- Links to specific flow
- Customizable appearance

**Box Widget:**
- Opt-in form for pages
- Lead magnet delivery
- Minimal coding required

**SMS Modal:**
- Convert visitors to SMS subscribers
- Requires SMS channel activation

### Landing Pages
- Built-in landing page builder
- Mobile-optimized
- Quick setup (minutes)
- Perfect for lead magnets, webinars, giveaways
- Hosted by Manychat

### QR Codes
- Generate scannable codes
- Direct to specific flow
- Perfect for print materials:
  - Business cards
  - Product packaging
  - Event signage
  - Menus
  - Receipts
- **Messenger only** (Facebook limitation)

### Referral URLs (Ref Links)
- Trackable links to flows
- Use anywhere:
  - Social media bios
  - Email signatures
  - Ads
  - Website links
- Track source attribution

### TikTok QR Codes
- New feature for offline-to-online conversion
- Opens TikTok app
- Launches automation flow

---

## Live Chat & Inbox

### Manychat Inbox
Unified inbox for all messaging channels in one place.

**Supported Channels:**
- Instagram DMs
- Facebook Messenger
- WhatsApp
- Telegram
- TikTok
- SMS

### Features

**Organization:**
- Folders: Inbox, Unassigned, Assigned to me, Team folders
- Labels/Tags for categorization
- Snooze threads (coming soon)
- Search by keyword, contact, or tag
- Filter by Open/Closed status

**Team Collaboration:**
- Multiple agent seats
- Manual assignment
- Auto-assignment rules
- Team notes with @mentions
- Conversation handoff

**Auto-Assignment:**
- Rule-based distribution
- Conditions for routing
- Team or individual assignment
- Configurable in Settings

### Human Handoff
- Seamless transition from bot to human
- "Open" conversation = transferred to agent
- "Closed" = back to automation
- AI can trigger handoff based on keywords/intent

### Pricing
- Free/Pro: Up to 3 Live Chat agents
- Inbox Pro ($99/mo): Unlimited agents ($39/extra seat)

### Mobile App Support
- Respond on the go
- Push notifications
- Same inbox features

---

## Analytics & Reporting

### Requires Pro Plan

### Dashboard Metrics
- **Earned**: Total revenue for time period
- **ARPPU**: Average Revenue Per Paying User
- Conversion events over time
- Revenue by flow

### Conversion Types

| Type | Description | Setup |
|------|-------------|-------|
| **Buy Button** | In-Messenger purchases | Automatic |
| **Contact Collection** | Email/phone captured | Automatic |
| **Shopify** | Store purchases | Automatic (with integration) |
| **Custom Events** | Your defined conversions | Manual (Log Conversion Event) |
| **ManyChat Pixel** | Website conversions | Manual (pixel installation) |

### Reports
- Revenue graph (daily breakdown)
- Conversion events graph
- Flow performance
- Time period filtering
- Export capabilities

### Live Chat Analytics
- Response times
- Conversation handling
- Workload distribution
- Agent performance

### Integration Options
- Google Analytics (via Zapier)
- Databox dashboards
- Custom reporting via API

---

## Integrations

### Native Integrations

**CRM & Marketing:**
- HubSpot (forms, contacts, data retrieval)
- Mailchimp
- ActiveCampaign
- Google Sheets
- Flodesk

**E-commerce:**
- Shopify (full integration)
- PayPal
- Stripe
- Hotmart

**Other:**
- Calendly
- Typeform
- ConverKit
- Klaviyo

### Zapier Integration (Pro Plan Required)
Connect to 7,000+ apps including:
- Slack
- Airtable
- Notion
- Salesforce
- Zoho CRM
- GetResponse
- And many more...

### Zapier Triggers
- New or Updated Custom Field
- New Subscriber
- New Tagged User
- New "Trigger a Zap" Event
- Chat Opened

### Zapier Actions
- Subscribe User to Sequence
- Unsubscribe User From Sequence
- Send Text Message to User
- Set Custom Field
- Add Tag to User
- Remove Tag From User

### ManyChat App Store
- 61+ apps available
- Third-party integrations
- Extended functionality
- Unique to ManyChat (competitors don't have this)

---

## E-commerce Features

### Shopify Integration

**Setup:**
1. Go to Settings → Integrations
2. Enter Shopify store address
3. Click Connect Shopify Account
4. Install app in Shopify

**Features:**

**Abandoned Cart Recovery:**
- Trigger: Cart abandonment
- Customizable delay (default 1 hour)
- Dynamic cart URL variable
- Abandoned Cart Gallery (show abandoned items)
- Multi-message campaigns
- Available via Messenger, SMS, Email

**Product Catalog:**
- Products in Cart condition
- Product-specific messages
- Carousel displays

**Order Notifications:**
- Placed Order trigger
- Fulfilled Order trigger
- Shipping updates
- Order status inquiries

**Additional Capabilities:**
- Customer segmentation by behavior
- Review collection
- Repeat purchase campaigns
- Automatic customer responses
- Variable data (order details, shipping info)

### Shopify Variables
- Cart URL
- Order number
- Shipping status
- Product details
- Customer information

---

## User Management

### Tags
- Label contacts for segmentation
- Add/remove via automation or manually
- Use in conditions and broadcasts
- Free: 10 tags / Pro: Unlimited

### Custom User Fields (CUFs)
Store unique data per contact:
- Text fields
- Number fields
- Date fields
- Boolean fields
- Array fields

**Uses:**
- Personalization (variables in messages)
- Conditions for routing
- Integration data sync
- User preferences storage

### System Fields
Automatically captured:
- First Name
- Last Name
- Full Name
- Gender (Messenger)
- Locale/Language
- Timezone
- Last Interaction
- Subscribed date
- Profile picture URL

### Segments
Save filter combinations for reuse:
- Tag-based
- Field-based
- Behavior-based
- Time-based
- Combined conditions

**Use in:**
- Broadcasts
- Conditions
- Reporting
- Integrations

### Contact Management
- View all contacts in Audience tab
- Filter and search
- Bulk actions (Pro)
- Export contacts
- Delete contacts (Pro only)
- GDPR compliance tools

---

## Templates

### Official ManyChat Templates
- Pre-built automations in Templates section
- Industry-specific options
- Free and Pro templates
- Automatic Pro detection for advanced elements

### AI Flow Builder
- Describe your goal
- AI generates complete automation
- Customize as needed

### Third-Party Template Libraries

**Botmakers:**
- 166+ templates
- Lead generation
- Healthcare, Real Estate, etc.
- Appointment booking

**Chatimize:**
- Free templates (email signup required)
- Pro templates available

**Chat Response:**
- Free basic templates
- Business-focused solutions

**ParsLabs:**
- Template library
- Video instructions
- Customization guides

### Common Template Types
- Lead generation funnels
- Appointment booking
- FAQ automation
- Giveaways/contests
- Email list building
- E-commerce flows
- Webinar registration
- Customer service

### Creating Your Own Templates
- Share entire bot
- Include Tags, Custom Fields, Actions
- Share with clients or community

---

## Mobile App

### Platforms
- **iOS**: Requires iOS 16.0 or later
- **Android**: Available on Google Play
- **macOS**: Requires M1 chip, macOS 13.0+

### Features

**Inbox Management:**
- All channel conversations
- Filter by Open/Closed
- Search functionality
- Assign to team members
- Real-time responses

**Automation:**
- Prebuilt automations
- Edit existing flows
- Create Instagram flows only (new)

**Notifications:**
- Push notifications
- Real-time alerts
- Performance tracking

**Interface:**
- Dark Mode support
- Clean, mobile-optimized UI

### Limitations (Mobile vs Web)
- New flows: Instagram only
- No contact creation/deletion/import
- No account reconnection (Refresh Permissions)
- No integration configuration
- No subscription changes

---

## Messaging Rules & Limitations

### 24-Hour Messaging Window

**Applies to:** Instagram, Messenger, WhatsApp

**Rule:**
- Window opens on user's last interaction
- Send any messages freely within 24 hours
- After 24 hours, restrictions apply

**ManyChat Protection:**
- Automatically prevents messages outside window
- Keeps you compliant

### 7-Day Window (Human Agent Tag)

**Messenger & Instagram only:**
- After 24-hour window closes
- 7-day window for **manual** Live Chat messages only
- No automation allowed
- Human Agent tag automatically applied

### Message Tags (Messenger)
Send **non-promotional** messages outside 24 hours:

| Tag | Use Case |
|-----|----------|
| CONFIRMED_EVENT_UPDATE | Event reminders for registered users |
| POST_PURCHASE_UPDATE | Order/shipping updates |
| ACCOUNT_UPDATE | Account status changes |
| HUMAN_AGENT | Live Chat (7-day window) |

**Cannot use for:**
- Product announcements
- Event invitations (non-registered)
- Cart abandonment
- Blog post notifications
- Promotional content

### WhatsApp Specific Rules

**Message Templates:**
- Required outside 24-hour window
- Must be pre-approved by WhatsApp
- Categories: Marketing, Utility, Authentication

**Sending Limits (Tiered):**
| Tier | Daily Unique Contacts |
|------|----------------------|
| 1 | 1,000 |
| 2 | 10,000 |
| 3 | 100,000 |
| 4 | Unlimited |

**Free Messages:**
- All user-initiated messages
- Utility templates within 24-hour window
- First 1,000 user-started conversations/month

### Instagram Specific Rules
- No messages outside 24-hour window (cannot send)
- Comment trigger fires once per user per post
- Story triggers work with highlights (if "All stories" selected)
- No Close Friends story support

### Telegram
- No messaging limitations
- Send anytime, any content

### TikTok (Beta)
- 48-hour reply window
- User must message first
- No comment-to-DM yet

### Violation Consequences
1. Warning from Meta
2. Further infractions = page blocked
3. Restricted status = cannot send new messages until window resets

### Messenger Lists (Recurring Notifications)
- Opt-in required
- One message per 48 hours per token
- Re-engagement outside 24-hour window

---

## Security & Compliance

### Meta Business Partnership
- **Officially approved** Meta Business Partner
- Listed in Facebook's Business Partner Directory
- Weekly meetings with Meta product team
- Periodic Data Use Checkups
- Meta compliance audits

### Certifications

| Certification | Description |
|--------------|-------------|
| **ISO/IEC 27001:2022** | Information Security Management System |
| **SOC 2 Type 2** | Security, Availability, Processing Integrity |
| **CSA STAR Registry** | Trusted Cloud Provider |

### Security Framework
Based on ISO 27001, covering:
- Policies and Procedures
- Asset Management
- Access Management
- Cryptography
- Physical Security
- Operations Security
- Communications Security

### Testing
- Automated security testing
- Manual application testing
- Infrastructure testing
- Annual penetration tests (minimum)
- External independent auditors

### GDPR Compliance
- Meets EU GDPR requirements
- Meets California CCPA requirements
- Data stored in AWS Frankfurt, Germany (EU data stays in EU)
- User data request tools (download, change, remove)
- Automatic data removal 90 days after unsubscribe

### Data Protection
- User consent mechanisms
- Opt-out management
- Data portability
- Right to deletion
- Transparent data practices

---

## Competitors Comparison

### ManyChat vs. Chatfuel

| Feature | ManyChat | Chatfuel |
|---------|----------|----------|
| **Ease of Use** | Better interface | Steeper learning curve |
| **Flow Builder** | Smoother, faster | Slower with large automations |
| **AI/ChatGPT** | AI Add-on ($29/mo) | Better native ChatGPT integration |
| **Multilingual** | Not supported | Built-in support |
| **App Store** | 61+ apps | No app store |
| **Pricing** | $15/mo (500 contacts) | More expensive |
| **Live Chat** | Better | Basic |
| **Analytics** | Better conversion tracking | Basic |

**Choose Chatfuel if:** You need better AI conversations or multilingual support

**Choose ManyChat if:** You want easier setup, better analytics, and more integrations

---

### ManyChat vs. MobileMonkey

| Feature | ManyChat | MobileMonkey |
|---------|----------|--------------|
| **Channels** | Messenger-focused | True omnichannel |
| **Website Chatbot** | Not available | Full support |
| **Learning Curve** | Easier | More complex |
| **AI** | AI Add-on | Basic NLP/keywords |
| **OmniChat** | No | Yes (unified chatbot) |
| **Pricing** | Lower entry | Higher |

**Choose MobileMonkey if:** You need website chatbots or unified omnichannel

**Choose ManyChat if:** You're focused on social messaging (Instagram/Messenger)

---

### Summary Recommendations

| Use Case | Best Choice |
|----------|-------------|
| Instagram/Messenger focus | **ManyChat** |
| Ease of use priority | **ManyChat** |
| Better AI capabilities | Chatfuel |
| Website chatbots | MobileMonkey |
| Multilingual chatbots | Chatfuel |
| Omnichannel unified | MobileMonkey |
| Most integrations | **ManyChat** |
| Best analytics | **ManyChat** |

---

## Key Takeaways for Building a Competitor

### What Makes ManyChat Successful
1. **Visual Flow Builder** - Intuitive, no-code automation creation
2. **Multi-channel** - Instagram, Messenger, WhatsApp, SMS, Email, Telegram, TikTok
3. **Official Meta Partner** - Trust and compliance
4. **Growth Tools** - Multiple ways to acquire subscribers
5. **Shopify Integration** - Deep e-commerce support
6. **AI Features** - Intent recognition, AI steps, text improvement
7. **Analytics** - Conversion tracking, revenue attribution
8. **Templates** - Quick start for common use cases
9. **Mobile App** - Manage on the go
10. **App Store** - Extensibility through third-party apps

### Features to Consider Implementing

**Must Have:**
- Comment-to-DM automation
- Story reply triggers
- Keyword triggers
- Visual flow builder with conditions
- Live Chat / Human handoff
- Contact management (tags, custom fields)
- Basic analytics
- Mobile support

**Nice to Have:**
- AI intent recognition
- AI-powered conversations
- Multi-channel (beyond Instagram)
- E-commerce integrations
- Advanced segmentation
- Broadcast campaigns
- Template library
- Third-party integrations (Zapier)

**Differentiators to Explore:**
- Better AI (like Chatfuel's ChatGPT)
- Website chatbot (like MobileMonkey)
- Multilingual support
- Lower pricing
- Simpler UI for specific use cases
- Better TikTok support (currently limited everywhere)

---

## Sources

- [Manychat Official Website](https://manychat.com/)
- [Manychat Pricing](https://manychat.com/pricing)
- [Manychat Help Center](https://help.manychat.com/)
- [Manychat Blog](https://manychat.com/blog/)
- [Manychat Community](https://community.manychat.com/)
- [Manychat Security](https://manychat.com/security)
- [Manychat Product Page - Instagram](https://manychat.com/product/instagram)
- [Manychat Product Page - WhatsApp](https://manychat.com/product/whatsapp)
- [Manychat Product Page - TikTok](https://manychat.com/product/tiktok)
- [Zapier - Manychat Integrations](https://zapier.com/apps/manychat/integrations)
- Third-party reviews from Tidio, Voiceflow, Chatimize, Geekflare
