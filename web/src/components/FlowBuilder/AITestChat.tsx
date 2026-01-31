'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles, RefreshCw } from 'lucide-react';
import { Button } from '@/components/Button';
import { cn } from '@/lib/utils';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface AITestChatProps {
  goal: string;
  context: string;
  onClose?: () => void;
  className?: string;
}

export function AITestChat({ goal, context, onClose, className }: AITestChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Simulate AI response - in production this would call the actual AI API
  const simulateAIResponse = async (userMessage: string): Promise<string> => {
    // Simple simulation based on context and goal
    await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 700));

    const responses = [
      `Thanks for reaching out! Based on your interest, I'd love to help you find the perfect solution. ${context.split('.')[0]}...`,
      `Great question! Our team specializes in helping customers like you. ${goal.includes('product') ? 'What type of product are you looking for?' : 'How can I assist you today?'}`,
      `I appreciate you sharing that! Let me see how we can help. ${context.length > 0 ? 'We have several options that might work for you.' : 'Could you tell me more about what you need?'}`,
      `That's helpful to know! Based on what you've told me, I'd recommend exploring a few options. Would you like me to share more details?`,
      `Perfect! I understand what you're looking for. Is there anything specific you'd like to know about our offerings?`,
    ];

    // Pick response based on message length for variety
    const index = (userMessage.length + messages.length) % responses.length;
    return responses[index];
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const response = await simulateAIResponse(userMessage);
      setMessages(prev => [...prev, { role: 'assistant', content: response }]);
    } catch (error) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleReset = () => {
    setMessages([]);
    setInput('');
  };

  return (
    <div className={cn('flex flex-col bg-gray-50 rounded-lg border border-gray-200', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white rounded-t-lg">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-purple-100">
            <Sparkles className="h-4 w-4 text-purple-600" />
          </div>
          <span className="font-medium text-gray-900">Test Chat</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleReset}
          className="text-gray-500 hover:text-gray-700"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Goal/Context summary */}
      {(goal || context) && (
        <div className="px-4 py-2 bg-purple-50 border-b border-purple-100 text-xs">
          {goal && (
            <p className="text-purple-700">
              <span className="font-semibold">Goal:</span> {goal.substring(0, 100)}{goal.length > 100 ? '...' : ''}
            </p>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[200px] max-h-[300px]">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <Bot className="h-8 w-8 mb-2" />
            <p className="text-sm text-center">
              Test how your AI will respond.<br />
              Type a message to start.
            </p>
          </div>
        ) : (
          messages.map((message, index) => (
            <div
              key={index}
              className={cn(
                'flex gap-2',
                message.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              {message.role === 'assistant' && (
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center">
                  <Bot className="h-3 w-3 text-purple-600" />
                </div>
              )}
              <div
                className={cn(
                  'max-w-[80%] rounded-lg px-3 py-2 text-sm',
                  message.role === 'user'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white border border-gray-200 text-gray-800'
                )}
              >
                {message.content}
              </div>
              {message.role === 'user' && (
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                  <User className="h-3 w-3 text-blue-600" />
                </div>
              )}
            </div>
          ))
        )}

        {isLoading && (
          <div className="flex gap-2 justify-start">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center">
              <Bot className="h-3 w-3 text-purple-600" />
            </div>
            <div className="bg-white border border-gray-200 rounded-lg px-3 py-2">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-gray-200 bg-white rounded-b-lg">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type a message..."
            disabled={isLoading}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100"
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            size="sm"
            className="bg-purple-600 hover:bg-purple-700"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-gray-400 mt-2 text-center">
          Preview mode - responses are simulated
        </p>
      </div>
    </div>
  );
}
