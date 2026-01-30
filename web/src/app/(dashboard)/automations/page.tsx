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
import { formatDate, cn } from '@/lib/utils';
import { useAccount, NoAccountPrompt } from '@/components/AccountSelector';
import { styles } from '@/lib/styles';

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
  const { selectedAccount, accounts, isLoading: accountsLoading } = useAccount();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAutomation, setEditingAutomation] = useState<Automation | null>(null);

  const { data: automations, isLoading } = useQuery({
    queryKey: ['automations', selectedAccount?.id],
    queryFn: async () => {
      const result = await cloudFunctions.getAutomations({
        accountId: selectedAccount?.id,
      });
      return result.data;
    },
    enabled: !!selectedAccount,
  });

  const saveMutation = useMutation({
    mutationFn: async (data: AutomationInput) => {
      return cloudFunctions.saveAutomation(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations', selectedAccount?.id] });
      setIsModalOpen(false);
      setEditingAutomation(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return cloudFunctions.deleteAutomation({ id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations', selectedAccount?.id] });
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

  if (accountsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className={styles.spinner} />
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div>
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-ink">Automations</h1>
          <p className="text-ink-muted text-sm">Manage your DM automation triggers</p>
        </div>
        <div className="rounded-md border border-surface-border bg-surface">
          <NoAccountPrompt onConnectClick={() => window.location.href = '/settings'} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Automations</h1>
          <p className="text-ink-muted text-sm">Manage your DM automation triggers</p>
        </div>
        <Button
          onClick={() => {
            setEditingAutomation(null);
            setIsModalOpen(true);
          }}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          New Automation
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <span className={styles.spinner} />
        </div>
      ) : automations?.length === 0 ? (
        <div className="rounded-md border border-surface-border bg-surface p-12 text-center">
          <Zap className="mx-auto h-10 w-10 text-ink-subtle" />
          <h3 className="mt-4 text-base font-medium text-ink">
            No automations yet
          </h3>
          <p className="mt-1 text-ink-muted text-sm">
            Create your first automation to start engaging with your audience
          </p>
          <Button
            className="mt-4"
            onClick={() => {
              setEditingAutomation(null);
              setIsModalOpen(true);
            }}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Create Automation
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {automations?.map((automation) => {
            const Icon = getTypeIcon(automation.type);
            return (
              <div
                key={automation.id}
                className="rounded-md border border-surface-border bg-surface p-5"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <Icon className="h-5 w-5 text-ink-muted mt-0.5" />
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-ink">
                          {automationTypes.find((t) => t.value === automation.type)?.label}
                        </h3>
                        <span
                          className={cn(
                            styles.badge.base,
                            automation.isActive
                              ? styles.badge.success
                              : styles.badge.neutral
                          )}
                        >
                          {automation.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-ink-muted">
                        Keywords:{' '}
                        {automation.trigger.keywords.join(', ') || 'None'}
                      </p>
                      <p className="mt-0.5 text-sm text-ink-muted">
                        Response: {automation.response.type === 'ai' ? 'AI-Powered' : 'Static Message'}
                      </p>
                      {automation.collectEmail && (
                        <span className={cn(styles.badge.base, 'mt-2 bg-status-info/10 text-status-info')}>
                          Collects Email
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(automation)}
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(automation.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-status-error" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      {selectedAccount && (
        <AutomationModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setEditingAutomation(null);
          }}
          automation={editingAutomation}
          accountId={selectedAccount.id}
          onSave={(data) => saveMutation.mutate(data)}
          isSaving={saveMutation.isPending}
        />
      )}
    </div>
  );
}

interface AutomationModalProps {
  isOpen: boolean;
  onClose: () => void;
  automation: Automation | null;
  accountId: string;
  onSave: (data: AutomationInput) => void;
  isSaving: boolean;
}

function AutomationModal({
  isOpen,
  onClose,
  automation,
  accountId,
  onSave,
  isSaving,
}: AutomationModalProps) {
  const [formData, setFormData] = useState<AutomationInput>(() => ({
    id: automation?.id,
    accountId,
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
        accountId,
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
      accountId,
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
      <form onSubmit={handleSubmit} className="space-y-5">
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

        <div className="flex justify-end gap-3 pt-4 border-t border-surface-border">
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
