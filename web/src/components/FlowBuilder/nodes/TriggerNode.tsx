'use client';

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Zap, MessageSquare, Users, Image, AtSign } from 'lucide-react';
import { TriggerData, TriggerType } from '@/lib/flowTypes';
import { cn } from '@/lib/utils';

interface TriggerNodeProps {
  data: {
    label: string;
    triggerData?: TriggerData;
  };
  selected?: boolean;
}

const triggerIcons: Record<TriggerType, typeof Zap> = {
  comment: MessageSquare,
  keyword: MessageSquare,
  story_reply: Image,
  story_mention: AtSign,
  new_follower: Users,
};

const triggerLabels: Record<TriggerType, string> = {
  comment: 'Comment Trigger',
  keyword: 'Keyword DM',
  story_reply: 'Story Reply',
  story_mention: 'Story Mention',
  new_follower: 'New Follower',
};

function TriggerNode({ data, selected }: TriggerNodeProps) {
  const triggerData = data.triggerData;
  const Icon = triggerIcons[triggerData?.triggerType || 'keyword'] || Zap;
  const label = triggerLabels[triggerData?.triggerType || 'keyword'] || 'Trigger';

  return (
    <div
      className={cn(
        'px-4 py-3 rounded-lg shadow-md border-2 bg-white min-w-[180px]',
        selected ? 'border-emerald-500' : 'border-emerald-300'
      )}
    >
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-md bg-emerald-100">
          <Icon className="h-4 w-4 text-emerald-600" />
        </div>
        <div>
          <div className="text-xs font-medium text-emerald-600 uppercase tracking-wide">
            Trigger
          </div>
          <div className="text-sm font-semibold text-gray-900">{label}</div>
        </div>
      </div>

      {triggerData?.keywords && triggerData.keywords.length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-100">
          <div className="text-xs text-gray-500">Keywords:</div>
          <div className="flex flex-wrap gap-1 mt-1">
            {triggerData.keywords.slice(0, 3).map((kw, i) => (
              <span
                key={i}
                className="px-1.5 py-0.5 text-xs bg-emerald-50 text-emerald-700 rounded"
              >
                {kw}
              </span>
            ))}
            {triggerData.keywords.length > 3 && (
              <span className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-500 rounded">
                +{triggerData.keywords.length - 3}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-emerald-500 !border-2 !border-white"
      />
    </div>
  );
}

export default memo(TriggerNode);
