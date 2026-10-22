'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  Brain,
  ChatsCircle,
  ClockCountdown,
  CreditCard,
  Crown,
  CursorClick,
  DeviceMobile,
  Megaphone,
  ShieldCheck,
  UsersThree,
  WarningCircle,
} from '@phosphor-icons/react';
import { accountDisplayName, useAccount } from '@/components/AccountSelector';
import { InstagramAvatar } from '@/components/InstagramAvatar';
import { loadMindsetOverview } from '@/lib/mindsetData';
import { isDashboardReviewMode } from '@/lib/mindsetReview';
import {
  formatRelativeTimestamp,
  latestConversationMessage,
  mindsetStageLabel,
  mindsetStageTone,
  percentage,
} from '@/lib/mindsetPresentation';
import { MindsetConversation } from '@/lib/firebase';
import { cn } from '@/lib/utils';

export default function DashboardPage() {
  const { selectedAccount, accounts, isLoading: accountsLoading } = useAccount();
  const reviewMode = isDashboardReviewMode();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['mindset-overview', selectedAccount?.id],
    queryFn: () => loadMindsetOverview(selectedAccount!.id),
    enabled: Boolean(selectedAccount),
    refetchInterval: reviewMode ? false : 15_000,
  });

  if (accountsLoading) return <OverviewSkeleton />;
  if (accounts.length === 0 || !selectedAccount) return <NoAccountState />;

  const metrics = data?.metrics;
  const campaigns = data?.campaigns || [];
  const activeCampaigns = campaigns.filter((campaign) => campaign.status === 'test' || campaign.status === 'live');
  const platform = selectedAccount.platform || 'instagram';
  const channelName = platform === 'facebook' ? 'Facebook' : 'Instagram';
  const selectedAccountName = accountDisplayName(selectedAccount);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-emerald-700">{channelName} messaging operations</p>
            {reviewMode && (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-emerald-800">
                Local preview data
              </span>
            )}
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-slate-950 sm:text-4xl">Welcome back, Sondre.</h1>
          <p className="mt-2 text-sm text-slate-600">Here is how {selectedAccountName}&apos;s messaging funnel is moving.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/conversations" className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:border-slate-400">
            <ChatsCircle size={18} />
            Open inbox
          </Link>
          <Link href="/campaigns" className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800">
            <Megaphone size={18} weight="bold" />
            New campaign
          </Link>
        </div>
      </header>

      {isError && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span className="flex items-center gap-2"><WarningCircle size={18} weight="fill" />Live dashboard data could not be loaded.</span>
          <button type="button" onClick={() => refetch()} className="font-semibold underline underline-offset-4">Try again</button>
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <HeadlineMetric
          icon={UsersThree}
          label="People in funnel"
          value={isLoading ? '—' : metrics?.total || 0}
          detail={`${metrics?.last24Hours || 0} new in the last 24 hours`}
        />
        <HeadlineMetric
          icon={ChatsCircle}
          label="Active conversations"
          value={isLoading ? '—' : metrics?.active || 0}
          detail="Still moving toward the next step"
        />
        <HeadlineMetric
          icon={ClockCountdown}
          label="Needs your reply"
          value={isLoading ? '—' : metrics?.handoffs || 0}
          detail={metrics?.handoffs ? 'Human handoff waiting' : 'Nothing waiting'}
          attention={Boolean(metrics?.handoffs)}
        />
        <HeadlineMetric
          icon={Crown}
          label="Verified paid"
          value={isLoading ? '—' : metrics?.subscribed || 0}
          detail={`${metrics?.trials || 0} verified trials · ${metrics?.claimedSubscribed || 0} reported payments`}
        />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_22px_60px_-46px_rgba(15,23,42,0.4)] sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Conversion journey</p>
            <h2 className="mt-1 text-xl font-semibold tracking-[-0.025em] text-slate-950">From {channelName} comment to paid athlete</h2>
          </div>
          <p className="text-xs text-slate-500">Tracked links plus verified in-app events</p>
        </div>

        <div className="mt-6 grid gap-2 lg:grid-cols-6">
          <FunnelStep icon={UsersThree} label="Conversations" value={metrics?.total || 0} rate={100} loading={isLoading} first />
          <FunnelStep icon={CursorClick} label="Link clicks" value={metrics?.linkClicks || 0} rate={percentage(metrics?.linkClicks || 0, metrics?.total || 0)} loading={isLoading} />
          <FunnelStep icon={DeviceMobile} label="App opens" value={metrics?.appOpens || 0} rate={percentage(metrics?.appOpens || 0, metrics?.linkClicks || 0)} loading={isLoading} />
          <FunnelStep icon={Brain} label="First reps" value={metrics?.firstReps || 0} rate={percentage(metrics?.firstReps || 0, metrics?.appOpens || 0)} loading={isLoading} />
          <FunnelStep icon={CreditCard} label="Paywall views" value={metrics?.paywallViews || 0} rate={percentage(metrics?.paywallViews || 0, metrics?.firstReps || 0)} loading={isLoading} />
          <FunnelStep icon={Crown} label="Paid" value={metrics?.subscribed || 0} rate={percentage(metrics?.subscribed || 0, metrics?.paywallViews || 0)} loading={isLoading} last />
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.75fr)]">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 sm:px-6">
            <div>
              <h2 className="font-semibold text-slate-950">Recent conversations</h2>
              <p className="mt-0.5 text-xs text-slate-500">Updates automatically while this page is open</p>
            </div>
            <Link href="/conversations" className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700 hover:text-emerald-800">
              View all <ArrowRight size={16} weight="bold" />
            </Link>
          </div>
          {isLoading ? (
            <ConversationRowsSkeleton />
          ) : data?.recentConversations.length ? (
            <div className="divide-y divide-slate-100">
              {data.recentConversations.map((conversation) => (
                <RecentConversation key={conversation.id} conversation={conversation} platform={platform} />
              ))}
            </div>
          ) : (
            <div className="px-6 py-14 text-center">
              <ChatsCircle size={30} className="mx-auto text-slate-300" />
              <p className="mt-3 text-sm font-semibold text-slate-800">No conversations yet</p>
              <p className="mt-1 text-sm text-slate-500">Your first keyword comment will appear here.</p>
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <div className="flex items-center gap-2 text-emerald-900">
              <ShieldCheck size={20} weight="fill" />
              <h2 className="font-semibold">Channel test is isolated</h2>
            </div>
            <dl className="mt-4 space-y-3 text-sm">
              <StatusRow label="Account" value={selectedAccountName} />
              <StatusRow label="Active keyword" value={data?.runtime.systemKeyword || 'Not active'} mono />
              {platform === 'instagram' && (
                <StatusRow label="MINDSET" value={data?.runtime.manychatKeywordProtected ? 'Protected for ManyChat' : 'Available'} />
              )}
              <StatusRow label="Bot mode" value={data?.runtime.mode || 'Loading'} />
            </dl>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-950">Campaigns</h2>
              <span className="text-xs font-semibold text-slate-500">{activeCampaigns.length} active</span>
            </div>
            <div className="mt-4 space-y-3">
              {campaigns.slice(0, 3).map((campaign) => (
                <div key={campaign.id} className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{campaign.name}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-slate-500">{campaign.keyword}</p>
                  </div>
                  <CampaignStatus status={campaign.status} />
                </div>
              ))}
            </div>
            <Link href="/campaigns" className="mt-5 flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-800 transition hover:border-slate-400">
              Manage campaigns <ArrowRight size={16} weight="bold" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function HeadlineMetric({ icon: Icon, label, value, detail, attention = false }: {
  icon: typeof UsersThree;
  label: string;
  value: number | string;
  detail: string;
  attention?: boolean;
}) {
  return (
    <div className={cn('rounded-2xl border bg-white p-5', attention ? 'border-amber-200' : 'border-slate-200')}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-600">{label}</p>
        <span className={cn('grid h-9 w-9 place-items-center rounded-xl', attention ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-700')}>
          <Icon size={19} weight="bold" />
        </span>
      </div>
      <p className="mt-4 font-mono text-3xl font-semibold tracking-[-0.04em] text-slate-950">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function FunnelStep({ icon: Icon, label, value, rate, loading, first = false, last = false }: {
  icon: typeof UsersThree;
  label: string;
  value: number;
  rate: number;
  loading: boolean;
  first?: boolean;
  last?: boolean;
}) {
  return (
    <div className={cn('relative min-w-0 border-slate-200 px-3 py-3 lg:border-r', last && 'lg:border-r-0')}>
      {!first && <span className="absolute -left-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-white p-0.5 text-slate-300 lg:block"><ArrowRight size={14} weight="bold" /></span>}
      <div className="flex items-center gap-2 text-slate-500">
        <Icon size={17} />
        <span className="truncate text-xs font-semibold">{label}</span>
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <p className="font-mono text-2xl font-semibold text-slate-950">{loading ? '—' : value}</p>
        <span className="rounded-md bg-emerald-50 px-1.5 py-1 font-mono text-[10px] font-bold text-emerald-800">{loading ? '—' : `${rate}%`}</span>
      </div>
    </div>
  );
}

function RecentConversation({
  conversation,
  platform,
}: {
  conversation: MindsetConversation;
  platform: 'instagram' | 'facebook';
}) {
  const tone = mindsetStageTone(conversation.stage);
  const displayName = platform === 'facebook' ? conversation.username : `@${conversation.username}`;
  return (
    <Link href={`/conversations?conversation=${conversation.id}`} className="grid gap-3 px-5 py-4 transition hover:bg-slate-50 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <InstagramAvatar
          username={conversation.username}
          platform={platform}
          src={conversation.profilePictureUrl}
        />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-slate-950">{displayName}</p>
            <StageBadge label={mindsetStageLabel(conversation.stage)} tone={tone} />
          </div>
          <p className="mt-1 truncate text-sm text-slate-500">{latestConversationMessage(conversation)}</p>
        </div>
      </div>
      <p className="pl-[52px] text-xs font-medium text-slate-400 sm:pl-0">{formatRelativeTimestamp(conversation.updatedAt)}</p>
    </Link>
  );
}

function StageBadge({ label, tone }: { label: string; tone: ReturnType<typeof mindsetStageTone> }) {
  const tones = {
    active: 'bg-sky-50 text-sky-700',
    attention: 'bg-amber-50 text-amber-800',
    converted: 'bg-emerald-50 text-emerald-800',
    complete: 'bg-slate-100 text-slate-600',
  };
  return <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', tones[tone])}>{label}</span>;
}

function CampaignStatus({ status }: { status: string }) {
  const className = status === 'live' || status === 'test'
    ? 'bg-emerald-50 text-emerald-800'
    : status === 'draft'
      ? 'bg-amber-50 text-amber-800'
      : 'bg-slate-100 text-slate-600';
  return <span className={cn('rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide', className)}>{status}</span>;
}

function StatusRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-emerald-200/70 pb-3 last:border-0 last:pb-0">
      <dt className="text-emerald-900/65">{label}</dt>
      <dd className={cn('text-right font-semibold text-emerald-950', mono && 'font-mono text-xs')}>{value}</dd>
    </div>
  );
}

function NoAccountState() {
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white px-6 py-14 text-center">
      <Megaphone size={32} className="mx-auto text-slate-300" />
      <h1 className="mt-4 text-xl font-semibold text-slate-950">Connect a messaging channel</h1>
      <p className="mt-2 text-sm leading-6 text-slate-500">Connect Instagram or a Facebook Page before the dashboard can load conversations.</p>
      <Link href="/settings" className="mt-5 inline-flex h-10 items-center rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white">Open settings</Link>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-24 max-w-2xl rounded-2xl bg-slate-200" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => <div key={item} className="h-36 rounded-2xl bg-white" />)}
      </div>
      <div className="h-52 rounded-2xl bg-white" />
      <div className="h-80 rounded-2xl bg-white" />
    </div>
  );
}

function ConversationRowsSkeleton() {
  return (
    <div className="divide-y divide-slate-100">
      {[0, 1, 2, 3].map((item) => (
        <div key={item} className="flex animate-pulse items-center gap-3 px-6 py-4">
          <div className="h-10 w-10 rounded-full bg-slate-100" />
          <div className="flex-1 space-y-2"><div className="h-3 w-36 rounded bg-slate-100" /><div className="h-3 w-3/4 rounded bg-slate-100" /></div>
        </div>
      ))}
    </div>
  );
}
