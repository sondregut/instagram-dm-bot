'use client';

import { useQuery } from '@tanstack/react-query';
import { Users, MessageSquare, Zap, Activity } from 'lucide-react';
import { cloudFunctions, DashboardStats } from '@/lib/firebase';
import { StatsCard } from '@/components/StatsCard';

export default function DashboardPage() {
  const { data: stats, isLoading, error } = useQuery({
    queryKey: ['dashboardStats'],
    queryFn: async () => {
      const result = await cloudFunctions.getDashboardStats();
      return result.data;
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-instagram-pink border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-red-600">
        Failed to load dashboard stats. Please try again.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500">Monitor your Instagram DM automation</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
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
      <div className="mt-8">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          Leads by Source
        </h2>
        <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
          {stats?.leads.bySource && Object.keys(stats.leads.bySource).length > 0 ? (
            <div className="space-y-4">
              {Object.entries(stats.leads.bySource).map(([source, count]) => (
                <div key={source} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-3 w-3 rounded-full bg-instagram-pink" />
                    <span className="text-sm font-medium text-gray-700 capitalize">
                      {source.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-gray-900">
                    {count}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No leads collected yet</p>
          )}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Email Collection
          </h2>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold text-gray-900">
              {stats?.leads.withEmail || 0}
            </span>
            <span className="text-gray-500">
              / {stats?.leads.total || 0} leads
            </span>
          </div>
          <div className="mt-4 h-2 w-full rounded-full bg-gray-100">
            <div
              className="h-2 rounded-full bg-gradient-to-r from-instagram-pink to-instagram-purple"
              style={{
                width: `${
                  stats?.leads.total
                    ? (stats.leads.withEmail / stats.leads.total) * 100
                    : 0
                }%`,
              }}
            />
          </div>
          <p className="mt-2 text-sm text-gray-500">
            {stats?.leads.total
              ? Math.round((stats.leads.withEmail / stats.leads.total) * 100)
              : 0}
            % of leads have provided email
          </p>
        </div>

        <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            This Week
          </h2>
          <div className="space-y-4">
            <div className="flex justify-between">
              <span className="text-gray-600">New Leads</span>
              <span className="font-semibold">{stats?.leads.last7Days || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Followers Welcomed</span>
              <span className="font-semibold">
                {stats?.followers.last7Days || 0}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Leads with Phone</span>
              <span className="font-semibold">{stats?.leads.withPhone || 0}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
