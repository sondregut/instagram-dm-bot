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
  replyToStory?: boolean;
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
  triggerCount?: number;
  lastTriggeredAt?: { _seconds: number };
  createdAt: { _seconds: number };
  updatedAt?: { _seconds: number };
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
// FLOW STATS
// ============================================

export interface FlowStats {
  total: number;
  completed: number;
  active: number;
  failed: number;
  last24Hours: number;
  last7Days: number;
}

// ============================================
// REACT FLOW NODE TYPES (for the visual builder)
// ============================================

export interface ReactFlowNodeData {
  label: string;
  type: FlowNodeType;
  // Type-specific data
  triggerData?: TriggerData;
  messageData?: MessageData;
  conditionData?: ConditionData;
  delayData?: DelayData;
  actionData?: ActionData;
}

// ============================================
// CONSTANTS
// ============================================

export const TRIGGER_TYPES: { value: TriggerType; label: string; description: string }[] = [
  { value: 'comment', label: 'Comment Trigger', description: 'When someone comments on a post with keywords' },
  { value: 'keyword', label: 'Keyword DM', description: 'When someone sends a DM with keywords' },
  { value: 'story_reply', label: 'Story Reply', description: 'When someone replies to your story' },
  { value: 'story_mention', label: 'Story Mention', description: 'When someone mentions you in their story' },
  { value: 'new_follower', label: 'New Follower', description: 'When someone follows your account' },
];

export const MESSAGE_TYPES: { value: MessageType; label: string }[] = [
  { value: 'text', label: 'Text Message' },
  { value: 'quick_replies', label: 'Quick Replies' },
  { value: 'buttons', label: 'Buttons' },
  { value: 'image', label: 'Image' },
];

export const CONDITION_TYPES: { value: ConditionType; label: string }[] = [
  { value: 'keyword_match', label: 'Keyword Match' },
  { value: 'has_email', label: 'Has Email' },
  { value: 'has_phone', label: 'Has Phone' },
  { value: 'user_replied', label: 'User Replied' },
  { value: 'custom_field', label: 'Custom Field' },
];

export const DELAY_UNITS: { value: DelayUnit; label: string }[] = [
  { value: 'minutes', label: 'Minutes' },
  { value: 'hours', label: 'Hours' },
  { value: 'days', label: 'Days' },
];

export const ACTION_TYPES: { value: ActionType; label: string }[] = [
  { value: 'collect_email', label: 'Collect Email' },
  { value: 'collect_phone', label: 'Collect Phone' },
  { value: 'add_tag', label: 'Add Tag' },
  { value: 'remove_tag', label: 'Remove Tag' },
  { value: 'create_lead', label: 'Create Lead' },
  { value: 'notify', label: 'Send Notification' },
];

// ============================================
// HELPER FUNCTIONS
// ============================================

export function createDefaultNode(type: FlowNodeType, position: { x: number; y: number }): FlowNode {
  const id = `${type}_${Date.now()}`;

  switch (type) {
    case 'trigger':
      return {
        id,
        type,
        position,
        data: {
          triggerType: 'keyword',
          keywords: [],
        } as TriggerData,
      };

    case 'message':
      return {
        id,
        type,
        position,
        data: {
          messageType: 'text',
          text: '',
        } as MessageData,
      };

    case 'condition':
      return {
        id,
        type,
        position,
        data: {
          conditionType: 'has_email',
        } as ConditionData,
      };

    case 'delay':
      return {
        id,
        type,
        position,
        data: {
          delayType: 'minutes',
          value: 5,
        } as DelayData,
      };

    case 'action':
      return {
        id,
        type,
        position,
        data: {
          actionType: 'collect_email',
        } as ActionData,
      };

    default:
      throw new Error(`Unknown node type: ${type}`);
  }
}

export function getNodeColor(type: FlowNodeType): string {
  switch (type) {
    case 'trigger':
      return '#10b981'; // emerald
    case 'message':
      return '#3b82f6'; // blue
    case 'condition':
      return '#f59e0b'; // amber
    case 'delay':
      return '#8b5cf6'; // violet
    case 'action':
      return '#ef4444'; // red
    default:
      return '#6b7280'; // gray
  }
}

export function getNodeIcon(type: FlowNodeType): string {
  switch (type) {
    case 'trigger':
      return 'Zap';
    case 'message':
      return 'MessageSquare';
    case 'condition':
      return 'GitBranch';
    case 'delay':
      return 'Clock';
    case 'action':
      return 'Play';
    default:
      return 'Circle';
  }
}
