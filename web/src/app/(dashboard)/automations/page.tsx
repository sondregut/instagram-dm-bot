'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Edit2, Zap, MessageSquare, UserPlus } from 'lucide-react';
import { cloudFunctions, Automation, AutomationInput } from '@/lib/firebase';
import { Button } from '@/components/Button';
import { Modal } from '@/components/Modal';
import { Input } from '@/components/Input';
import { Textarea } from '@/components/Textarea';
import { Select } from '@/components/Select';
import { Toggle } from '@/components/Toggle';
import { formatDate } from '@/lib/utils';

const automationTypes = [
  { value: 'comment_to_dm', label: 'Comment to DM', icon: MessageSquare },
  { value: 'keyword_dm', label: 'Keyword DM Response', icon: Zap },
  { value: 'new_follower', label: 'New Follower Welcome', icon: UserPlus },
];

const responseTypes = [
  { value: 'static', label: 'Static Message' },
  { value: 'ai', label: 'AI-Powered Response' },
];

export default function AutomationsPage() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAutomation, setEditingAutomation] = useState<Automation | null>(null);

  const { data: automations, isLoading } = useQuery({
    queryKey: ['automations'],
    queryFn: async () => {
      const result = await cloudFunctions.getAutomations();
      return result.data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: AutomationInput) => {
      return cloudFunctions.saveAutomation(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations'] });
      setIsModalOpen(false);
      setEditingAutomation(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return cloudFunctions.deleteAutomation({ id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations'] });
    },
  });

  const handleEdit = (automation: Automation) => {
    setEditingAutomation(automation);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this automation?')) {
      await deleteMutation.mutateAsync(id);
    }
  };

  const getTypeIcon = (type: string) => {
    const found = automationTypes.find((t) => t.value === type);
    return found?.icon || Zap;
  };

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Automations</h1>
          <p className="text-gray-500">Manage your DM automation triggers</p>
        </div>
        <Button
          onClick={() => {
            setEditingAutomation(null);
            setIsModalOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          New Automation
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-instagram-pink border-t-transparent" />
        </div>
      ) : automations?.length === 0 ? (
        <div className="rounded-xl bg-white p-12 text-center shadow-sm border border-gray-100">
          <Zap className="mx-auto h-12 w-12 text-gray-300" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">
            No automations yet
          </h3>
          <p className="mt-2 text-gray-500">
            Create your first automation to start engaging with your audience
          </p>
          <Button
            className="mt-4"
            onClick={() => {
              setEditingAutomation(null);
              setIsModalOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Create Automation
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {automations?.map((automation) => {
            const Icon = getTypeIcon(automation.type);
            return (
              <div
                key={automation.id}
                className="rounded-xl bg-white p-6 shadow-sm border border-gray-100"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="rounded-lg bg-gray-100 p-3">
                      <Icon className="h-6 w-6 text-gray-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900">
                          {automationTypes.find((t) => t.value === automation.type)?.label}
                        </h3>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            automation.isActive
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {automation.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-gray-500">
                        Keywords:{' '}
                        {automation.trigger.keywords.join(', ') || 'None'}
                      </p>
                      <p className="mt-1 text-sm text-gray-500">
                        Response: {automation.response.type === 'ai' ? 'AI-Powered' : 'Static Message'}
                      </p>
                      {automation.collectEmail && (
                        <span className="mt-2 inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                          Collects Email
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(automation)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(automation.id)}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      <AutomationModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingAutomation(null);
        }}
        automation={editingAutomation}
        onSave={(data) => saveMutation.mutate(data)}
        isSaving={saveMutation.isPending}
      />
    </div>
  );
}

interface AutomationModalProps {
  isOpen: boolean;
  onClose: () => void;
  automation: Automation | null;
  onSave: (data: AutomationInput) => void;
  isSaving: boolean;
}

function AutomationModal({
  isOpen,
  onClose,
  automation,
  onSave,
  isSaving,
}: AutomationModalProps) {
  const [formData, setFormData] = useState<AutomationInput>(() => ({
    id: automation?.id,
    type: automation?.type || 'keyword_dm',
    trigger: {
      keywords: automation?.trigger.keywords || [],
      postIds: automation?.trigger.postIds || [],
    },
    response: {
      type: automation?.response.type || 'static',
      staticMessage: automation?.response.staticMessage || '',
      aiPrompt: automation?.response.aiPrompt || '',
    },
    collectEmail: automation?.collectEmail || false,
    isActive: automation?.isActive ?? true,
  }));

  const [keywordsInput, setKeywordsInput] = useState(
    automation?.trigger.keywords.join(', ') || ''
  );

  // Reset form when automation changes
  useState(() => {
    if (automation) {
      setFormData({
        id: automation.id,
        type: automation.type,
        trigger: automation.trigger,
        response: automation.response,
        collectEmail: automation.collectEmail,
        isActive: automation.isActive,
      });
      setKeywordsInput(automation.trigger.keywords.join(', '));
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const keywords = keywordsInput
      .split(',')
      .map((k) => k.trim())
      .filter((k) => k.length > 0);

    onSave({
      ...formData,
      trigger: {
        ...formData.trigger,
        keywords,
      },
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={automation ? 'Edit Automation' : 'Create Automation'}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <Select
          label="Automation Type"
          value={formData.type}
          onChange={(e) =>
            setFormData({ ...formData, type: e.target.value as any })
          }
          options={automationTypes}
        />

        <Input
          label="Trigger Keywords (comma-separated)"
          value={keywordsInput}
          onChange={(e) => setKeywordsInput(e.target.value)}
          placeholder="FREE, GUIDE, LINK"
        />

        <Select
          label="Response Type"
          value={formData.response.type}
          onChange={(e) =>
            setFormData({
              ...formData,
              response: { ...formData.response, type: e.target.value as any },
            })
          }
          options={responseTypes}
        />

        {formData.response.type === 'static' ? (
          <Textarea
            label="Static Message"
            value={formData.response.staticMessage || ''}
            onChange={(e) =>
              setFormData({
                ...formData,
                response: { ...formData.response, staticMessage: e.target.value },
              })
            }
            placeholder="Thanks for reaching out! Here's your free guide..."
            rows={4}
          />
        ) : (
          <Textarea
            label="AI System Prompt"
            value={formData.response.aiPrompt || ''}
            onChange={(e) =>
              setFormData({
                ...formData,
                response: { ...formData.response, aiPrompt: e.target.value },
              })
            }
            placeholder="You are a friendly assistant for a fitness brand. Your goal is to..."
            rows={6}
          />
        )}

        <div className="flex items-center gap-6">
          <Toggle
            enabled={formData.collectEmail}
            onChange={(enabled) =>
              setFormData({ ...formData, collectEmail: enabled })
            }
            label="Collect Email"
          />
          <Toggle
            enabled={formData.isActive}
            onChange={(enabled) =>
              setFormData({ ...formData, isActive: enabled })
            }
            label="Active"
          />
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={isSaving}>
            {automation ? 'Save Changes' : 'Create Automation'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
