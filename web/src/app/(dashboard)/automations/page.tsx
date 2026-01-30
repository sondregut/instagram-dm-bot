'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Edit2, Zap, MessageSquare, UserPlus, Image, AtSign } from 'lucide-react';
import { cloudFunctions, Automation, AutomationInput, AutomationType } from '@/lib/firebase';
import { Button } from '@/components/Button';
import { Modal } from '@/components/Modal';
import { Input } from '@/components/Input';
import { Textarea } from '@/components/Textarea';
import { Select } from '@/components/Select';
import { Toggle } from '@/components/Toggle';
import { PostSelector } from '@/components/PostSelector';
import { cn } from '@/lib/utils';
import { useAccount, NoAccountPrompt } from '@/components/AccountSelector';
import { styles } from '@/lib/styles';

const automationTypes: { value: AutomationType; label: string; icon: typeof Zap; description: string }[] = [
  { value: 'comment_to_dm', label: 'Comment to DM', icon: MessageSquare, description: 'Send DM when someone comments with keywords' },
  { value: 'keyword_dm', label: 'Keyword DM Response', icon: Zap, description: 'Reply when someone DMs with keywords' },
  { value: 'new_follower', label: 'New Follower Welcome', icon: UserPlus, description: 'Welcome new followers automatically' },
  { value: 'story_reply', label: 'Story Reply', icon: Image, description: 'Respond when someone replies to your story' },
  { value: 'story_mention', label: 'Story Mention', icon: AtSign, description: 'Respond when mentioned in someone\'s story' },
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

  const getTypeLabel = (type: string) => {
    const found = automationTypes.find((t) => t.value === type);
    return found?.label || type;
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
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Automations</h1>
          <p className="text-gray-500 mt-1">Manage your DM automation triggers</p>
        </div>
        <div className="rounded-xl bg-white shadow-sm border border-gray-100">
          <NoAccountPrompt onConnectClick={() => window.location.href = '/settings'} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Automations</h1>
          <p className="text-gray-500 mt-1">Manage your DM automation triggers</p>
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
        <div className="rounded-xl bg-white shadow-sm border border-gray-100 p-12 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-accent/10 to-accent-secondary/10 flex items-center justify-center">
            <Zap className="h-8 w-8 text-accent" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-gray-900">
            No automations yet
          </h3>
          <p className="mt-2 text-gray-500">
            Create your first automation to start engaging with your audience
          </p>
          <Button
            className="mt-6"
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
                className="rounded-xl bg-white shadow-sm border border-gray-100 p-6"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="rounded-lg bg-gradient-to-br from-accent to-accent-secondary p-2.5">
                      <Icon className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-gray-900">
                          {getTypeLabel(automation.type)}
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
                      {automation.trigger.keywords.length > 0 && (
                        <p className="mt-2 text-sm text-gray-500">
                          Keywords:{' '}
                          {automation.trigger.keywords.join(', ')}
                        </p>
                      )}
                      {automation.trigger.postIds && automation.trigger.postIds.length > 0 && (
                        <p className="mt-1 text-sm text-gray-500">
                          Limited to {automation.trigger.postIds.length} specific post{automation.trigger.postIds.length > 1 ? 's' : ''}
                        </p>
                      )}
                      <p className="mt-1 text-sm text-gray-500">
                        Response: {automation.response.type === 'ai' ? 'AI-Powered' : 'Static Message'}
                      </p>
                      {automation.collectEmail && (
                        <span className={cn(styles.badge.base, styles.badge.info, 'mt-3')}>
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
                      <Trash2 className="h-4 w-4 text-status-error" />
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
      storyIds: automation?.trigger.storyIds || [],
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

  // Determine which fields to show based on automation type
  const showKeywords = ['comment_to_dm', 'keyword_dm', 'story_reply'].includes(formData.type);
  const showPostSelector = formData.type === 'comment_to_dm';

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
            setFormData({ ...formData, type: e.target.value as AutomationType })
          }
          options={automationTypes.map(t => ({ value: t.value, label: t.label }))}
        />

        {/* Type description */}
        <p className="text-sm text-gray-500 -mt-3">
          {automationTypes.find(t => t.value === formData.type)?.description}
        </p>

        {showKeywords && (
          <Input
            label={formData.type === 'story_reply' ? 'Trigger Keywords (optional, comma-separated)' : 'Trigger Keywords (comma-separated)'}
            value={keywordsInput}
            onChange={(e) => setKeywordsInput(e.target.value)}
            placeholder="FREE, GUIDE, LINK"
          />
        )}

        {showPostSelector && (
          <PostSelector
            selectedPostIds={formData.trigger.postIds || []}
            onChange={(postIds) =>
              setFormData({
                ...formData,
                trigger: { ...formData.trigger, postIds },
              })
            }
            posts={[]} // TODO: Fetch actual posts from Instagram API
            isLoading={false}
          />
        )}

        <Select
          label="Response Type"
          value={formData.response.type}
          onChange={(e) =>
            setFormData({
              ...formData,
              response: { ...formData.response, type: e.target.value as 'static' | 'ai' },
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

        <div className="flex justify-end gap-3 pt-6 border-t border-gray-200">
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
