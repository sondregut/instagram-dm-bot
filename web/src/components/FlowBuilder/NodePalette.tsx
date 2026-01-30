'use client';

import { DragEvent } from 'react';
import { Zap, MessageSquare, GitBranch, Clock, Play } from 'lucide-react';
import { FlowNodeType } from '@/lib/flowTypes';

interface NodeTypeItem {
  type: FlowNodeType;
  label: string;
  description: string;
  icon: typeof Zap;
  color: string;
  bgColor: string;
}

const nodeTypes: NodeTypeItem[] = [
  {
    type: 'trigger',
    label: 'Trigger',
    description: 'Start your flow',
    icon: Zap,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-100',
  },
  {
    type: 'message',
    label: 'Message',
    description: 'Send a message',
    icon: MessageSquare,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
  },
  {
    type: 'condition',
    label: 'Condition',
    description: 'Branch logic',
    icon: GitBranch,
    color: 'text-amber-600',
    bgColor: 'bg-amber-100',
  },
  {
    type: 'delay',
    label: 'Delay',
    description: 'Wait before next step',
    icon: Clock,
    color: 'text-violet-600',
    bgColor: 'bg-violet-100',
  },
  {
    type: 'action',
    label: 'Action',
    description: 'Collect data, tag user',
    icon: Play,
    color: 'text-red-600',
    bgColor: 'bg-red-100',
  },
];

interface NodePaletteProps {
  className?: string;
}

export function NodePalette({ className }: NodePaletteProps) {
  const onDragStart = (event: DragEvent, nodeType: FlowNodeType) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className={className}>
      <h3 className="text-sm font-semibold text-gray-900 mb-3">Nodes</h3>
      <div className="space-y-2">
        {nodeTypes.map((node) => (
          <div
            key={node.type}
            draggable
            onDragStart={(e) => onDragStart(e, node.type)}
            className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-white cursor-grab hover:border-gray-300 hover:shadow-sm transition-all active:cursor-grabbing"
          >
            <div className={`p-2 rounded-md ${node.bgColor}`}>
              <node.icon className={`h-4 w-4 ${node.color}`} />
            </div>
            <div>
              <div className="text-sm font-medium text-gray-900">{node.label}</div>
              <div className="text-xs text-gray-500">{node.description}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 pt-4 border-t border-gray-200">
        <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
          How to use
        </h4>
        <ul className="text-xs text-gray-500 space-y-1">
          <li>Drag nodes to the canvas</li>
          <li>Connect nodes by dragging handles</li>
          <li>Click a node to edit it</li>
          <li>Press Delete to remove selected</li>
        </ul>
      </div>
    </div>
  );
}
