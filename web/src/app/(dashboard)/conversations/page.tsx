'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MessageSquare, User, Mail, Phone, ChevronRight } from 'lucide-react';
import { cloudFunctions, Conversation } from '@/lib/firebase';
import { Button } from '@/components/Button';
import { Modal } from '@/components/Modal';
import { formatRelativeTime, cn } from '@/lib/utils';

const stateColors: Record<string, string> = {
  greeting: 'bg-blue-100 text-blue-700',
  collecting_email: 'bg-yellow-100 text-yellow-700',
  collecting_phone: 'bg-yellow-100 text-yellow-700',
  ai_chat: 'bg-purple-100 text-purple-700',
  completed: 'bg-green-100 text-green-700',
};

export default function ConversationsPage() {
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);

  const { data, isLoading, fetchNextPage, hasNextPage } = useQuery({
    queryKey: ['conversations'],
    queryFn: async () => {
      const result = await cloudFunctions.getConversations({ limit: 50 });
      return result.data;
    },
  });

  const conversations = data?.conversations || [];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Conversations</h1>
        <p className="text-gray-500">View and manage DM conversations</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-instagram-pink border-t-transparent" />
        </div>
      ) : conversations.length === 0 ? (
        <div className="rounded-xl bg-white p-12 text-center shadow-sm border border-gray-100">
          <MessageSquare className="mx-auto h-12 w-12 text-gray-300" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">
            No conversations yet
          </h3>
          <p className="mt-2 text-gray-500">
            Conversations will appear here when users interact with your automations
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {conversations.map((conversation) => (
            <button
              key={conversation.id}
              onClick={() => setSelectedConversation(conversation)}
              className="w-full rounded-xl bg-white p-4 shadow-sm border border-gray-100 hover:border-instagram-pink transition-colors text-left"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-instagram-pink to-instagram-purple flex items-center justify-center">
                    <User className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900">
                        @{conversation.username}
                      </span>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-xs font-medium',
                          stateColors[conversation.conversationState] || 'bg-gray-100 text-gray-600'
                        )}
                      >
                        {conversation.conversationState.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 line-clamp-1">
                      {conversation.messages.length > 0
                        ? conversation.messages[conversation.messages.length - 1].content
                        : 'No messages'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 text-gray-400">
                    {conversation.collectedData.email && (
                      <Mail className="h-4 w-4 text-green-500" />
                    )}
                    {conversation.collectedData.phone && (
                      <Phone className="h-4 w-4 text-green-500" />
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
            <div className="mb-4 p-4 bg-gray-50 rounded-lg">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">State:</span>
                  <span className="ml-2 font-medium capitalize">
                    {selectedConversation.conversationState.replace(/_/g, ' ')}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Messages:</span>
                  <span className="ml-2 font-medium">
                    {selectedConversation.messages.length}
                  </span>
                </div>
                {selectedConversation.collectedData.email && (
                  <div className="col-span-2">
                    <span className="text-gray-500">Email:</span>
                    <span className="ml-2 font-medium">
                      {selectedConversation.collectedData.email}
                    </span>
                  </div>
                )}
                {selectedConversation.collectedData.phone && (
                  <div className="col-span-2">
                    <span className="text-gray-500">Phone:</span>
                    <span className="ml-2 font-medium">
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
                    'max-w-[80%] rounded-lg p-3',
                    message.role === 'user'
                      ? 'bg-gray-100 text-gray-900'
                      : 'bg-instagram-pink text-white ml-auto'
                  )}
                >
                  <p className="text-sm">{message.content}</p>
                  <p
                    className={cn(
                      'mt-1 text-xs',
                      message.role === 'user' ? 'text-gray-400' : 'text-white/70'
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
