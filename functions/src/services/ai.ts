import Anthropic from '@anthropic-ai/sdk';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

let anthropic: Anthropic | null = null;
let apiKey: string | null = null;

async function getApiKey(): Promise<string | null> {
  if (apiKey) return apiKey;

  // Try environment variable first
  if (process.env.ANTHROPIC_API_KEY) {
    apiKey = process.env.ANTHROPIC_API_KEY;
    return apiKey;
  }

  // Try Secret Manager
  try {
    const client = new SecretManagerServiceClient();
    const [version] = await client.accessSecretVersion({
      name: 'projects/instagram-dm-bot-app/secrets/ANTHROPIC_API_KEY/versions/latest',
    });
    apiKey = version.payload?.data?.toString() || null;
    return apiKey;
  } catch (error) {
    console.error('Failed to load API key from Secret Manager:', error);
    return null;
  }
}

async function getAnthropic(): Promise<Anthropic | null> {
  if (anthropic) return anthropic;

  const key = await getApiKey();
  if (!key) {
    console.log('No Anthropic API key available');
    return null;
  }

  anthropic = new Anthropic({ apiKey: key });
  return anthropic;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Generate AI response for DM conversation using Claude Sonnet
 */
export async function generateAIResponse(
  systemPrompt: string,
  conversationHistory: ChatMessage[],
  options: {
    maxTokens?: number;
    temperature?: number;
  } = {}
): Promise<string> {
  const {
    maxTokens = 300,
    temperature = 0.7,
  } = options;

  // Get Anthropic client
  const client = await getAnthropic();
  if (!client) {
    console.log('Anthropic client not available, using fallback response');
    return "Hey! Thanks for reaching out. I'll get back to you soon!";
  }

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: conversationHistory.map(m => ({
        role: m.role === 'system' ? 'user' : m.role,
        content: m.content,
      })),
    });

    const aiMessage = response.content[0]?.type === 'text'
      ? response.content[0].text
      : null;

    if (!aiMessage) {
      console.error('Empty AI response');
      return "Thanks for your message! I'll get back to you soon.";
    }

    return aiMessage;
  } catch (error) {
    console.error('Claude API error:', error);
    return "Thanks for reaching out! I'll respond shortly.";
  }
}

/**
 * Analyze message intent for routing
 */
export async function analyzeIntent(
  message: string,
  context?: string
): Promise<{
  intent: 'question' | 'email_provided' | 'phone_provided' | 'greeting' | 'purchase_interest' | 'complaint' | 'other';
  confidence: number;
  extractedData?: {
    email?: string;
    phone?: string;
  };
}> {
  const client = await getAnthropic();
  if (!client) {
    return { intent: 'other', confidence: 0 };
  }

  const systemPrompt = `You are an intent classifier for Instagram DM messages.
Analyze the message and return ONLY a JSON object with:
- intent: one of "question", "email_provided", "phone_provided", "greeting", "purchase_interest", "complaint", "other"
- confidence: 0-1 score
- extractedData: object with email or phone if found

Only output valid JSON, nothing else.`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 150,
      system: systemPrompt,
      messages: [
        { role: 'user', content: `Context: ${context || 'general conversation'}\nMessage: ${message}` },
      ],
    });

    const content = response.content[0]?.type === 'text' ? response.content[0].text : '{}';
    const result = JSON.parse(content);
    return {
      intent: result.intent || 'other',
      confidence: result.confidence || 0.5,
      extractedData: result.extractedData,
    };
  } catch (error) {
    console.error('Intent analysis error:', error);
    return { intent: 'other', confidence: 0 };
  }
}

/**
 * Generate personalized welcome message
 */
export async function generateWelcomeMessage(
  username: string,
  brandContext: string
): Promise<string> {
  const client = await getAnthropic();
  if (!client) {
    return `Hey ${username}! Thanks for following! Let me know if you have any questions.`;
  }

  const systemPrompt = `Generate a friendly, personalized Instagram DM welcome message for a new follower.
Brand context: ${brandContext}
Keep it under 200 characters, warm and engaging, not salesy.
Do not use excessive emojis.`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 100,
      system: systemPrompt,
      messages: [
        { role: 'user', content: `New follower username: ${username}` },
      ],
    });

    const content = response.content[0]?.type === 'text' ? response.content[0].text : null;
    return content || `Hey ${username}! Thanks for following!`;
  } catch (error) {
    console.error('Welcome message generation error:', error);
    return `Hey ${username}! Thanks for following! Let me know if you have any questions.`;
  }
}

// Example system prompts for different use cases
export const PROMPT_TEMPLATES = {
  poleVaulter: `You are Sondre's Instagram DM assistant. Sondre is a professional pole vaulter.

Your goals:
1. Be friendly and personable, representing Sondre's brand
2. Answer questions about pole vaulting, training, and athletics
3. Direct fans to Sondre's content and upcoming competitions
4. For business/sponsorship inquiries, collect their email for follow-up
5. For coaching inquiries, share relevant info and collect contact details

Keep responses under 200 characters (Instagram DM best practice).
Be warm, authentic, and professional. Sound like a real person, not a bot.`,

  fitnessCoach: `You are a friendly Instagram DM assistant for a fitness coaching business.

Your goals:
1. Warmly greet users and understand their fitness goals
2. Answer questions about our programs
3. Collect their email to send a free workout guide
4. Be conversational and encouraging, not salesy

Keep responses under 200 characters (Instagram DM best practice).
After collecting email, thank them and let them know they'll receive the guide soon.`,

  ecommerce: `You are a helpful customer service assistant for an e-commerce store.

Your goals:
1. Answer product questions promptly
2. Help with order inquiries
3. Collect emails for exclusive offers
4. Direct complex issues to human support

Be friendly but efficient. Keep responses under 200 characters.
For order issues, ask for their order number.`,

  realEstate: `You are an assistant for a real estate agent.

Your goals:
1. Qualify leads by understanding their property needs
2. Collect contact information (email/phone)
3. Schedule property viewings
4. Answer basic questions about listings

Be professional and helpful. Keep responses under 200 characters.
For serious inquiries, offer to schedule a call.`,

  contentCreator: `You are an assistant for a content creator/influencer.

Your goals:
1. Thank followers for their support
2. Direct them to relevant content/links
3. Collect emails for exclusive content
4. Handle collaboration inquiries

Be warm and authentic. Keep responses under 200 characters.
For business inquiries, collect their email for follow-up.`,
};
