import * as admin from 'firebase-admin';

// ============================================
// FLOW NODE TYPES
// ============================================

export type FlowNodeType = 'trigger' | 'message' | 'condition' | 'delay' | 'action';

export interface FlowNode {
  id: string;
  type: FlowNodeType;
  data: TriggerData | MessageData | ConditionData | DelayData | ActionData;
  position: { x: number; y: number };
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string; // For condition branches: 'true' | 'false'
}

// ============================================
// NODE DATA TYPES
// ============================================

export type TriggerType =
  | 'comment'
  | 'keyword'
  | 'story_reply'
  | 'story_mention'
  | 'new_follower';

export interface TriggerData {
  triggerType: TriggerType;
  keywords?: string[];
  postIds?: string[];
  // For story triggers
  replyToStory?: boolean; // If true, only triggers when user replies to a story
}

export type MessageType = 'text' | 'quick_replies' | 'buttons' | 'image';

export interface QuickReplyButton {
  label: string;
  payload: string;
}

export interface MessageData {
  messageType: MessageType;
  text?: string;
  quickReplies?: string[];
  buttons?: QuickReplyButton[];
  imageUrl?: string;
  // AI-powered message
  useAI?: boolean;
  aiPrompt?: string;
}

export type ConditionType = 'keyword_match' | 'has_email' | 'has_phone' | 'custom_field' | 'user_replied';

export interface ConditionData {
  conditionType: ConditionType;
  value?: string;
  keywords?: string[];
}

export type DelayUnit = 'minutes' | 'hours' | 'days';

export interface DelayData {
  delayType: DelayUnit;
  value: number;
}

export type ActionType =
  | 'collect_email'
  | 'collect_phone'
  | 'add_tag'
  | 'remove_tag'
  | 'subscribe'
  | 'unsubscribe'
  | 'create_lead'
  | 'notify';

export interface ActionData {
  actionType: ActionType;
  tag?: string;
  customMessage?: string;
  notifyEmail?: string;
}

// ============================================
// FLOW DOCUMENT
// ============================================

export interface Flow {
  id: string;
  userId: string;
  accountId: string;
  name: string;
  description?: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  isActive: boolean;
  // Stats
  triggerCount?: number;
  lastTriggeredAt?: admin.firestore.Timestamp;
  // Timestamps
  createdAt: admin.firestore.Timestamp;
  updatedAt?: admin.firestore.Timestamp;
}

// ============================================
// FLOW INPUT (for creating/updating)
// ============================================

export interface FlowInput {
  id?: string;
  accountId: string;
  name: string;
  description?: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  isActive?: boolean;
}

// ============================================
// HELPER TYPES
// ============================================

export interface FlowValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a flow structure
 */
export function validateFlow(flow: FlowInput): FlowValidationResult {
  const errors: string[] = [];

  // Must have at least one trigger node
  const triggerNodes = flow.nodes.filter(n => n.type === 'trigger');
  if (triggerNodes.length === 0) {
    errors.push('Flow must have at least one trigger node');
  }

  // Must have at least one action or message node
  const actionNodes = flow.nodes.filter(n => n.type === 'message' || n.type === 'action');
  if (actionNodes.length === 0) {
    errors.push('Flow must have at least one message or action node');
  }

  // Validate edges reference existing nodes
  const nodeIds = new Set(flow.nodes.map(n => n.id));
  for (const edge of flow.edges) {
    if (!nodeIds.has(edge.source)) {
      errors.push(`Edge references non-existent source node: ${edge.source}`);
    }
    if (!nodeIds.has(edge.target)) {
      errors.push(`Edge references non-existent target node: ${edge.target}`);
    }
  }

  // Validate trigger nodes have proper data
  for (const node of triggerNodes) {
    const data = node.data as TriggerData;
    if (!data.triggerType) {
      errors.push(`Trigger node ${node.id} missing triggerType`);
    }
    if (['comment', 'keyword'].includes(data.triggerType) && (!data.keywords || data.keywords.length === 0)) {
      errors.push(`Trigger node ${node.id} requires at least one keyword`);
    }
  }

  // Validate message nodes have content
  const messageNodes = flow.nodes.filter(n => n.type === 'message');
  for (const node of messageNodes) {
    const data = node.data as MessageData;
    if (!data.useAI && !data.text) {
      errors.push(`Message node ${node.id} requires text content or AI enabled`);
    }
  }

  // Validate delay nodes have valid duration
  const delayNodes = flow.nodes.filter(n => n.type === 'delay');
  for (const node of delayNodes) {
    const data = node.data as DelayData;
    if (!data.value || data.value <= 0) {
      errors.push(`Delay node ${node.id} requires a positive delay value`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get the next nodes to execute from a given node
 */
export function getNextNodes(
  flow: Flow,
  currentNodeId: string,
  conditionResult?: boolean
): FlowNode[] {
  const edges = flow.edges.filter(e => {
    if (e.source !== currentNodeId) return false;

    // For condition nodes, filter by handle
    if (conditionResult !== undefined && e.sourceHandle) {
      return e.sourceHandle === (conditionResult ? 'true' : 'false');
    }

    return true;
  });

  const nextNodeIds = edges.map(e => e.target);
  return flow.nodes.filter(n => nextNodeIds.includes(n.id));
}

/**
 * Find the trigger node(s) that match an event
 */
export function findMatchingTriggers(
  flow: Flow,
  triggerType: TriggerType,
  keywords?: string[],
  postId?: string
): FlowNode[] {
  return flow.nodes.filter(node => {
    if (node.type !== 'trigger') return false;

    const data = node.data as TriggerData;
    if (data.triggerType !== triggerType) return false;

    // Check post ID for comment triggers
    if (triggerType === 'comment' && data.postIds && data.postIds.length > 0) {
      if (!postId || !data.postIds.includes(postId)) return false;
    }

    // Check keywords for comment/keyword triggers
    if (['comment', 'keyword'].includes(triggerType) && data.keywords && keywords) {
      const hasMatch = keywords.some(kw =>
        data.keywords!.some(trigger =>
          kw.toLowerCase().includes(trigger.toLowerCase())
        )
      );
      if (!hasMatch) return false;
    }

    return true;
  });
}
