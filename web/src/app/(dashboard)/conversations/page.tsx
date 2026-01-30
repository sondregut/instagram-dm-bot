'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MessageSquare, User, Mail, Phone, ChevronRight } from 'lucide-react';
import { cloudFunctions, Conversation } from '@/lib/firebase';
import { Button } from '@/components/Button';
import { Modal } from '@/components/Modal';
import { formatRelativeTime, cn } from '@/lib/utils';
import { useAccount, NoAccountPrompt } from '@/components/AccountSelector';
import { styles } from '@/lib/styles';

const stateColors: Record<string, string> = {
  greeting: 'bg-status-info/10 text-status-info',
  collecting_email: 'bg-status-warning/10 text-status-warning',
  collecting_phone: 'bg-status-warning/10 text-status-warning',
  ai_chat: 'bg-accent/10 text-accent',
  completed: 'bg-status-success/10 text-status-success',
};

export default function ConversationsPage() {
  const { selectedAccount, accounts, isLoading: accountsLoading } = useAccount();
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['conversations', selectedAccount?.id],
    queryFn: async () => {
      const result = await cloudFunctions.getConversations({
        accountId: selectedAccount?.id,
        limit: 50,
      });
      return result.data;
    },
    enabled: !!selectedAccount,
  });

  const conversations = data?.conversations || [];

  if (accountsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className={styles.spinner} />
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div>
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-ink">Conversations</h1>
          <p className="text-ink-muted text-sm">View and manage DM conversations</p>
        </div>
        <div className="rounded-md border border-surface-border bg-surface">
          <NoAccountPrompt onConnectClick={() => window.location.href = '/settings'} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink">Conversations</h1>
        <p className="text-ink-muted text-sm">View and manage DM conversations</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <span className={styles.spinner} />
        </div>
      ) : conversations.length === 0 ? (
        <div className="rounded-md border border-surface-border bg-surface p-12 text-center">
          <MessageSquare className="mx-auto h-10 w-10 text-ink-subtle" />
          <h3 className="mt-4 text-base font-medium text-ink">
            No conversations yet
          </h3>
          <p className="mt-1 text-ink-muted text-sm">
            Conversations will appear here when users interact with your automations
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {conversations.map((conversation) => (
            <button
              key={conversation.id}
              onClick={() => setSelectedConversation(conversation)}
              className="w-full rounded-md border border-surface-border bg-surface p-4 hover:border-ink-subtle transition-colors text-left"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={cn(styles.avatar.base, styles.avatar.sizes.md)}>
                    <User className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-ink">
                        @{conversation.username}
                      </span>
                      <span
                        className={cn(
                          styles.badge.base,
                          stateColors[conversation.conversationState] || styles.badge.neutral
                        )}
                      >
                        {conversation.conversationState.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className="text-sm text-ink-muted line-clamp-1 mt-0.5">
                      {conversation.messages.length > 0
                        ? conversation.messages[conversation.messages.length - 1].content
                        : 'No messages'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 text-ink-subtle">
                    {conversation.collectedData.email && (
                      <Mail className="h-3.5 w-3.5 text-status-success" />
                    )}
                    {conversation.collectedData.phone && (
                      <Phone className="h-3.5 w-3.5 text-status-success" />
                    )}
                  </div>
                  <span className="text-sm text-ink-subtle">
                    {formatRelativeTime(conversation.lastMessageAt)}
                  </span>
                  <ChevronRight className="h-4 w-4 text-ink-subtle" />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Conversation Detail Modal */}
      <Modal
        isOpen={!!selectedConversation}
        onClose={() => setSelectedConversation(null)}
        title={`@${selectedConversation?.username || ''}`}
        size="lg"
      >
        {selectedConversation && (
          <div>
            {/* User Info */}
            <div className="mb-4 p-3 bg-surface-sunken rounded-md">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-ink-muted">State:</span>
                  <span className="ml-2 font-medium text-ink capitalize">
                    {selectedConversation.conversationState.replace(/_/g, ' ')}
                  </span>
                </div>
                <div>
                  <span className="text-ink-muted">Messages:</span>
                  <span className="ml-2 font-medium text-ink">
                    {selectedConversation.messages.length}
                  </span>
                </div>
                {selectedConversation.collectedData.email && (
                  <div className="col-span-2">
                    <span className="text-ink-muted">Email:</span>
                    <span className="ml-2 font-medium text-ink">
                      {selectedConversation.collectedData.email}
                    </span>
                  </div>
                )}
                {selectedConversation.collectedData.phone && (
                  <div className="col-span-2">
                    <span className="text-ink-muted">Phone:</span>
                    <span className="ml-2 font-medium text-ink">
                      {selectedConversation.collectedData.phone}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="max-h-96 overflow-y-auto space-y-2">
              {selectedConversation.messages.map((message, index) => (
                <div
                  key={index}
                  className={cn(
                    'max-w-[80%] rounded-md p-3',
                    message.role === 'user'
                      ? 'bg-surface-sunken text-ink'
                      : 'bg-ink text-white ml-auto'
                  )}
                >
                  <p className="text-sm">{message.content}</p>
                  <p
                    className={cn(
                      'mt-1 text-xs',
                      message.role === 'user' ? 'text-ink-subtle' : 'text-white/70'
                    )}
                  >
                    {formatRelativeTime(message.timestamp)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
