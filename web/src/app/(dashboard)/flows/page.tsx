'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Edit2, GitBranch, Play, Pause, BarChart3 } from 'lucide-react';
import { cloudFunctions } from '@/lib/firebase';
import { Flow } from '@/lib/flowTypes';
import { Button } from '@/components/Button';
import { Modal } from '@/components/Modal';
import { Input } from '@/components/Input';
import { Textarea } from '@/components/Textarea';
import { cn, formatDate } from '@/lib/utils';
import { useAccount, NoAccountPrompt } from '@/components/AccountSelector';
import { styles } from '@/lib/styles';

export default function FlowsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { selectedAccount, accounts, isLoading: accountsLoading } = useAccount();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newFlowName, setNewFlowName] = useState('');
  const [newFlowDescription, setNewFlowDescription] = useState('');

  // Fetch flows
  const { data: flows, isLoading } = useQuery({
    queryKey: ['flows', selectedAccount?.id],
    queryFn: async () => {
      const result = await cloudFunctions.getFlows({
        accountId: selectedAccount?.id,
      });
      return result.data;
    },
    enabled: !!selectedAccount,
  });

  // Create flow mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAccount) throw new Error('No account selected');
      return cloudFunctions.createFlow({
        accountId: selectedAccount.id,
        name: newFlowName,
        description: newFlowDescription,
        nodes: [
          {
            id: 'trigger_1',
            type: 'trigger',
            position: { x: 250, y: 50 },
            data: {
              triggerType: 'keyword',
              keywords: [],
            },
          },
        ],
        edges: [],
        isActive: false,
      });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['flows', selectedAccount?.id] });
      setIsCreateModalOpen(false);
      setNewFlowName('');
      setNewFlowDescription('');
      // Navigate to the new flow editor
      router.push(`/flows/editor?id=${result.data.id}`);
    },
  });

  // Delete flow mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return cloudFunctions.deleteFlow({ id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flows', selectedAccount?.id] });
    },
  });

  // Toggle flow active mutation
  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return cloudFunctions.toggleFlowActive({ id, isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flows', selectedAccount?.id] });
    },
  });

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this flow?')) {
      await deleteMutation.mutateAsync(id);
    }
  };

  const handleToggle = async (flow: Flow) => {
    await toggleMutation.mutateAsync({ id: flow.id, isActive: !flow.isActive });
  };

  const handleCreate = () => {
    if (!newFlowName.trim()) return;
    createMutation.mutate();
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
          <h1 className="text-2xl font-bold text-gray-900">Flows</h1>
          <p className="text-gray-500 mt-1">Build visual automation flows</p>
        </div>
        <div className="rounded-xl bg-white shadow-sm border border-gray-100">
          <NoAccountPrompt onConnectClick={() => router.push('/settings')} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Flows</h1>
          <p className="text-gray-500 mt-1">Build visual automation flows</p>
        </div>
        <Button onClick={() => setIsCreateModalOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          New Flow
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <span className={styles.spinner} />
        </div>
      ) : flows?.length === 0 ? (
        <div className="rounded-xl bg-white shadow-sm border border-gray-100 p-12 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-accent/10 to-accent-secondary/10 flex items-center justify-center">
            <GitBranch className="h-8 w-8 text-accent" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-gray-900">
            No flows yet
          </h3>
          <p className="mt-2 text-gray-500">
            Create your first flow to build multi-step automations
          </p>
          <Button
            className="mt-6"
            onClick={() => setIsCreateModalOpen(true)}
          >
            <Plus className="mr-2 h-4 w-4" />
            Create Flow
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {flows?.map((flow) => (
            <div
              key={flow.id}
              className="rounded-xl bg-white shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-gradient-to-br from-accent to-accent-secondary p-2.5">
                    <GitBranch className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{flow.name}</h3>
                    <span
                      className={cn(
                        styles.badge.base,
                        flow.isActive ? styles.badge.success : styles.badge.neutral
                      )}
                    >
                      {flow.isActive ? 'Active' : 'Draft'}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleToggle(flow)}
                  className={cn(
                    'p-2 rounded-lg transition-colors',
                    flow.isActive
                      ? 'text-green-600 hover:bg-green-50'
                      : 'text-gray-400 hover:bg-gray-100'
                  )}
                  title={flow.isActive ? 'Pause flow' : 'Activate flow'}
                >
                  {flow.isActive ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                </button>
              </div>

              {flow.description && (
                <p className="mt-3 text-sm text-gray-500 line-clamp-2">
                  {flow.description}
                </p>
              )}

              <div className="mt-4 flex items-center gap-4 text-xs text-gray-500">
                <span>{flow.nodes.length} nodes</span>
                <span>{flow.triggerCount || 0} triggers</span>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs text-gray-400">
                  {flow.updatedAt
                    ? `Updated ${formatDate(flow.updatedAt._seconds * 1000)}`
                    : `Created ${formatDate(flow.createdAt._seconds * 1000)}`}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push(`/flows/editor?id=${flow.id}`)}
                    title="Edit flow"
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(flow.id)}
                    title="Delete flow"
                  >
                    <Trash2 className="h-4 w-4 text-status-error" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Flow Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create New Flow"
        size="md"
      >
        <div className="space-y-4">
          <Input
            label="Flow Name"
            value={newFlowName}
            onChange={(e) => setNewFlowName(e.target.value)}
            placeholder="Welcome Flow"
            autoFocus
          />
          <Textarea
            label="Description (optional)"
            value={newFlowDescription}
            onChange={(e) => setNewFlowDescription(e.target.value)}
            placeholder="Describe what this flow does..."
            rows={3}
          />
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <Button
              variant="secondary"
              onClick={() => setIsCreateModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              loading={createMutation.isPending}
              disabled={!newFlowName.trim()}
            >
              Create Flow
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
