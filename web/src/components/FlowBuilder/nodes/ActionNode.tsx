'use client';

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Play, Mail, Phone, Tag, UserPlus, Bell } from 'lucide-react';
import { ActionData, ActionType } from '@/lib/flowTypes';
import { cn } from '@/lib/utils';

interface ActionNodeProps {
  data: {
    label: string;
    actionData?: ActionData;
  };
  selected?: boolean;
}

const actionIcons: Record<ActionType, typeof Play> = {
  collect_email: Mail,
  collect_phone: Phone,
  add_tag: Tag,
  remove_tag: Tag,
  subscribe: UserPlus,
  unsubscribe: UserPlus,
  create_lead: UserPlus,
  notify: Bell,
};

const actionLabels: Record<ActionType, string> = {
  collect_email: 'Collect Email',
  collect_phone: 'Collect Phone',
  add_tag: 'Add Tag',
  remove_tag: 'Remove Tag',
  subscribe: 'Subscribe',
  unsubscribe: 'Unsubscribe',
  create_lead: 'Create Lead',
  notify: 'Send Notification',
};

function ActionNode({ data, selected }: ActionNodeProps) {
  const actionData = data.actionData;
  const Icon = actionIcons[actionData?.actionType || 'collect_email'] || Play;
  const label = actionLabels[actionData?.actionType || 'collect_email'] || 'Action';

  return (
    <div
      className={cn(
        'px-4 py-3 rounded-lg shadow-md border-2 bg-white min-w-[160px]',
        selected ? 'border-red-500' : 'border-red-300'
      )}
    >
      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-red-500 !border-2 !border-white"
      />

      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-md bg-red-100">
          <Icon className="h-4 w-4 text-red-600" />
        </div>
        <div>
          <div className="text-xs font-medium text-red-600 uppercase tracking-wide">
            Action
          </div>
          <div className="text-sm font-semibold text-gray-900">{label}</div>
        </div>
      </div>

      {/* Tag preview */}
      {actionData?.tag && (
        <div className="mt-2 pt-2 border-t border-gray-100">
          <span className="px-1.5 py-0.5 text-xs bg-red-50 text-red-700 rounded">
            {actionData.tag}
          </span>
        </div>
      )}

      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-red-500 !border-2 !border-white"
      />
    </div>
  );
}

export default memo(ActionNode);
