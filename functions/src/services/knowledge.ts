import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Anthropic from '@anthropic-ai/sdk';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { db, storage, KnowledgeBase, KnowledgeDocument, KnowledgeFAQ, KnowledgeWebsite } from '../firebase';
import { generateToken } from '../utils/encryption';

// Anthropic client initialization
let anthropic: Anthropic | null = null;
let apiKey: string | null = null;

async function getApiKey(): Promise<string | null> {
  if (apiKey) return apiKey;

  if (process.env.ANTHROPIC_API_KEY) {
    apiKey = process.env.ANTHROPIC_API_KEY;
    return apiKey;
  }

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

/**
 * Create a new knowledge base for an account
 */
export async function createKnowledgeBase(
  userId: string,
  accountId: string,
  name: string,
  description?: string
): Promise<KnowledgeBase> {
  const kbRef = db.collection('knowledge_base').doc();

  const knowledgeBase: KnowledgeBase = {
    id: kbRef.id,
    userId,
    accountId,
    name,
    description,
    documents: [],
    websites: [],
    faqs: [],
    status: 'ready',
    createdAt: admin.firestore.Timestamp.now(),
  };

  await kbRef.set(knowledgeBase);

  // Link knowledge base to account
  await db.collection('accounts').doc(accountId).update({
    knowledgeBaseId: kbRef.id,
  });

  return knowledgeBase;
}

/**
 * Get knowledge base by ID
 */
export async function getKnowledgeBase(kbId: string): Promise<KnowledgeBase | null> {
  const doc = await db.collection('knowledge_base').doc(kbId).get();

  if (!doc.exists) {
    return null;
  }

  return { id: doc.id, ...doc.data() } as KnowledgeBase;
}

/**
 * Get knowledge base for an account
 */
export async function getKnowledgeBaseForAccount(accountId: string): Promise<KnowledgeBase | null> {
  const snapshot = await db.collection('knowledge_base')
    .where('accountId', '==', accountId)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as KnowledgeBase;
}

/**
 * Add a FAQ to the knowledge base
 */
export const addFAQ = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const { knowledgeBaseId, question, answer, keywords } = data;

  if (!knowledgeBaseId || !question || !answer) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  const userId = context.auth.uid;

  // Verify ownership
  const kb = await getKnowledgeBase(knowledgeBaseId);
  if (!kb || kb.userId !== userId) {
    throw new functions.https.HttpsError('permission-denied', 'Not your knowledge base');
  }

  const faq: KnowledgeFAQ = {
    id: generateToken(16),
    question,
    answer,
    keywords: keywords || [],
  };

  await db.collection('knowledge_base').doc(knowledgeBaseId).update({
    faqs: admin.firestore.FieldValue.arrayUnion(faq),
    updatedAt: admin.firestore.Timestamp.now(),
  });

  return { success: true, faq };
});

/**
 * Remove a FAQ from the knowledge base
 */
export const removeFAQ = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const { knowledgeBaseId, faqId } = data;

  if (!knowledgeBaseId || !faqId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  const userId = context.auth.uid;

  // Verify ownership and get current FAQs
  const kb = await getKnowledgeBase(knowledgeBaseId);
  if (!kb || kb.userId !== userId) {
    throw new functions.https.HttpsError('permission-denied', 'Not your knowledge base');
  }

  const updatedFaqs = kb.faqs.filter(faq => faq.id !== faqId);

  await db.collection('knowledge_base').doc(knowledgeBaseId).update({
    faqs: updatedFaqs,
    updatedAt: admin.firestore.Timestamp.now(),
  });

  return { success: true };
});

/**
 * Update FAQs in bulk
 */
export const updateFAQs = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const { knowledgeBaseId, faqs } = data;

  if (!knowledgeBaseId || !faqs) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  const userId = context.auth.uid;

  // Verify ownership
  const kb = await getKnowledgeBase(knowledgeBaseId);
  if (!kb || kb.userId !== userId) {
    throw new functions.https.HttpsError('permission-denied', 'Not your knowledge base');
  }

  // Ensure all FAQs have IDs
  const processedFaqs: KnowledgeFAQ[] = faqs.map((faq: any) => ({
    id: faq.id || generateToken(16),
    question: faq.question,
    answer: faq.answer,
    keywords: faq.keywords || [],
  }));

  await db.collection('knowledge_base').doc(knowledgeBaseId).update({
    faqs: processedFaqs,
    updatedAt: admin.firestore.Timestamp.now(),
  });

  return { success: true, faqs: processedFaqs };
});

/**
 * Add a website URL to scrape for knowledge
 */
export const addWebsite = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const { knowledgeBaseId, url, title } = data;

  if (!knowledgeBaseId || !url) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  const userId = context.auth.uid;

  // Verify ownership
  const kb = await getKnowledgeBase(knowledgeBaseId);
  if (!kb || kb.userId !== userId) {
    throw new functions.https.HttpsError('permission-denied', 'Not your knowledge base');
  }

  // Validate URL
  try {
    new URL(url);
  } catch {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid URL');
  }

  const website: KnowledgeWebsite = {
    id: generateToken(16),
    url,
    title,
  };

  await db.collection('knowledge_base').doc(knowledgeBaseId).update({
    websites: admin.firestore.FieldValue.arrayUnion(website),
    status: 'processing',
    updatedAt: admin.firestore.Timestamp.now(),
  });

  // TODO: Trigger background job to scrape website content
  // For now, we'll just store the URL and title

  return { success: true, website };
});

/**
 * Remove a website from the knowledge base
 */
export const removeWebsite = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const { knowledgeBaseId, websiteId } = data;

  if (!knowledgeBaseId || !websiteId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  const userId = context.auth.uid;

  // Verify ownership
  const kb = await getKnowledgeBase(knowledgeBaseId);
  if (!kb || kb.userId !== userId) {
    throw new functions.https.HttpsError('permission-denied', 'Not your knowledge base');
  }

  const updatedWebsites = kb.websites.filter(w => w.id !== websiteId);

  await db.collection('knowledge_base').doc(knowledgeBaseId).update({
    websites: updatedWebsites,
    updatedAt: admin.firestore.Timestamp.now(),
  });

  return { success: true };
});

/**
 * Get the knowledge base for a user's account
 */
export const getKnowledgeBaseApi = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const { accountId } = data;

  if (!accountId) {
    throw new functions.https.HttpsError('invalid-argument', 'Account ID required');
  }

  const userId = context.auth.uid;

  // Verify account ownership
  const accountDoc = await db.collection('accounts').doc(accountId).get();
  if (!accountDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Account not found');
  }

  const account = accountDoc.data();
  if (account?.userId !== userId) {
    throw new functions.https.HttpsError('permission-denied', 'Not your account');
  }

  // Get or create knowledge base
  let kb = await getKnowledgeBaseForAccount(accountId);

  if (!kb) {
    // Create a new knowledge base
    kb = await createKnowledgeBase(userId, accountId, `${account?.username}'s Knowledge Base`);
  }

  return kb;
});

/**
 * Build context from knowledge base for AI responses
 * This retrieves relevant FAQ entries based on the user's message
 */
export function buildKnowledgeContext(
  kb: KnowledgeBase,
  userMessage: string
): string {
  const context: string[] = [];
  const lowerMessage = userMessage.toLowerCase();

  // Find matching FAQs based on keywords or question similarity
  for (const faq of kb.faqs) {
    // Check keywords
    if (faq.keywords && faq.keywords.some(k => lowerMessage.includes(k.toLowerCase()))) {
      context.push(`Q: ${faq.question}\nA: ${faq.answer}`);
      continue;
    }

    // Simple word matching for question
    const questionWords = faq.question.toLowerCase().split(/\s+/);
    const messageWords = lowerMessage.split(/\s+/);
    const matchingWords = questionWords.filter(w =>
      w.length > 3 && messageWords.some(mw => mw.includes(w) || w.includes(mw))
    );

    if (matchingWords.length >= 2) {
      context.push(`Q: ${faq.question}\nA: ${faq.answer}`);
    }
  }

  // Add website content (if any scraped content exists)
  for (const website of kb.websites) {
    if (website.content) {
      // Only include if relevant - simple keyword check
      const contentWords = website.content.toLowerCase();
      const messageWords = lowerMessage.split(/\s+/);
      const hasRelevantContent = messageWords.some(w => w.length > 4 && contentWords.includes(w));

      if (hasRelevantContent) {
        context.push(`From ${website.title || website.url}:\n${website.content.substring(0, 500)}...`);
      }
    }
  }

  if (context.length === 0) {
    return '';
  }

  return `\n\nRelevant information from knowledge base:\n${context.slice(0, 3).join('\n\n')}`;
}

/**
 * Delete a knowledge base and all its content
 */
export const deleteKnowledgeBase = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const { knowledgeBaseId } = data;

  if (!knowledgeBaseId) {
    throw new functions.https.HttpsError('invalid-argument', 'Knowledge base ID required');
  }

  const userId = context.auth.uid;

  // Verify ownership
  const kb = await getKnowledgeBase(knowledgeBaseId);
  if (!kb || kb.userId !== userId) {
    throw new functions.https.HttpsError('permission-denied', 'Not your knowledge base');
  }

  // Delete any uploaded documents from storage
  for (const doc of kb.documents) {
    try {
      await storage.bucket().file(doc.storagePath).delete();
    } catch (error) {
      console.error(`Error deleting document ${doc.id}:`, error);
    }
  }

  // Remove knowledge base reference from account
  await db.collection('accounts').doc(kb.accountId).update({
    knowledgeBaseId: admin.firestore.FieldValue.delete(),
  });

  // Delete the knowledge base document
  await db.collection('knowledge_base').doc(knowledgeBaseId).delete();

  return { success: true };
});

/**
 * Generate AI personality settings from a website URL
 * Fetches the website content and uses Claude to extract personality details
 */
export const generateAIPersonalityFromWebsite = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const { url } = data;

  if (!url) {
    throw new functions.https.HttpsError('invalid-argument', 'URL is required');
  }

  // Validate URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid URL format');
  }

  // Fetch website content
  let websiteContent: string;
  try {
    const response = await fetch(parsedUrl.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; InstagramDMBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    if (!response.ok) {
      throw new functions.https.HttpsError('failed-precondition', `Failed to fetch website: ${response.status}`);
    }

    const html = await response.text();

    // Simple HTML to text extraction
    websiteContent = html
      // Remove script and style tags with their content
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      // Remove HTML comments
      .replace(/<!--[\s\S]*?-->/g, '')
      // Remove all HTML tags but keep content
      .replace(/<[^>]+>/g, ' ')
      // Decode common HTML entities
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      // Clean up whitespace
      .replace(/\s+/g, ' ')
      .trim()
      // Limit content length for API call
      .substring(0, 15000);
  } catch (error) {
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    console.error('Error fetching website:', error);
    throw new functions.https.HttpsError('failed-precondition', 'Failed to fetch website content');
  }

  if (!websiteContent || websiteContent.length < 50) {
    throw new functions.https.HttpsError('failed-precondition', 'Could not extract enough content from the website');
  }

  // Get Anthropic client
  const client = await getAnthropic();
  if (!client) {
    throw new functions.https.HttpsError('failed-precondition', 'AI service not available');
  }

  // Use Claude to analyze website and generate personality settings
  const extractionPrompt = `You are analyzing a website to create an AI assistant personality for Instagram DM automation.

Based on the website content below, extract and generate the following information. Return ONLY a valid JSON object with these fields:

{
  "name": "A name for the AI assistant (e.g., the brand name + 'Assistant', or a friendly name)",
  "description": "A brief 1-2 sentence description of who/what the assistant represents",
  "systemPrompt": "A detailed system prompt (200-400 words) that instructs the AI how to behave. Include: who they represent, what they should help with, their communication style, and key information about the brand/person. Make it sound natural for Instagram DM conversations.",
  "goals": ["Goal 1", "Goal 2", "Goal 3", "Goal 4"],
  "customInstructions": "Any additional specific instructions based on the website content (50-100 words)",
  "tone": "friendly" | "professional" | "casual" | "enthusiastic"
}

Important guidelines:
- Goals should be specific actions like "Answer questions about products/services", "Collect email addresses for follow-up", "Provide pricing information", "Schedule consultations"
- The system prompt should mention keeping responses under 200 characters (Instagram DM best practice)
- The tone should match the website's overall voice
- Include relevant details from the website like services, products, unique selling points
- Make the assistant sound helpful and human, not robotic

Website content:
${websiteContent}`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [
        { role: 'user', content: extractionPrompt },
      ],
    });

    const content = response.content[0]?.type === 'text' ? response.content[0].text : null;
    if (!content) {
      throw new functions.https.HttpsError('internal', 'Failed to generate personality');
    }

    // Extract JSON from the response (handle potential markdown code blocks)
    let jsonString = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonString = jsonMatch[1].trim();
    }

    // Parse the JSON response
    let personality;
    try {
      personality = JSON.parse(jsonString);
    } catch {
      // Try to find JSON object in the response
      const objectMatch = content.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        personality = JSON.parse(objectMatch[0]);
      } else {
        throw new functions.https.HttpsError('internal', 'Failed to parse AI response');
      }
    }

    // Validate and sanitize the response
    const validTones = ['friendly', 'professional', 'casual', 'enthusiastic'];
    const result = {
      name: String(personality.name || 'AI Assistant').substring(0, 100),
      description: String(personality.description || '').substring(0, 500),
      systemPrompt: String(personality.systemPrompt || '').substring(0, 3000),
      goals: Array.isArray(personality.goals)
        ? personality.goals.slice(0, 6).map((g: any) => String(g).substring(0, 200))
        : [],
      customInstructions: String(personality.customInstructions || '').substring(0, 1000),
      tone: validTones.includes(personality.tone) ? personality.tone : 'friendly',
    };

    return result;
  } catch (error) {
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    console.error('Error generating personality:', error);
    throw new functions.https.HttpsError('internal', 'Failed to generate AI personality');
  }
});
