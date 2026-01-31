import * as admin from 'firebase-admin';
import { db, InstagramAccount, collections } from '../firebase';
import {
  Flow,
  FlowNode,
  TriggerData,
  MessageData,
  ConditionData,
  DelayData,
  ActionData,
  AIStepData,
  getNextNodes,
  findMatchingTriggers,
  TriggerType,
} from '../models/flow';
import {
  FlowExecution,
  FlowExecutionContext,
  ScheduledExecution,
  createInitialContext,
  contextHasEmail,
  contextHasPhone,
  contextMatchesKeyword,
  calculateDelayMs,
  extractEmail,
  extractPhone,
} from '../models/flowExecution';
import { sendInstagramDM, sendQuickReplyDM } from './instagram';
import { generateAIResponse } from './ai';
import { buildSystemPrompt } from './accounts';

// ============================================
// FLOW EXECUTOR CLASS
// ============================================

export class FlowExecutor {
  private account: InstagramAccount;

  constructor(account: InstagramAccount) {
    this.account = account;
  }

  /**
   * Start a flow execution for a user
   */
  async startFlow(
    flow: Flow,
    senderId: string,
    senderUsername: string,
    triggerType: TriggerType,
    options?: {
      postId?: string;
      commentText?: string;
      storyId?: string;
      keywords?: string[];
    }
  ): Promise<FlowExecution | null> {
    console.log(`[FlowExecutor] Starting flow ${flow.id} for sender ${senderId}`);

    // Find matching trigger nodes
    const triggerNodes = findMatchingTriggers(
      flow,
      triggerType,
      options?.keywords,
      options?.postId
    );

    if (triggerNodes.length === 0) {
      console.log('[FlowExecutor] No matching trigger nodes found');
      return null;
    }

    // Use first matching trigger
    const triggerNode = triggerNodes[0];

    // Create execution context
    const context = createInitialContext(triggerType, {
      postId: options?.postId,
      commentText: options?.commentText,
      storyId: options?.storyId,
    });

    // Create flow execution record
    const executionRef = collections.flowExecutions.doc();
    const execution: FlowExecution = {
      id: executionRef.id,
      flowId: flow.id,
      userId: flow.userId,
      accountId: flow.accountId,
      senderId,
      senderUsername,
      currentNodeId: triggerNode.id,
      previousNodeIds: [],
      status: 'active',
      context,
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
    };

    await executionRef.set(execution);

    // Update flow trigger count
    await collections.flows.doc(flow.id).update({
      triggerCount: admin.firestore.FieldValue.increment(1),
      lastTriggeredAt: admin.firestore.Timestamp.now(),
    });

    // Execute from trigger node
    await this.continueExecution(execution, flow);

    return execution;
  }

  /**
   * Continue executing a flow from current position
   */
  async continueExecution(
    execution: FlowExecution,
    flow?: Flow
  ): Promise<void> {
    // Load flow if not provided
    if (!flow) {
      const flowDoc = await collections.flows.doc(execution.flowId).get();
      if (!flowDoc.exists) {
        console.error(`[FlowExecutor] Flow ${execution.flowId} not found`);
        await this.failExecution(execution, 'Flow not found');
        return;
      }
      flow = { id: flowDoc.id, ...flowDoc.data() } as Flow;
    }

    // Get next nodes from current position
    const nextNodes = getNextNodes(flow, execution.currentNodeId);

    if (nextNodes.length === 0) {
      // No more nodes - complete the execution
      await this.completeExecution(execution);
      return;
    }

    // Execute each next node
    for (const node of nextNodes) {
      const shouldContinue = await this.executeNode(node, execution, flow);

      if (!shouldContinue) {
        // Node requested to pause (e.g., delay node)
        return;
      }

      // Update current node
      execution.previousNodeIds.push(execution.currentNodeId);
      execution.currentNodeId = node.id;
    }

    // Recursively continue execution
    await this.continueExecution(execution, flow);
  }

  /**
   * Execute a single node
   * Returns true to continue, false to pause
   */
  async executeNode(
    node: FlowNode,
    execution: FlowExecution,
    flow: Flow
  ): Promise<boolean> {
    console.log(`[FlowExecutor] Executing node ${node.id} (type: ${node.type})`);

    try {
      switch (node.type) {
        case 'trigger':
          // Triggers are just entry points, continue
          return true;

        case 'message':
          await this.executeMessageNode(node, execution);
          return true;

        case 'condition':
          return await this.executeConditionNode(node, execution, flow);

        case 'delay':
          await this.executeDelayNode(node, execution, flow);
          return false; // Pause execution for delay

        case 'action':
          await this.executeActionNode(node, execution);
          return true;

        case 'ai_step':
          await this.executeAIStepNode(node, execution);
          return false; // Pause execution - AI step handles continuation

        default:
          console.warn(`[FlowExecutor] Unknown node type: ${node.type}`);
          return true;
      }
    } catch (error) {
      console.error(`[FlowExecutor] Error executing node ${node.id}:`, error);
      await this.failExecution(
        execution,
        error instanceof Error ? error.message : 'Unknown error'
      );
      return false;
    }
  }

  /**
   * Execute a message node
   */
  async executeMessageNode(
    node: FlowNode,
    execution: FlowExecution
  ): Promise<void> {
    const data = node.data as MessageData;
    let message: string;

    if (data.useAI && data.aiPrompt) {
      // Generate AI response
      const systemPrompt = data.aiPrompt + '\n\n' + buildSystemPrompt(this.account);

      const contextMessage = execution.context.triggerCommentText
        ? `User @${execution.senderUsername} said: "${execution.context.triggerCommentText}"`
        : `User @${execution.senderUsername} triggered this flow.`;

      message = await generateAIResponse(
        systemPrompt,
        [{ role: 'user', content: contextMessage }],
        { maxTokens: 200 }
      );
    } else {
      // Use static message with variable replacement
      message = this.replaceVariables(data.text || '', execution);
    }

    // Send based on message type
    if (data.messageType === 'quick_replies' && data.quickReplies) {
      const quickReplies = data.quickReplies.map((qr, i) => ({
        title: qr,
        payload: `qr_${node.id}_${i}`,
      }));
      await sendQuickReplyDM(execution.senderId, message, quickReplies, this.account);
    } else {
      await sendInstagramDM(execution.senderId, message, this.account);
    }

    // Update execution
    await collections.flowExecutions.doc(execution.id).update({
      updatedAt: admin.firestore.Timestamp.now(),
    });
  }

  /**
   * Execute a condition node
   * Returns true to continue with 'true' branch, handles branching
   */
  async executeConditionNode(
    node: FlowNode,
    execution: FlowExecution,
    flow: Flow
  ): Promise<boolean> {
    const data = node.data as ConditionData;
    let result = false;

    switch (data.conditionType) {
      case 'has_email':
        result = contextHasEmail(execution.context);
        break;

      case 'has_phone':
        result = contextHasPhone(execution.context);
        break;

      case 'keyword_match':
        result = data.keywords
          ? contextMatchesKeyword(execution.context, data.keywords)
          : false;
        break;

      case 'user_replied':
        result = !!execution.context.lastUserMessage;
        break;

      case 'custom_field':
        result = !!execution.context.customFields[data.value || ''];
        break;
    }

    console.log(`[FlowExecutor] Condition ${data.conditionType} evaluated to: ${result}`);

    // Get the appropriate branch
    const nextNodes = getNextNodes(flow, node.id, result);

    if (nextNodes.length > 0) {
      // Update execution to follow the branch
      execution.previousNodeIds.push(execution.currentNodeId);
      execution.currentNodeId = node.id;

      // Execute the branched path
      for (const nextNode of nextNodes) {
        execution.previousNodeIds.push(execution.currentNodeId);
        execution.currentNodeId = nextNode.id;
        await this.executeNode(nextNode, execution, flow);
      }
    }

    // Don't continue normal flow - we've already branched
    return false;
  }

  /**
   * Execute a delay node - schedule continuation
   */
  async executeDelayNode(
    node: FlowNode,
    execution: FlowExecution,
    flow: Flow
  ): Promise<void> {
    const data = node.data as DelayData;
    const delayMs = calculateDelayMs(data.value, data.delayType);
    const executeAt = new Date(Date.now() + delayMs);

    console.log(`[FlowExecutor] Scheduling delay of ${data.value} ${data.delayType}`);

    // Create scheduled execution
    const scheduledRef = collections.scheduledExecutions.doc();
    const scheduled: ScheduledExecution = {
      id: scheduledRef.id,
      executionId: execution.id,
      flowId: flow.id,
      nodeId: node.id,
      accountId: this.account.id,
      senderId: execution.senderId,
      executeAt: admin.firestore.Timestamp.fromDate(executeAt),
      status: 'pending',
      createdAt: admin.firestore.Timestamp.now(),
    };

    await scheduledRef.set(scheduled);

    // Update execution status
    await collections.flowExecutions.doc(execution.id).update({
      status: 'waiting',
      scheduledAt: admin.firestore.Timestamp.fromDate(executeAt),
      scheduledNodeId: node.id,
      updatedAt: admin.firestore.Timestamp.now(),
    });
  }

  /**
   * Execute an AI Step node - starts conversational AI
   */
  async executeAIStepNode(
    node: FlowNode,
    execution: FlowExecution
  ): Promise<void> {
    const data = node.data as AIStepData;

    console.log(`[FlowExecutor] Starting AI Step with goal: ${data.goal?.substring(0, 50)}...`);

    // Build a system prompt that combines the goal and context
    const systemPrompt = this.buildAIStepPrompt(data);

    // Generate initial AI message based on context
    const initialMessage = await generateAIResponse(
      systemPrompt,
      [{
        role: 'user',
        content: `Start a conversation with the user. Their username is @${execution.senderUsername}. ${
          execution.context.triggerCommentText
            ? `They commented: "${execution.context.triggerCommentText}"`
            : 'They have initiated contact.'
        }`
      }],
      { maxTokens: 300 }
    );

    // Send the AI message
    await sendInstagramDM(execution.senderId, initialMessage, this.account);

    // Update execution context to track AI step state
    execution.context.customFields.aiStepNodeId = node.id;
    execution.context.customFields.aiStepTurns = 1;
    execution.context.customFields.aiStepMaxTurns = data.maxTurns || 10;
    execution.context.customFields.aiStepGoal = data.goal;
    execution.context.customFields.aiStepContext = data.context;
    execution.context.customFields.aiStepMessages = JSON.stringify([
      { role: 'assistant', content: initialMessage }
    ]);

    // Update execution to waiting state for user response
    await collections.flowExecutions.doc(execution.id).update({
      status: 'waiting',
      currentNodeId: node.id,
      context: execution.context,
      updatedAt: admin.firestore.Timestamp.now(),
    });

    console.log(`[FlowExecutor] AI Step initiated, waiting for user response`);
  }

  /**
   * Build system prompt for AI Step
   */
  private buildAIStepPrompt(data: AIStepData): string {
    let prompt = `You are a helpful AI assistant for Instagram DM conversations.

GOAL: ${data.goal || 'Help the user with their inquiry'}

CONTEXT/KNOWLEDGE:
${data.context || 'Be helpful and friendly.'}

INSTRUCTIONS:
- Be conversational and friendly
- Keep responses concise (under 200 characters when possible)
- Stay focused on achieving the goal
- If the user seems ready or you've accomplished the goal, politely wrap up
- Don't use emojis excessively
- Respond in the same language as the user`;

    // Add account's AI personality if available
    const accountPrompt = buildSystemPrompt(this.account);
    if (accountPrompt) {
      prompt += `\n\nADDITIONAL BUSINESS CONTEXT:\n${accountPrompt}`;
    }

    return prompt;
  }

  /**
   * Handle user message during AI Step
   * Returns true if AI step is complete and should continue to next node
   */
  async handleAIStepMessage(
    execution: FlowExecution,
    message: string,
    flow: Flow
  ): Promise<boolean> {
    const aiStepNodeId = execution.context.customFields.aiStepNodeId as string;
    const currentTurns = (execution.context.customFields.aiStepTurns as number) || 0;
    const maxTurns = (execution.context.customFields.aiStepMaxTurns as number) || 10;
    const goal = (execution.context.customFields.aiStepGoal as string) || '';
    const context = (execution.context.customFields.aiStepContext as string) || '';

    // Parse existing messages
    let messages: { role: 'user' | 'assistant'; content: string }[] = [];
    try {
      const storedMessages = execution.context.customFields.aiStepMessages as string;
      if (storedMessages) {
        messages = JSON.parse(storedMessages);
      }
    } catch {
      messages = [];
    }

    // Add user message
    messages.push({ role: 'user', content: message });

    // Check if max turns reached
    const newTurnCount = currentTurns + 1;
    if (newTurnCount >= maxTurns) {
      console.log(`[FlowExecutor] AI Step reached max turns (${maxTurns}), completing`);

      // Send a wrap-up message
      const wrapUpMessage = await generateAIResponse(
        this.buildAIStepPrompt({ goal, context, maxTurns }),
        [...messages, {
          role: 'user',
          content: 'SYSTEM: This is the last message in this conversation flow. Please wrap up politely.'
        }],
        { maxTokens: 200 }
      );

      await sendInstagramDM(execution.senderId, wrapUpMessage, this.account);

      // Clear AI step context
      this.clearAIStepContext(execution);

      return true; // Continue to next node
    }

    // Generate AI response
    const systemPrompt = this.buildAIStepPrompt({ goal, context, maxTurns });
    const aiResponse = await generateAIResponse(
      systemPrompt,
      messages,
      { maxTokens: 300 }
    );

    // Send response
    await sendInstagramDM(execution.senderId, aiResponse, this.account);

    // Add AI response to messages
    messages.push({ role: 'assistant', content: aiResponse });

    // Update execution context
    execution.context.customFields.aiStepTurns = newTurnCount;
    execution.context.customFields.aiStepMessages = JSON.stringify(messages);

    await collections.flowExecutions.doc(execution.id).update({
      context: execution.context,
      updatedAt: admin.firestore.Timestamp.now(),
    });

    console.log(`[FlowExecutor] AI Step turn ${newTurnCount}/${maxTurns} completed`);

    return false; // Stay in AI step
  }

  /**
   * Clear AI Step context after completion
   */
  private clearAIStepContext(execution: FlowExecution): void {
    delete execution.context.customFields.aiStepNodeId;
    delete execution.context.customFields.aiStepTurns;
    delete execution.context.customFields.aiStepMaxTurns;
    delete execution.context.customFields.aiStepGoal;
    delete execution.context.customFields.aiStepContext;
    delete execution.context.customFields.aiStepMessages;
  }

  /**
   * Execute an action node
   */
  async executeActionNode(
    node: FlowNode,
    execution: FlowExecution
  ): Promise<void> {
    const data = node.data as ActionData;

    switch (data.actionType) {
      case 'collect_email':
        // Send email collection message
        const emailMessage = data.customMessage ||
          "I'd love to send you more info! What's your email address?";
        await sendInstagramDM(execution.senderId, emailMessage, this.account);

        // Update context to expect email
        execution.context.customFields.awaitingEmail = true;
        break;

      case 'collect_phone':
        // Send phone collection message
        const phoneMessage = data.customMessage ||
          "What's the best number to reach you at?";
        await sendInstagramDM(execution.senderId, phoneMessage, this.account);

        // Update context to expect phone
        execution.context.customFields.awaitingPhone = true;
        break;

      case 'add_tag':
        if (data.tag && !execution.context.tags.includes(data.tag)) {
          execution.context.tags.push(data.tag);
        }
        break;

      case 'remove_tag':
        if (data.tag) {
          execution.context.tags = execution.context.tags.filter(t => t !== data.tag);
        }
        break;

      case 'create_lead':
        await this.createLead(execution);
        break;

      case 'notify':
        await this.sendNotification(execution, data.notifyEmail);
        break;
    }

    // Update execution context
    await collections.flowExecutions.doc(execution.id).update({
      context: execution.context,
      updatedAt: admin.firestore.Timestamp.now(),
    });
  }

  /**
   * Handle incoming user message during flow
   */
  async handleUserMessage(
    execution: FlowExecution,
    message: string
  ): Promise<void> {
    console.log(`[FlowExecutor] User message during flow: ${message.substring(0, 50)}...`);

    // Update context with last message
    execution.context.lastUserMessage = message;

    // Check if we're in an AI Step
    if (execution.context.customFields.aiStepNodeId) {
      const flow = await this.getFlow(execution.flowId);
      if (flow) {
        const shouldContinue = await this.handleAIStepMessage(execution, message, flow);

        if (shouldContinue) {
          // AI Step complete, clear context and continue to next node
          const currentNodeId = execution.context.customFields.aiStepNodeId as string;
          this.clearAIStepContext(execution);

          execution.previousNodeIds.push(execution.currentNodeId);
          execution.currentNodeId = currentNodeId;

          // Update execution and continue
          await collections.flowExecutions.doc(execution.id).update({
            status: 'active',
            context: execution.context,
            updatedAt: admin.firestore.Timestamp.now(),
          });

          await this.continueExecution(execution, flow);
        }
        return;
      }
    }

    // Check if we're collecting email
    if (execution.context.customFields.awaitingEmail) {
      const email = extractEmail(message);
      if (email) {
        execution.context.email = email;
        execution.context.customFields.awaitingEmail = false;
        console.log(`[FlowExecutor] Collected email: ${email}`);
      }
    }

    // Check if we're collecting phone
    if (execution.context.customFields.awaitingPhone) {
      const phone = extractPhone(message);
      if (phone) {
        execution.context.phone = phone;
        execution.context.customFields.awaitingPhone = false;
        console.log(`[FlowExecutor] Collected phone: ${phone}`);
      }
    }

    // Update execution
    await collections.flowExecutions.doc(execution.id).update({
      context: execution.context,
      updatedAt: admin.firestore.Timestamp.now(),
    });

    // Continue execution if waiting
    if (execution.status === 'waiting') {
      const flow = await this.getFlow(execution.flowId);
      if (flow) {
        await this.continueExecution(execution, flow);
      }
    }
  }

  /**
   * Replace variables in message text
   */
  private replaceVariables(text: string, execution: FlowExecution): string {
    return text
      .replace(/{username}/g, execution.senderUsername || 'there')
      .replace(/{name}/g, execution.context.name || execution.senderUsername || 'there')
      .replace(/{email}/g, execution.context.email || '')
      .replace(/{phone}/g, execution.context.phone || '');
  }

  /**
   * Create a lead from execution context
   */
  private async createLead(execution: FlowExecution): Promise<void> {
    const leadRef = db.collection('leads').doc();

    await leadRef.set({
      id: leadRef.id,
      userId: execution.userId,
      accountId: execution.accountId,
      instagramUserId: execution.senderId,
      username: execution.senderUsername,
      email: execution.context.email || null,
      phone: execution.context.phone || null,
      name: execution.context.name || null,
      source: 'flow',
      flowId: execution.flowId,
      tags: execution.context.tags,
      createdAt: admin.firestore.Timestamp.now(),
    });

    console.log(`[FlowExecutor] Created lead ${leadRef.id}`);
  }

  /**
   * Send notification email
   */
  private async sendNotification(
    execution: FlowExecution,
    email?: string
  ): Promise<void> {
    // For now, just log. In production, integrate with email service
    console.log(`[FlowExecutor] Would notify ${email || 'account owner'} about flow completion`);
    console.log(`[FlowExecutor] User: @${execution.senderUsername}`);
    console.log(`[FlowExecutor] Context:`, JSON.stringify(execution.context));
  }

  /**
   * Complete a flow execution
   */
  private async completeExecution(execution: FlowExecution): Promise<void> {
    await collections.flowExecutions.doc(execution.id).update({
      status: 'completed',
      completedAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
    });

    console.log(`[FlowExecutor] Flow execution ${execution.id} completed`);
  }

  /**
   * Fail a flow execution
   */
  private async failExecution(execution: FlowExecution, error: string): Promise<void> {
    await collections.flowExecutions.doc(execution.id).update({
      status: 'failed',
      lastError: error,
      updatedAt: admin.firestore.Timestamp.now(),
    });

    console.error(`[FlowExecutor] Flow execution ${execution.id} failed: ${error}`);
  }

  /**
   * Get a flow by ID
   */
  private async getFlow(flowId: string): Promise<Flow | null> {
    const doc = await collections.flows.doc(flowId).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() } as Flow;
  }
}

// ============================================
// SCHEDULED EXECUTION PROCESSOR
// ============================================

/**
 * Process pending scheduled executions
 * Called by a scheduled Cloud Function
 */
export async function processScheduledExecutions(): Promise<number> {
  const now = admin.firestore.Timestamp.now();

  // Get pending scheduled executions that are due
  const pendingDocs = await collections.scheduledExecutions
    .where('status', '==', 'pending')
    .where('executeAt', '<=', now)
    .limit(50)
    .get();

  console.log(`[FlowExecutor] Processing ${pendingDocs.size} scheduled executions`);

  let processed = 0;

  for (const doc of pendingDocs.docs) {
    const scheduled = { id: doc.id, ...doc.data() } as ScheduledExecution;

    try {
      // Mark as processing
      await doc.ref.update({ status: 'processing' });

      // Get execution
      const executionDoc = await collections.flowExecutions.doc(scheduled.executionId).get();
      if (!executionDoc.exists) {
        console.warn(`[FlowExecutor] Execution ${scheduled.executionId} not found`);
        await doc.ref.update({ status: 'failed' });
        continue;
      }

      const execution = { id: executionDoc.id, ...executionDoc.data() } as FlowExecution;

      // Get account
      const accountDoc = await db.collection('accounts').doc(scheduled.accountId).get();
      if (!accountDoc.exists) {
        console.warn(`[FlowExecutor] Account ${scheduled.accountId} not found`);
        await doc.ref.update({ status: 'failed' });
        continue;
      }

      const account = { id: accountDoc.id, ...accountDoc.data() } as InstagramAccount;

      // Create executor and continue
      const executor = new FlowExecutor(account);

      // Update execution to active and continue
      await collections.flowExecutions.doc(execution.id).update({
        status: 'active',
        scheduledAt: null,
        scheduledNodeId: null,
      });

      // Get the next nodes after the delay node
      const flow = await executor['getFlow'](execution.flowId);
      if (flow) {
        await executor.continueExecution(execution, flow);
      }

      // Mark scheduled as completed
      await doc.ref.update({
        status: 'completed',
        processedAt: admin.firestore.Timestamp.now(),
      });

      processed++;
    } catch (error) {
      console.error(`[FlowExecutor] Error processing scheduled ${scheduled.id}:`, error);
      await doc.ref.update({
        status: 'failed',
        processedAt: admin.firestore.Timestamp.now(),
      });
    }
  }

  return processed;
}

// ============================================
// FLOW TRIGGER HELPERS
// ============================================

/**
 * Find and start flows that match a trigger event
 */
export async function triggerFlows(
  account: InstagramAccount,
  triggerType: TriggerType,
  senderId: string,
  senderUsername: string,
  options?: {
    postId?: string;
    commentText?: string;
    storyId?: string;
    messageText?: string;
  }
): Promise<FlowExecution[]> {
  // Get active flows for this account
  const flowDocs = await collections.flows
    .where('accountId', '==', account.id)
    .where('isActive', '==', true)
    .get();

  const executions: FlowExecution[] = [];
  const executor = new FlowExecutor(account);

  // Extract keywords from message/comment
  const keywords = options?.commentText?.split(/\s+/) || options?.messageText?.split(/\s+/) || [];

  for (const doc of flowDocs.docs) {
    const flow = { id: doc.id, ...doc.data() } as Flow;

    // Check if flow has matching triggers
    const matchingTriggers = findMatchingTriggers(
      flow,
      triggerType,
      keywords,
      options?.postId
    );

    if (matchingTriggers.length > 0) {
      const execution = await executor.startFlow(
        flow,
        senderId,
        senderUsername,
        triggerType,
        { ...options, keywords }
      );

      if (execution) {
        executions.push(execution);
      }
    }
  }

  return executions;
}

/**
 * Get active execution for a user in a specific flow
 */
export async function getActiveExecution(
  flowId: string,
  senderId: string
): Promise<FlowExecution | null> {
  const docs = await collections.flowExecutions
    .where('flowId', '==', flowId)
    .where('senderId', '==', senderId)
    .where('status', 'in', ['active', 'waiting'])
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();

  if (docs.empty) return null;

  return { id: docs.docs[0].id, ...docs.docs[0].data() } as FlowExecution;
}

/**
 * Get all active executions for a user across all flows
 */
export async function getActiveExecutionsForUser(
  accountId: string,
  senderId: string
): Promise<FlowExecution[]> {
  const docs = await collections.flowExecutions
    .where('accountId', '==', accountId)
    .where('senderId', '==', senderId)
    .where('status', 'in', ['active', 'waiting'])
    .get();

  return docs.docs.map(doc => ({ id: doc.id, ...doc.data() } as FlowExecution));
}
