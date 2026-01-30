'use client';

import { useQuery } from '@tanstack/react-query';
import { Users, MessageSquare, Zap, Activity } from 'lucide-react';
import { cloudFunctions, DashboardStats } from '@/lib/firebase';
import { StatsCard } from '@/components/StatsCard';
import { useAccount, NoAccountPrompt } from '@/components/AccountSelector';
import { styles } from '@/lib/styles';

export default function DashboardPage() {
  const { selectedAccount, accounts, isLoading: accountsLoading } = useAccount();

  const { data: stats, isLoading, error } = useQuery({
    queryKey: ['dashboardStats', selectedAccount?.id],
    queryFn: async () => {
      const result = await cloudFunctions.getDashboardStats({
        accountId: selectedAccount?.id,
      });
      return result.data;
    },
    enabled: !!selectedAccount,
  });

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
          <h1 className="text-xl font-semibold text-ink">Dashboard</h1>
          <p className="text-ink-muted text-sm">Monitor your Instagram DM automation</p>
        </div>
        <div className="rounded-md border border-surface-border bg-surface">
          <NoAccountPrompt onConnectClick={() => window.location.href = '/settings'} />
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className={styles.spinner} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border-l-2 border-status-error bg-status-error/5 p-4 text-status-error text-sm">
        Failed to load dashboard stats. Please try again.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink">Dashboard</h1>
        <p className="text-ink-muted text-sm">Monitor your Instagram DM automation</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total Leads"
          value={stats?.leads.total || 0}
          subtitle={`${stats?.leads.last24Hours || 0} in last 24h`}
          icon={Users}
        />
        <StatsCard
          title="Active Conversations"
          value={stats?.conversations.active || 0}
          subtitle={`${stats?.conversations.total || 0} total`}
          icon={MessageSquare}
        />
        <StatsCard
          title="New Followers DMed"
          value={stats?.followers.totalWelcomed || 0}
          subtitle={`${stats?.followers.last7Days || 0} this week`}
          icon={Zap}
        />
        <StatsCard
          title="Rate Limit"
          value={`${stats?.rateLimit.remaining || 0}/${stats?.rateLimit.limit || 200}`}
          subtitle="DMs remaining this hour"
          icon={Activity}
        />
      </div>

      {/* Lead Sources */}
      <div className="mt-6">
        <h2 className="mb-3 text-sm font-medium text-ink">
          Leads by Source
        </h2>
        <div className="rounded-md border border-surface-border bg-surface p-5">
          {stats?.leads.bySource && Object.keys(stats.leads.bySource).length > 0 ? (
            <div className="space-y-3">
              {Object.entries(stats.leads.bySource).map(([source, count]) => (
                <div key={source} className="flex items-center justify-between">
                  <span className="text-sm text-ink-muted capitalize">
                    {source.replace(/_/g, ' ')}
                  </span>
                  <span className="text-sm font-medium text-ink tabular-nums">
                    {count}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-ink-subtle">No leads collected yet</p>
          )}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-md border border-surface-border bg-surface p-5">
          <h2 className="mb-3 text-sm font-medium text-ink">
            Email Collection
          </h2>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold text-ink tabular-nums">
              {stats?.leads.withEmail || 0}
            </span>
            <span className="text-ink-muted text-sm">
              / {stats?.leads.total || 0} leads
            </span>
          </div>
          <div className="mt-3 h-1.5 w-full rounded-full bg-surface-sunken">
            <div
              className="h-1.5 rounded-full bg-accent"
              style={{
                width: `${
                  stats?.leads.total
                    ? (stats.leads.withEmail / stats.leads.total) * 100
                    : 0
                }%`,
              }}
            />
          </div>
          <p className="mt-2 text-sm text-ink-muted">
            {stats?.leads.total
              ? Math.round((stats.leads.withEmail / stats.leads.total) * 100)
              : 0}
            % of leads have provided email
          </p>
        </div>

        <div className="rounded-md border border-surface-border bg-surface p-5">
          <h2 className="mb-3 text-sm font-medium text-ink">
            This Week
          </h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-ink-muted text-sm">New Leads</span>
              <span className="font-medium text-sm tabular-nums">{stats?.leads.last7Days || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-muted text-sm">Followers Welcomed</span>
              <span className="font-medium text-sm tabular-nums">
                {stats?.followers.last7Days || 0}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-muted text-sm">Leads with Phone</span>
              <span className="font-medium text-sm tabular-nums">{stats?.leads.withPhone || 0}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
