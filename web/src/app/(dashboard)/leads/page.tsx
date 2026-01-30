'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Download, Trash2, Mail, Phone, Filter } from 'lucide-react';
import { cloudFunctions, Lead } from '@/lib/firebase';
import { Button } from '@/components/Button';
import { Select } from '@/components/Select';
import { formatDate, downloadCSV } from '@/lib/utils';

const sourceOptions = [
  { value: '', label: 'All Sources' },
  { value: 'comment_to_dm', label: 'Comment to DM' },
  { value: 'keyword_dm', label: 'Keyword DM' },
  { value: 'new_follower', label: 'New Follower' },
];

export default function LeadsPage() {
  const queryClient = useQueryClient();
  const [sourceFilter, setSourceFilter] = useState('');
  const [hasEmailFilter, setHasEmailFilter] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['leads', sourceFilter, hasEmailFilter],
    queryFn: async () => {
      const result = await cloudFunctions.getLeads({
        source: sourceFilter || undefined,
        hasEmail: hasEmailFilter || undefined,
        limit: 100,
      });
      return result.data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (leadId: string) => {
      return cloudFunctions.deleteLead({ leadId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      return cloudFunctions.exportLeads({
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

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leads</h1>
          <p className="text-gray-500">Manage collected leads and contacts</p>
        </div>
        <Button
          onClick={() => exportMutation.mutate()}
          loading={exportMutation.isPending}
          variant="secondary"
        >
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="mb-6 flex items-center gap-4 p-4 bg-white rounded-xl shadow-sm border border-gray-100">
        <Filter className="h-5 w-5 text-gray-400" />
        <Select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          options={sourceOptions}
          className="w-48"
        />
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={hasEmailFilter}
            onChange={(e) => setHasEmailFilter(e.target.checked)}
            className="rounded border-gray-300 text-instagram-pink focus:ring-instagram-pink"
          />
          Has Email
        </label>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-instagram-pink border-t-transparent" />
        </div>
      ) : leads.length === 0 ? (
        <div className="rounded-xl bg-white p-12 text-center shadow-sm border border-gray-100">
          <Users className="mx-auto h-12 w-12 text-gray-300" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">
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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Contact
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Source
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {leads.map((lead) => (
                <tr key={lead.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="h-8 w-8 rounded-full bg-gradient-to-br from-instagram-pink to-instagram-purple flex items-center justify-center text-white text-sm font-medium">
                        {lead.username.charAt(0).toUpperCase()}
                      </div>
                      <div className="ml-3">
                        <p className="text-sm font-medium text-gray-900">
                          @{lead.username}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col gap-1">
                      {lead.email && (
                        <div className="flex items-center gap-1 text-sm text-gray-600">
                          <Mail className="h-3 w-3" />
                          {lead.email}
                        </div>
                      )}
                      {lead.phone && (
                        <div className="flex items-center gap-1 text-sm text-gray-600">
                          <Phone className="h-3 w-3" />
                          {lead.phone}
                        </div>
                      )}
                      {!lead.email && !lead.phone && (
                        <span className="text-sm text-gray-400">No contact info</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 capitalize">
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
                      <Trash2 className="h-4 w-4 text-red-500" />
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
