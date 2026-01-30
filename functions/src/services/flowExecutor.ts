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
