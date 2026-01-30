'use client';

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { GitBranch } from 'lucide-react';
import { ConditionData, ConditionType } from '@/lib/flowTypes';
import { cn } from '@/lib/utils';

interface ConditionNodeProps {
  data: {
    label: string;
    conditionData?: ConditionData;
  };
  selected?: boolean;
}

const conditionLabels: Record<ConditionType, string> = {
  keyword_match: 'Keyword Match',
  has_email: 'Has Email?',
  has_phone: 'Has Phone?',
  user_replied: 'User Replied?',
  custom_field: 'Custom Field',
};

function ConditionNode({ data, selected }: ConditionNodeProps) {
  const conditionData = data.conditionData;
  const label = conditionLabels[conditionData?.conditionType || 'has_email'] || 'Condition';

  return (
    <div
      className={cn(
        'px-4 py-3 rounded-lg shadow-md border-2 bg-white min-w-[180px]',
        selected ? 'border-amber-500' : 'border-amber-300'
      )}
    >
      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-amber-500 !border-2 !border-white"
      />

      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-md bg-amber-100">
          <GitBranch className="h-4 w-4 text-amber-600" />
        </div>
        <div>
          <div className="text-xs font-medium text-amber-600 uppercase tracking-wide">
            Condition
          </div>
          <div className="text-sm font-semibold text-gray-900">{label}</div>
        </div>
      </div>

      {/* Keywords for keyword_match */}
      {conditionData?.conditionType === 'keyword_match' &&
        conditionData.keywords &&
        conditionData.keywords.length > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-100">
            <div className="flex flex-wrap gap-1">
              {conditionData.keywords.slice(0, 3).map((kw, i) => (
                <span
                  key={i}
                  className="px-1.5 py-0.5 text-xs bg-amber-50 text-amber-700 rounded"
                >
                  {kw}
                </span>
              ))}
            </div>
          </div>
        )}

      {/* Output handles - True and False branches */}
      <div className="flex justify-between mt-3 pt-2 border-t border-gray-100">
        <div className="relative">
          <span className="text-xs text-green-600 font-medium">Yes</span>
          <Handle
            type="source"
            position={Position.Bottom}
            id="true"
            className="!w-3 !h-3 !bg-green-500 !border-2 !border-white !left-1/2 !-translate-x-1/2"
            style={{ bottom: -8, left: '50%' }}
          />
        </div>
        <div className="relative">
          <span className="text-xs text-red-600 font-medium">No</span>
          <Handle
            type="source"
            position={Position.Bottom}
            id="false"
            className="!w-3 !h-3 !bg-red-500 !border-2 !border-white !left-1/2 !-translate-x-1/2"
            style={{ bottom: -8, left: '50%' }}
          />
        </div>
      </div>
    </div>
  );
}

export default memo(ConditionNode);
