'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Input } from '@/components/Input';
import { Textarea } from '@/components/Textarea';
import { Select } from '@/components/Select';
import { Toggle } from '@/components/Toggle';
import { Button } from '@/components/Button';
import {
  FlowNode,
  TriggerData,
  MessageData,
  ConditionData,
  DelayData,
  ActionData,
  TRIGGER_TYPES,
  MESSAGE_TYPES,
  CONDITION_TYPES,
  DELAY_UNITS,
  ACTION_TYPES,
} from '@/lib/flowTypes';

interface NodeEditorProps {
  node: FlowNode | null;
  onUpdate: (nodeId: string, data: TriggerData | MessageData | ConditionData | DelayData | ActionData) => void;
  onClose: () => void;
  onDelete: (nodeId: string) => void;
}

export function NodeEditor({ node, onUpdate, onClose, onDelete }: NodeEditorProps) {
  const [localData, setLocalData] = useState<TriggerData | MessageData | ConditionData | DelayData | ActionData | null>(null);
  const [keywordsInput, setKeywordsInput] = useState('');
  const [quickRepliesInput, setQuickRepliesInput] = useState('');

  useEffect(() => {
    if (node) {
      setLocalData(node.data as TriggerData | MessageData | ConditionData | DelayData | ActionData);

      // Set keywords input for trigger and condition nodes
      if (node.type === 'trigger') {
        const data = node.data as TriggerData;
        setKeywordsInput(data.keywords?.join(', ') || '');
      } else if (node.type === 'condition') {
        const data = node.data as ConditionData;
        setKeywordsInput(data.keywords?.join(', ') || '');
      } else if (node.type === 'message') {
        const data = node.data as MessageData;
        setQuickRepliesInput(data.quickReplies?.join(', ') || '');
      }
    }
  }, [node]);

  if (!node || !localData) {
    return (
      <div className="p-4 text-center text-gray-500">
        <p className="text-sm">Select a node to edit</p>
      </div>
    );
  }

  const handleSave = () => {
    if (!localData) return;

    // Process keywords for trigger and condition nodes
    let finalData = { ...localData };

    if (node.type === 'trigger') {
      const keywords = keywordsInput
        .split(',')
        .map((k) => k.trim())
        .filter((k) => k.length > 0);
      (finalData as TriggerData).keywords = keywords;
    } else if (node.type === 'condition' && (localData as ConditionData).conditionType === 'keyword_match') {
      const keywords = keywordsInput
        .split(',')
        .map((k) => k.trim())
        .filter((k) => k.length > 0);
      (finalData as ConditionData).keywords = keywords;
    } else if (node.type === 'message') {
      const quickReplies = quickRepliesInput
        .split(',')
        .map((q) => q.trim())
        .filter((q) => q.length > 0);
      (finalData as MessageData).quickReplies = quickReplies;
    }

    onUpdate(node.id, finalData);
  };

  const renderTriggerEditor = () => {
    const data = localData as TriggerData;
    return (
      <div className="space-y-4">
        <Select
          label="Trigger Type"
          value={data.triggerType}
          onChange={(e) => setLocalData({ ...data, triggerType: e.target.value as TriggerData['triggerType'] })}
          options={TRIGGER_TYPES.map((t) => ({ value: t.value, label: t.label }))}
        />

        {['comment', 'keyword'].includes(data.triggerType) && (
          <Input
            label="Keywords (comma-separated)"
            value={keywordsInput}
            onChange={(e) => setKeywordsInput(e.target.value)}
            placeholder="FREE, GUIDE, LINK"
          />
        )}
      </div>
    );
  };

  const renderMessageEditor = () => {
    const data = localData as MessageData;
    return (
      <div className="space-y-4">
        <Select
          label="Message Type"
          value={data.messageType}
          onChange={(e) => setLocalData({ ...data, messageType: e.target.value as MessageData['messageType'] })}
          options={MESSAGE_TYPES}
        />

        <Toggle
          label="Use AI to generate response"
          enabled={data.useAI || false}
          onChange={(enabled) => setLocalData({ ...data, useAI: enabled })}
        />

        {data.useAI ? (
          <Textarea
            label="AI Prompt"
            value={data.aiPrompt || ''}
            onChange={(e) => setLocalData({ ...data, aiPrompt: e.target.value })}
            placeholder="You are a friendly assistant..."
            rows={4}
          />
        ) : (
          <Textarea
            label="Message Text"
            value={data.text || ''}
            onChange={(e) => setLocalData({ ...data, text: e.target.value })}
            placeholder="Hey {username}! Thanks for reaching out..."
            rows={4}
          />
        )}

        {data.messageType === 'quick_replies' && (
          <Input
            label="Quick Replies (comma-separated)"
            value={quickRepliesInput}
            onChange={(e) => setQuickRepliesInput(e.target.value)}
            placeholder="Yes, No, Maybe"
          />
        )}
      </div>
    );
  };

  const renderConditionEditor = () => {
    const data = localData as ConditionData;
    return (
      <div className="space-y-4">
        <Select
          label="Condition Type"
          value={data.conditionType}
          onChange={(e) => setLocalData({ ...data, conditionType: e.target.value as ConditionData['conditionType'] })}
          options={CONDITION_TYPES}
        />

        {data.conditionType === 'keyword_match' && (
          <Input
            label="Keywords to match (comma-separated)"
            value={keywordsInput}
            onChange={(e) => setKeywordsInput(e.target.value)}
            placeholder="yes, interested, sure"
          />
        )}

        {data.conditionType === 'custom_field' && (
          <Input
            label="Field Name"
            value={data.value || ''}
            onChange={(e) => setLocalData({ ...data, value: e.target.value })}
            placeholder="field_name"
          />
        )}
      </div>
    );
  };

  const renderDelayEditor = () => {
    const data = localData as DelayData;
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Duration"
            type="number"
            min={1}
            value={data.value || 1}
            onChange={(e) => setLocalData({ ...data, value: parseInt(e.target.value) || 1 })}
          />
          <Select
            label="Unit"
            value={data.delayType}
            onChange={(e) => setLocalData({ ...data, delayType: e.target.value as DelayData['delayType'] })}
            options={DELAY_UNITS}
          />
        </div>
      </div>
    );
  };

  const renderActionEditor = () => {
    const data = localData as ActionData;
    return (
      <div className="space-y-4">
        <Select
          label="Action Type"
          value={data.actionType}
          onChange={(e) => setLocalData({ ...data, actionType: e.target.value as ActionData['actionType'] })}
          options={ACTION_TYPES}
        />

        {['add_tag', 'remove_tag'].includes(data.actionType) && (
          <Input
            label="Tag Name"
            value={data.tag || ''}
            onChange={(e) => setLocalData({ ...data, tag: e.target.value })}
            placeholder="interested"
          />
        )}

        {['collect_email', 'collect_phone'].includes(data.actionType) && (
          <Textarea
            label="Custom Message (optional)"
            value={data.customMessage || ''}
            onChange={(e) => setLocalData({ ...data, customMessage: e.target.value })}
            placeholder="What's your email address?"
            rows={2}
          />
        )}

        {data.actionType === 'notify' && (
          <Input
            label="Notification Email"
            type="email"
            value={data.notifyEmail || ''}
            onChange={(e) => setLocalData({ ...data, notifyEmail: e.target.value })}
            placeholder="team@example.com"
          />
        )}
      </div>
    );
  };

  const renderEditor = () => {
    switch (node.type) {
      case 'trigger':
        return renderTriggerEditor();
      case 'message':
        return renderMessageEditor();
      case 'condition':
        return renderConditionEditor();
      case 'delay':
        return renderDelayEditor();
      case 'action':
        return renderActionEditor();
      default:
        return <p>Unknown node type</p>;
    }
  };

  const getNodeTitle = () => {
    switch (node.type) {
      case 'trigger':
        return 'Edit Trigger';
      case 'message':
        return 'Edit Message';
      case 'condition':
        return 'Edit Condition';
      case 'delay':
        return 'Edit Delay';
      case 'action':
        return 'Edit Action';
      default:
        return 'Edit Node';
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-900">{getNodeTitle()}</h3>
        <button
          onClick={onClose}
          className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">{renderEditor()}</div>

      {/* Actions */}
      <div className="border-t border-gray-200 p-4 space-y-2">
        <Button onClick={handleSave} className="w-full">
          Save Changes
        </Button>
        <Button
          variant="ghost"
          onClick={() => onDelete(node.id)}
          className="w-full text-red-600 hover:bg-red-50"
        >
          Delete Node
        </Button>
      </div>
    </div>
  );
}
