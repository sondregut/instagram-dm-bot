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
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Conversations</h1>
          <p className="text-gray-500 mt-1">View and manage DM conversations</p>
        </div>
        <div className="rounded-xl bg-white shadow-sm border border-gray-100">
          <NoAccountPrompt onConnectClick={() => window.location.href = '/settings'} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Conversations</h1>
        <p className="text-gray-500 mt-1">View and manage DM conversations</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <span className={styles.spinner} />
        </div>
      ) : conversations.length === 0 ? (
        <div className="rounded-xl bg-white shadow-sm border border-gray-100 p-12 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-accent/10 to-accent-secondary/10 flex items-center justify-center">
            <MessageSquare className="h-8 w-8 text-accent" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-gray-900">
            No conversations yet
          </h3>
          <p className="mt-2 text-gray-500">
            Conversations will appear here when users interact with your automations
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {conversations.map((conversation) => (
            <button
              key={conversation.id}
              onClick={() => setSelectedConversation(conversation)}
              className="w-full rounded-xl bg-white shadow-sm border border-gray-100 p-5 hover:shadow-md hover:border-gray-200 transition-all text-left"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={cn(styles.avatar.base, styles.avatar.sizes.md)}>
                    <User className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900">
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
                    <p className="text-sm text-gray-500 line-clamp-1 mt-1">
                      {conversation.messages.length > 0
                        ? conversation.messages[conversation.messages.length - 1].content
                        : 'No messages'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    {conversation.collectedData.email && (
                      <Mail className="h-4 w-4 text-status-success" />
                    )}
                    {conversation.collectedData.phone && (
                      <Phone className="h-4 w-4 text-status-success" />
                    )}
                  </div>
                  <span className="text-sm text-gray-400">
                    {formatRelativeTime(conversation.lastMessageAt)}
                  </span>
                  <ChevronRight className="h-5 w-5 text-gray-400" />
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
            <div className="mb-6 p-4 bg-gray-50 rounded-xl border border-gray-100">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">State:</span>
                  <span className="ml-2 font-semibold text-gray-900 capitalize">
                    {selectedConversation.conversationState.replace(/_/g, ' ')}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Messages:</span>
                  <span className="ml-2 font-semibold text-gray-900">
                    {selectedConversation.messages.length}
                  </span>
                </div>
                {selectedConversation.collectedData.email && (
                  <div className="col-span-2">
                    <span className="text-gray-500">Email:</span>
                    <span className="ml-2 font-semibold text-gray-900">
                      {selectedConversation.collectedData.email}
                    </span>
                  </div>
                )}
                {selectedConversation.collectedData.phone && (
                  <div className="col-span-2">
                    <span className="text-gray-500">Phone:</span>
                    <span className="ml-2 font-semibold text-gray-900">
                      {selectedConversation.collectedData.phone}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="max-h-96 overflow-y-auto space-y-3">
              {selectedConversation.messages.map((message, index) => (
                <div
                  key={index}
                  className={cn(
                    'max-w-[80%] rounded-2xl p-4',
                    message.role === 'user'
                      ? 'bg-gray-100 text-gray-900'
                      : 'bg-gradient-to-r from-accent to-accent-secondary text-white ml-auto'
                  )}
                >
                  <p className="text-sm">{message.content}</p>
                  <p
                    className={cn(
                      'mt-2 text-xs',
                      message.role === 'user' ? 'text-gray-500' : 'text-white/70'
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
