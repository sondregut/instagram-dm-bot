'use client';

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Bot, Sparkles } from 'lucide-react';
import { AIStepData } from '@/lib/flowTypes';
import { cn } from '@/lib/utils';

interface AIStepNodeProps {
  data: {
    label: string;
    aiStepData?: AIStepData;
  } & Partial<AIStepData>;
  selected?: boolean;
}

function AIStepNode({ data, selected }: AIStepNodeProps) {
  // Support both aiStepData nested structure and flat structure
  const goal = data.aiStepData?.goal || data.goal || '';
  const context = data.aiStepData?.context || data.context || '';

  return (
    <div
      className={cn(
        'px-4 py-3 rounded-lg shadow-md border-2 bg-white min-w-[180px] max-w-[250px]',
        selected ? 'border-purple-500' : 'border-purple-300'
      )}
    >
      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-purple-500 !border-2 !border-white"
      />

      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-md bg-gradient-to-br from-purple-100 to-pink-100">
          <Bot className="h-4 w-4 text-purple-600" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-1">
            <span className="text-xs font-medium text-purple-600 uppercase tracking-wide">
              AI Step
            </span>
            <Sparkles className="w-3 h-3 text-purple-400" />
          </div>
          <div className="text-sm font-semibold text-gray-900">
            AI Conversation
          </div>
        </div>
      </div>

      {/* Goal preview */}
      {goal && (
        <div className="mt-2 pt-2 border-t border-gray-100">
          <div className="text-xs text-gray-500 font-medium mb-0.5">Goal:</div>
          <p className="text-xs text-gray-700 line-clamp-2">
            {goal}
          </p>
        </div>
      )}

      {/* Context preview */}
      {context && (
        <div className="mt-1.5">
          <div className="text-xs text-gray-500 font-medium mb-0.5">Context:</div>
          <p className="text-xs text-gray-600 line-clamp-2">
            {context}
          </p>
        </div>
      )}

      {/* Empty state */}
      {!goal && !context && (
        <div className="mt-2 pt-2 border-t border-gray-100">
          <p className="text-xs text-gray-400 italic">
            Click to configure AI goal and context
          </p>
        </div>
      )}

      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-purple-500 !border-2 !border-white"
      />
    </div>
  );
}

export default memo(AIStepNode);
