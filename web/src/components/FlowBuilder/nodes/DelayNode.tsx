'use client';

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Clock } from 'lucide-react';
import { DelayData, DelayUnit } from '@/lib/flowTypes';
import { cn } from '@/lib/utils';

interface DelayNodeProps {
  data: {
    label: string;
    delayData?: DelayData;
  };
  selected?: boolean;
}

const unitLabels: Record<DelayUnit, string> = {
  minutes: 'min',
  hours: 'hr',
  days: 'day',
};

function DelayNode({ data, selected }: DelayNodeProps) {
  const delayData = data.delayData;
  const value = delayData?.value || 0;
  const unit = delayData?.delayType || 'minutes';
  const unitLabel = unitLabels[unit] + (value !== 1 ? 's' : '');

  return (
    <div
      className={cn(
        'px-4 py-3 rounded-lg shadow-md border-2 bg-white min-w-[150px]',
        selected ? 'border-violet-500' : 'border-violet-300'
      )}
    >
      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-violet-500 !border-2 !border-white"
      />

      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-md bg-violet-100">
          <Clock className="h-4 w-4 text-violet-600" />
        </div>
        <div>
          <div className="text-xs font-medium text-violet-600 uppercase tracking-wide">
            Delay
          </div>
          <div className="text-sm font-semibold text-gray-900">
            Wait {value} {unitLabel}
          </div>
        </div>
      </div>

      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-violet-500 !border-2 !border-white"
      />
    </div>
  );
}

export default memo(DelayNode);
