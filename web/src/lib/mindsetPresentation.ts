import { MindsetConversation, MindsetConversationStage } from './firebase';

const stageLabels: Record<MindsetConversationStage, string> = {
  awaiting_link_request: 'Waiting for link tap',
  link_sent: 'Link sent',
  link_clicked: 'Link clicked',
  awaiting_download_status: 'Checking download',
  awaiting_activation: 'Waiting for app open',
  awaiting_use_status: 'Waiting for first rep',
  awaiting_feedback: 'Collecting feedback',
  awaiting_offer_status: 'Discussing offer',
  awaiting_subscription_status: 'Deciding on offer',
  trial_claimed: 'Trial reported',
  subscription_claimed: 'Payment reported',
  trial_started: 'Trial verified',
  subscribed: 'Payment verified',
  ai_follow_up: 'Open conversation',
  human_handoff: 'Needs Sondre',
  completed: 'Complete',
};

export function mindsetStageLabel(stage: MindsetConversationStage): string {
  return stageLabels[stage];
}

export function mindsetStageTone(stage: MindsetConversationStage): 'active' | 'attention' | 'converted' | 'complete' {
  if (stage === 'human_handoff') return 'attention';
  if (stage === 'trial_claimed' || stage === 'subscription_claimed') return 'attention';
  if (stage === 'trial_started' || stage === 'subscribed') return 'converted';
  if (stage === 'completed') return 'complete';
  return 'active';
}

export function formatRelativeTimestamp(value: string | null): string {
  if (!value) return 'No timestamp';
  const deltaMs = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(deltaMs)) return 'Unknown time';
  if (deltaMs < 0) {
    const futureMinutes = Math.max(1, Math.ceil(Math.abs(deltaMs) / 60000));
    if (futureMinutes < 60) return `in ${futureMinutes}m`;
    const futureHours = Math.ceil(futureMinutes / 60);
    if (futureHours < 24) return `in ${futureHours}h`;
    return `in ${Math.ceil(futureHours / 24)}d`;
  }
  const minutes = Math.max(0, Math.floor(deltaMs / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(value));
}

export function formatTimestamp(value: string | null): string {
  if (!value) return 'Not recorded';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function latestConversationMessage(conversation: MindsetConversation): string {
  return conversation.history.at(-1)?.content || 'No messages yet';
}

export function percentage(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}
