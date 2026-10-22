import Anthropic from '@anthropic-ai/sdk';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { InstagramAccount, KnowledgeBase } from '../firebase';
import { getKnowledgeBaseForAccount, buildKnowledgeContext } from './knowledge';
import { extractAnthropicText } from './anthropicResponse';

let anthropic: Anthropic | null = null;
let apiKey: string | null = null;

function getAnthropicModel(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-5';
}

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
 * Enhanced to support knowledge base context for RAG
 */
export interface AIResponseResult {
  text: string;
  usedAI: boolean;
  failureReason?: AIUnavailableReason;
}

export type AIUnavailableReason = 'billing' | 'authentication' | 'rate_limit' | 'provider' | 'configuration' | 'empty_response';

/** Classify provider failures without logging request bodies, credentials or user text. */
export function classifyAIProviderFailure(error: unknown): { reason: AIUnavailableReason; httpStatus?: number } {
  const value = error as { status?: unknown; message?: unknown } | null;
  const status = typeof value?.status === 'number' ? value.status : undefined;
  const message = typeof value?.message === 'string' ? value.message : '';
  const reason = (status === 400 || status === 402) && /credit balance is too low|insufficient credits/i.test(message)
    ? 'billing' : status === 401 || status === 403 ? 'authentication'
      : status === 429 ? 'rate_limit' : 'provider';
  return { reason, ...(status === undefined ? {} : { httpStatus: status }) };
}

function reportAIUnavailable(reason: AIUnavailableReason, httpStatus?: number): void {
  console.error(JSON.stringify({ severity: 'ERROR', event: 'dm_ai_unavailable', provider: 'anthropic',
    reason, ...(httpStatus === undefined ? {} : { httpStatus }) }));
}

export function aiFailureHandoffReason(result: AIResponseResult, fallback: string): string {
  return !result.usedAI && result.failureReason ? `ai_${result.failureReason}_unavailable` : fallback;
}

export interface AIResponseOptions {
  maxTokens?: number;
  temperature?: number;
  accountId?: string;
  userMessage?: string;
  fallbackResponse?: string;
  includeAccountKnowledge?: boolean;
}

export async function generateAIResponseWithStatus(
  systemPrompt: string,
  conversationHistory: ChatMessage[],
  options: AIResponseOptions = {}
): Promise<AIResponseResult> {
  const {
    maxTokens = 300,
    temperature = 0.7,
    accountId,
    userMessage,
    fallbackResponse = "Thanks for reaching out. I'll ask Sondre to follow up personally.",
    includeAccountKnowledge = true,
  } = options;
  void temperature;

  // Get Anthropic client
  const client = await getAnthropic();
  if (!client) {
    reportAIUnavailable('configuration');
    return { text: fallbackResponse, usedAI: false, failureReason: 'configuration' };
  }

  // Build enhanced system prompt with knowledge base context
  let enhancedPrompt = systemPrompt;

  if (includeAccountKnowledge && accountId && userMessage) {
    try {
      const kb = await getKnowledgeBaseForAccount(accountId);
      if (kb && kb.status === 'ready') {
        const kbContext = buildKnowledgeContext(kb, userMessage);
        if (kbContext) {
          enhancedPrompt += kbContext;
        }
      }
    } catch (error) {
      console.error('Error fetching knowledge base:', error);
    }
  }

  try {
    const response = await client.messages.create({
      model: getAnthropicModel(),
      max_tokens: maxTokens,
      system: enhancedPrompt,
      messages: conversationHistory.map(m => ({
        role: m.role === 'system' ? 'user' : m.role,
        content: m.content,
      })),
    });

    const aiMessage = extractAnthropicText(response.content);

    if (!aiMessage) {
      reportAIUnavailable('empty_response');
      return { text: fallbackResponse, usedAI: false, failureReason: 'empty_response' };
    }

    console.log('[AI] Claude response generated successfully');
    return { text: aiMessage, usedAI: true };
  } catch (error) {
    const failure = classifyAIProviderFailure(error);
    reportAIUnavailable(failure.reason, failure.httpStatus);
    return { text: fallbackResponse, usedAI: false, failureReason: failure.reason };
  }
}

export async function generateAIResponse(
  systemPrompt: string,
  conversationHistory: ChatMessage[],
  options: AIResponseOptions = {}
): Promise<string> {
  return (await generateAIResponseWithStatus(systemPrompt, conversationHistory, options)).text;
}

export type IsolatedAIResponseOptions = Omit<
  AIResponseOptions,
  'accountId' | 'includeAccountKnowledge'
>;

/**
 * Stateless conversation path for privacy-sensitive automations. It cannot
 * append account-wide knowledge, so callers provide only the sealed history
 * they intend Claude to see.
 */
export async function generateIsolatedAIResponseWithStatus(
  systemPrompt: string,
  conversationHistory: ChatMessage[],
  options: IsolatedAIResponseOptions = {}
): Promise<AIResponseResult> {
  return generateAIResponseWithStatus(systemPrompt, conversationHistory, {
    ...options,
    accountId: undefined,
    includeAccountKnowledge: false,
  });
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
      model: getAnthropicModel(),
      max_tokens: 150,
      system: systemPrompt,
      messages: [
        { role: 'user', content: `Context: ${context || 'general conversation'}\nMessage: ${message}` },
      ],
    });

    const content = extractAnthropicText(response.content) || '{}';
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
      model: getAnthropicModel(),
      max_tokens: 100,
      system: systemPrompt,
      messages: [
        { role: 'user', content: `New follower username: ${username}` },
      ],
    });

    const content = extractAnthropicText(response.content);
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
