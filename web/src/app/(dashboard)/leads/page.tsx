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
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Leads</h1>
          <p className="text-gray-500 mt-1">Manage collected leads and contacts</p>
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
          <h1 className="text-2xl font-bold text-gray-900">Leads</h1>
          <p className="text-gray-500 mt-1">Manage collected leads and contacts</p>
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
      <div className="mb-6 flex items-center gap-4 p-4 bg-white rounded-xl shadow-sm border border-gray-100">
        <Filter className="h-4 w-4 text-gray-400" />
        <Select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          options={sourceOptions}
          className="w-44"
        />
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={hasEmailFilter}
            onChange={(e) => setHasEmailFilter(e.target.checked)}
            className="rounded border-gray-300 text-accent focus:ring-accent"
          />
          Has Email
        </label>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <span className={styles.spinner} />
        </div>
      ) : leads.length === 0 ? (
        <div className="rounded-xl bg-white shadow-sm border border-gray-100 p-12 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-accent/10 to-accent-secondary/10 flex items-center justify-center">
            <Users className="h-8 w-8 text-accent" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-gray-900">
            No leads yet
          </h3>
          <p className="mt-2 text-gray-500">
            Leads will appear here when users share their contact info
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl bg-white shadow-sm border border-gray-100">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  User
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Contact
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Source
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Date
                </th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {leads.map((lead) => (
                <tr key={lead.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className={cn(styles.avatar.base, styles.avatar.sizes.sm)}>
                        {lead.username.charAt(0).toUpperCase()}
                      </div>
                      <div className="ml-3">
                        <p className="text-sm font-semibold text-gray-900">
                          @{lead.username}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col gap-1">
                      {lead.email && (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Mail className="h-3.5 w-3.5" />
                          {lead.email}
                        </div>
                      )}
                      {lead.phone && (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Phone className="h-3.5 w-3.5" />
                          {lead.phone}
                        </div>
                      )}
                      {!lead.email && !lead.phone && (
                        <span className="text-sm text-gray-400">No contact info</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={cn(styles.badge.base, styles.badge.neutral, 'capitalize')}>
                      {lead.source.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(lead.createdAt)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(lead.id)}
                    >
                      <Trash2 className="h-4 w-4 text-status-error" />
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
