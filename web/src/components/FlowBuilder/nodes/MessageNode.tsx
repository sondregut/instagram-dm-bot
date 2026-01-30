'use client';

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { MessageSquare, Bot, Image } from 'lucide-react';
import { MessageData } from '@/lib/flowTypes';
import { cn } from '@/lib/utils';

interface MessageNodeProps {
  data: {
    label: string;
    messageData?: MessageData;
  };
  selected?: boolean;
}

function MessageNode({ data, selected }: MessageNodeProps) {
  const messageData = data.messageData;
  const isAI = messageData?.useAI;

  return (
    <div
      className={cn(
        'px-4 py-3 rounded-lg shadow-md border-2 bg-white min-w-[180px] max-w-[250px]',
        selected ? 'border-blue-500' : 'border-blue-300'
      )}
    >
      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white"
      />

      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-md bg-blue-100">
          {isAI ? (
            <Bot className="h-4 w-4 text-blue-600" />
          ) : messageData?.messageType === 'image' ? (
            <Image className="h-4 w-4 text-blue-600" />
          ) : (
            <MessageSquare className="h-4 w-4 text-blue-600" />
          )}
        </div>
        <div>
          <div className="text-xs font-medium text-blue-600 uppercase tracking-wide">
            Message
          </div>
          <div className="text-sm font-semibold text-gray-900">
            {isAI ? 'AI Response' : 'Send Message'}
          </div>
        </div>
      </div>

      {/* Message preview */}
      {messageData?.text && (
        <div className="mt-2 pt-2 border-t border-gray-100">
          <p className="text-xs text-gray-600 line-clamp-2">
            {messageData.text}
          </p>
        </div>
      )}

      {/* Quick replies preview */}
      {messageData?.quickReplies && messageData.quickReplies.length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-100">
          <div className="text-xs text-gray-500 mb-1">Quick Replies:</div>
          <div className="flex flex-wrap gap-1">
            {messageData.quickReplies.slice(0, 2).map((qr, i) => (
              <span
                key={i}
                className="px-1.5 py-0.5 text-xs bg-blue-50 text-blue-700 rounded"
              >
                {qr}
              </span>
            ))}
            {messageData.quickReplies.length > 2 && (
              <span className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-500 rounded">
                +{messageData.quickReplies.length - 2}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white"
      />
    </div>
  );
}

export default memo(MessageNode);
