import * as admin from 'firebase-admin';

// ============================================
// FLOW EXECUTION STATE
// ============================================

export type FlowExecutionStatus = 'active' | 'waiting' | 'completed' | 'failed' | 'paused';

export interface FlowExecution {
  id: string;
  flowId: string;
  userId: string;        // Owner of the flow
  accountId: string;     // Instagram account
  senderId: string;      // Instagram user going through the flow
  senderUsername?: string;

  // Current position in flow
  currentNodeId: string;
  previousNodeIds: string[]; // History of executed nodes

  // Execution state
  status: FlowExecutionStatus;

  // Context data collected during flow
  context: FlowExecutionContext;

  // Scheduling for delayed nodes
  scheduledAt?: admin.firestore.Timestamp;
  scheduledNodeId?: string;

  // Error tracking
  lastError?: string;
  retryCount?: number;

  // Timestamps
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
  completedAt?: admin.firestore.Timestamp;
}

// ============================================
// EXECUTION CONTEXT
// ============================================

export interface FlowExecutionContext {
  // Collected user data
  email?: string;
  phone?: string;
  name?: string;

  // Tags applied during flow
  tags: string[];

  // Custom fields from conditions/actions
  customFields: Record<string, string | number | boolean>;

  // Last user message (for condition evaluation)
  lastUserMessage?: string;

  // Trigger context
  triggerType: string;
  triggerPostId?: string;
  triggerCommentText?: string;
  triggerStoryId?: string;

  // Quick reply/button selections
  selectedOptions: string[];
}

// ============================================
// SCHEDULED EXECUTION
// ============================================

export interface ScheduledExecution {
  id: string;
  executionId: string;
  flowId: string;
  nodeId: string;
  accountId: string;
  senderId: string;

  // When to execute
  executeAt: admin.firestore.Timestamp;

  // Status
  status: 'pending' | 'processing' | 'completed' | 'failed';

  // Timestamps
  createdAt: admin.firestore.Timestamp;
  processedAt?: admin.firestore.Timestamp;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Create initial execution context
 */
export function createInitialContext(
  triggerType: string,
  options?: {
    postId?: string;
    commentText?: string;
    storyId?: string;
  }
): FlowExecutionContext {
  return {
    tags: [],
    customFields: {},
    selectedOptions: [],
    triggerType,
    triggerPostId: options?.postId,
    triggerCommentText: options?.commentText,
    triggerStoryId: options?.storyId,
  };
}

/**
 * Check if context has email
 */
export function contextHasEmail(context: FlowExecutionContext): boolean {
  return !!context.email && context.email.includes('@');
}

/**
 * Check if context has phone
 */
export function contextHasPhone(context: FlowExecutionContext): boolean {
  return !!context.phone && context.phone.length >= 10;
}

/**
 * Check if context matches a keyword
 */
export function contextMatchesKeyword(
  context: FlowExecutionContext,
  keywords: string[]
): boolean {
  const lastMessage = context.lastUserMessage?.toLowerCase() || '';
  return keywords.some(kw => lastMessage.includes(kw.toLowerCase()));
}

/**
 * Calculate delay in milliseconds
 */
export function calculateDelayMs(
  value: number,
  unit: 'minutes' | 'hours' | 'days'
): number {
  switch (unit) {
    case 'minutes':
      return value * 60 * 1000;
    case 'hours':
      return value * 60 * 60 * 1000;
    case 'days':
      return value * 24 * 60 * 60 * 1000;
    default:
      return value * 60 * 1000; // Default to minutes
  }
}

/**
 * Extract email from text
 */
export function extractEmail(text: string): string | null {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  const match = text.match(emailRegex);
  return match ? match[0].toLowerCase() : null;
}

/**
 * Extract phone from text
 */
export function extractPhone(text: string): string | null {
  // Remove all non-digit characters except + at the start
  const cleaned = text.replace(/[^\d+]/g, '');

  // Check if it looks like a phone number (at least 10 digits)
  const digitsOnly = cleaned.replace(/\D/g, '');
  if (digitsOnly.length >= 10) {
    return cleaned;
  }

  return null;
}
