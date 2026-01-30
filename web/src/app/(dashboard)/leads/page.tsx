'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Download, Trash2, Mail, Phone, Filter } from 'lucide-react';
import { cloudFunctions, Lead } from '@/lib/firebase';
import { Button } from '@/components/Button';
import { Select } from '@/components/Select';
import { formatDate, downloadCSV, cn } from '@/lib/utils';
import { useAccount, NoAccountPrompt } from '@/components/AccountSelector';
import { styles } from '@/lib/styles';

const sourceOptions = [
  { value: '', label: 'All Sources' },
  { value: 'comment_to_dm', label: 'Comment to DM' },
  { value: 'keyword_dm', label: 'Keyword DM' },
  { value: 'new_follower', label: 'New Follower' },
];

export default function LeadsPage() {
  const queryClient = useQueryClient();
  const { selectedAccount, accounts, isLoading: accountsLoading } = useAccount();
  const [sourceFilter, setSourceFilter] = useState('');
  const [hasEmailFilter, setHasEmailFilter] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['leads', selectedAccount?.id, sourceFilter, hasEmailFilter],
    queryFn: async () => {
      const result = await cloudFunctions.getLeads({
        accountId: selectedAccount?.id,
        source: sourceFilter || undefined,
        hasEmail: hasEmailFilter || undefined,
        limit: 100,
      });
      return result.data;
    },
    enabled: !!selectedAccount,
  });

  const deleteMutation = useMutation({
    mutationFn: async (leadId: string) => {
      return cloudFunctions.deleteLead({ leadId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads', selectedAccount?.id] });
    },
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      return cloudFunctions.exportLeads({
        accountId: selectedAccount?.id,
        source: sourceFilter || undefined,
      });
    },
    onSuccess: (result) => {
      const filename = `leads-${new Date().toISOString().split('T')[0]}.csv`;
      downloadCSV(result.data.csv, filename);
    },
  });

  const leads = data?.leads || [];

  const handleDelete = async (leadId: string) => {
    if (confirm('Are you sure you want to delete this lead?')) {
      await deleteMutation.mutateAsync(leadId);
    }
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
          <h1 className="text-xl font-semibold text-ink">Leads</h1>
          <p className="text-ink-muted text-sm">Manage collected leads and contacts</p>
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
          <h1 className="text-xl font-semibold text-ink">Leads</h1>
          <p className="text-ink-muted text-sm">Manage collected leads and contacts</p>
        </div>
        <Button
          onClick={() => exportMutation.mutate()}
          loading={exportMutation.isPending}
          variant="secondary"
        >
          <Download className="mr-1.5 h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="mb-5 flex items-center gap-4 p-3 bg-surface rounded-md border border-surface-border">
        <Filter className="h-4 w-4 text-ink-muted" />
        <Select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          options={sourceOptions}
          className="w-44"
        />
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <input
            type="checkbox"
            checked={hasEmailFilter}
            onChange={(e) => setHasEmailFilter(e.target.checked)}
            className="rounded border-surface-border text-ink focus:ring-ink"
          />
          Has Email
        </label>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <span className={styles.spinner} />
        </div>
      ) : leads.length === 0 ? (
        <div className="rounded-md border border-surface-border bg-surface p-12 text-center">
          <Users className="mx-auto h-10 w-10 text-ink-subtle" />
          <h3 className="mt-4 text-base font-medium text-ink">
            No leads yet
          </h3>
          <p className="mt-1 text-ink-muted text-sm">
            Leads will appear here when users share their contact info
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-surface-border bg-surface">
          <table className="min-w-full divide-y divide-surface-border">
            <thead className="bg-surface-sunken">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-medium text-ink-muted uppercase tracking-wide">
                  User
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-ink-muted uppercase tracking-wide">
                  Contact
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-ink-muted uppercase tracking-wide">
                  Source
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-ink-muted uppercase tracking-wide">
                  Date
                </th>
                <th className="px-5 py-3 text-right text-xs font-medium text-ink-muted uppercase tracking-wide">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {leads.map((lead) => (
                <tr key={lead.id} className="hover:bg-surface-sunken">
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className={cn(styles.avatar.base, styles.avatar.sizes.sm)}>
                        {lead.username.charAt(0).toUpperCase()}
                      </div>
                      <div className="ml-2.5">
                        <p className="text-sm font-medium text-ink">
                          @{lead.username}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <div className="flex flex-col gap-0.5">
                      {lead.email && (
                        <div className="flex items-center gap-1 text-sm text-ink-muted">
                          <Mail className="h-3 w-3" />
                          {lead.email}
                        </div>
                      )}
                      {lead.phone && (
                        <div className="flex items-center gap-1 text-sm text-ink-muted">
                          <Phone className="h-3 w-3" />
                          {lead.phone}
                        </div>
                      )}
                      {!lead.email && !lead.phone && (
                        <span className="text-sm text-ink-subtle">No contact info</span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <span className={cn(styles.badge.base, styles.badge.neutral, 'capitalize')}>
                      {lead.source.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-sm text-ink-muted">
                    {formatDate(lead.createdAt)}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(lead.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-status-error" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
