'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  Brain,
  CheckCircle,
  CloudArrowUp,
  Code,
  Fingerprint,
  FacebookLogo,
  InstagramLogo,
  LinkSimple,
  LockKey,
  Robot,
  ShieldCheck,
  UserCircle,
  Warning,
} from '@phosphor-icons/react';
import { useAccount } from '@/components/AccountSelector';
import { useAuth } from '@/hooks/useAuth';
import { loadMindsetOverview } from '@/lib/mindsetData';
import { cloudFunctions } from '@/lib/firebase';
import { isDashboardReviewMode } from '@/lib/mindsetReview';
import { cn } from '@/lib/utils';

export default function SettingsPage() {
  const { selectedAccount, accounts, isLoading: accountsLoading } = useAccount();
  const { user } = useAuth();
  const reviewMode = isDashboardReviewMode();
  const facebookSelected = selectedAccount?.platform === 'facebook';
  const [connectingInstagram, setConnectingInstagram] = useState(false);
  const [instagramConnectError, setInstagramConnectError] = useState<string | null>(null);
  const [instagramConnectNotice, setInstagramConnectNotice] = useState<string | null>(null);
  const [connectingFacebook, setConnectingFacebook] = useState(false);
  const [facebookConnectError, setFacebookConnectError] = useState<string | null>(null);
  const [facebookConnectNotice, setFacebookConnectNotice] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['mindset-overview', selectedAccount?.id],
    queryFn: () => loadMindsetOverview(selectedAccount!.id),
    enabled: Boolean(selectedAccount),
  });

  const connectInstagram = async () => {
    if (reviewMode || connectingInstagram) return;
    setConnectingInstagram(true);
    setInstagramConnectError(null);
    try {
      const result = await cloudFunctions.getInstagramOAuthUrl({ redirectUrl: '/settings' });
      window.location.assign(result.data.url);
    } catch (error) {
      console.error('Failed to start Instagram connection:', error);
      setInstagramConnectError('Instagram connection is not configured on the backend yet.');
      setConnectingInstagram(false);
    }
  };

  const connectFacebook = async () => {
    if (reviewMode || connectingFacebook) return;
    setConnectingFacebook(true);
    setFacebookConnectError(null);
    try {
      const result = await cloudFunctions.getFacebookOAuthUrl({ redirectUrl: '/settings' });
      window.location.assign(result.data.url);
    } catch (error) {
      console.error('Failed to start Facebook Page connection:', error);
      setFacebookConnectError('Facebook connection is not configured on the backend yet.');
      setConnectingFacebook(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'true') {
      const subscribed = params.get('subscribed') === '1';
      setInstagramConnectNotice(
        subscribed
          ? 'Instagram account connected and subscribed to DM and comment events.'
          : 'Instagram account saved, but its webhook subscription is pending. Reconnect before enabling automation.'
      );
    }
    if (params.get('error')) {
      setInstagramConnectError('Instagram could not connect the account. Check account access and try again.');
    }
    if (params.get('facebook_success') === 'true') {
      const pages = Number(params.get('pages') || 0);
      const subscribed = Number(params.get('subscribed') || 0);
      setFacebookConnectNotice(
        pages > 0 && subscribed === pages
          ? `${pages} Facebook Page${pages === 1 ? '' : 's'} connected in test mode.`
          : `${pages} Facebook Page${pages === 1 ? '' : 's'} saved. Reconnect if a Page shows “webhook pending.”`
      );
    }
    if (params.get('facebook_error')) {
      setFacebookConnectError('Facebook could not connect the Page. Check Page access and try again.');
    }
  }, []);

  if (accountsLoading) return <div className="h-[600px] animate-pulse rounded-2xl bg-white" />;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold text-emerald-700">Workspace control</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-slate-950">Settings</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">The important safety, account, AI, and tracking configuration for the Athlete Mindset DM bot.</p>
      </header>

      {reviewMode && (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <Code size={19} weight="bold" className="mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold">You are reviewing the local dashboard build.</p>
            <p className="mt-0.5 text-xs leading-5 text-emerald-800">These screens use sample data and have not replaced the live Vercel dashboard.</p>
          </div>
        </div>
      )}

      <section className="grid gap-5 xl:grid-cols-2">
        <SettingsCard icon={InstagramLogo} title="Connected channels" description="Instagram and Facebook stay isolated while sharing the tested app-download journey.">
          {accounts.length ? (
            <div className="space-y-3">
              {accounts.map((account) => {
                const facebook = account.platform === 'facebook';
                return (
                  <div key={account.id} className="flex items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <span className="grid h-11 w-11 place-items-center rounded-full bg-slate-950 text-white">
                      {facebook
                        ? <FacebookLogo size={22} weight="fill" />
                        : <InstagramLogo size={22} weight="bold" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-slate-950">
                        {facebook ? account.pageName || account.username : `@${account.username}`}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {facebook
                          ? `Facebook Page · ${account.automationMode || 'test'} mode`
                          : 'Instagram professional account'}
                      </p>
                    </div>
                    <StatusPill
                      good={account.connectionStatus === 'connected' && account.webhookSubscribed !== false}
                      label={account.webhookSubscribed === false ? 'webhook pending' : account.connectionStatus}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">No messaging channel is connected.</div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={connectInstagram}
              disabled={reviewMode || connectingInstagram}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <InstagramLogo size={17} weight="bold" />
              {connectingInstagram ? 'Opening Instagram…' : 'Connect Instagram'}
            </button>
            <button
              type="button"
              onClick={connectFacebook}
              disabled={reviewMode || connectingFacebook}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#1877F2] px-4 text-sm font-semibold text-white transition hover:bg-[#1468d4] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FacebookLogo size={17} weight="fill" />
              {connectingFacebook ? 'Opening Facebook…' : 'Connect Facebook Page'}
            </button>
          </div>
          {instagramConnectError && <p className="mt-3 text-xs font-medium text-red-700">{instagramConnectError}</p>}
          {instagramConnectNotice && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">{instagramConnectNotice}</p>}
          {facebookConnectError && <p className="mt-3 text-xs font-medium text-red-700">{facebookConnectError}</p>}
          {facebookConnectNotice && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">{facebookConnectNotice}</p>}
          <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-slate-500"><LockKey size={15} className="mt-0.5 flex-shrink-0" />Each channel gets its own account ID, Page or Instagram token, campaigns, contacts, and conversation history.</p>
        </SettingsCard>

        <SettingsCard
          icon={ShieldCheck}
          title="Automation safety"
          description={facebookSelected
            ? 'Facebook starts with an isolated private test keyword before any production activation.'
            : 'The boundary that prevents overlap with the live ManyChat flow.'}
        >
          <dl className="space-y-3 text-sm">
            <SettingsRow label="Bot mode" value={isLoading ? 'Loading' : data?.runtime.mode || 'Off'} mono />
            <SettingsRow label="Custom-bot keyword" value={data?.runtime.systemKeyword || 'None'} mono />
            <SettingsRow
              label="MINDSET keyword"
              value={facebookSelected
                ? 'Not used during Facebook testing'
                : data?.runtime.manychatKeywordProtected ? 'Protected for ManyChat' : 'Available'}
            />
            <SettingsRow label="Legacy generic flows" value="Not used by this funnel" />
          </dl>
          <Link href="/campaigns" className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-800 transition hover:border-slate-400">Manage campaign triggers <ArrowRight size={16} weight="bold" /></Link>
        </SettingsCard>

        <SettingsCard icon={Brain} title="AI conversation behavior" description="What happens when an athlete writes a free-text reply.">
          <div className="space-y-3">
            <BehaviorRow icon={Robot} title="Open replies stay on topic" detail="Unusual messages use the current funnel stage and recent conversation context." />
            <BehaviorRow icon={ShieldCheck} title="Rules handle critical stages first" detail="Downloads, first reps, pricing, trials, and paid confirmations stay deterministic." />
            <BehaviorRow icon={ShieldCheck} title="Two-message silence limit" detail="After two unanswered follow-ups, the bot waits until the athlete replies." />
            <BehaviorRow icon={UserCircle} title="Sensitive messages stop silently" detail="Billing, refunds, safety, and requests for a person create a handoff without an automated reply." />
          </div>
          <p className="mt-4 rounded-xl bg-slate-50 px-3.5 py-3 text-xs leading-5 text-slate-600">The AI cannot quote a price from memory, ask whether someone subscribed, use em dashes, request payment details, invent features, or continue selling after a verified conversion.</p>
        </SettingsCard>

        <SettingsCard icon={LinkSimple} title="Conversion tracking" description="How the dashboard knows whether a conversation led to app use and payment.">
          <div className="space-y-3">
            <ChecklistRow label="Tracked campaign download redirect" complete />
            <ChecklistRow label="App-open and first-rep milestones" complete />
            <ChecklistRow label="Paywall-view milestone" complete />
            <ChecklistRow label="RevenueCat trial and subscription verification endpoint" complete />
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-500">A link click is not treated as a download, and a user&apos;s message is not treated as a verified payment. In this local review, the updated app and RevenueCat bridge are implementation-ready but not newly deployed.</p>
        </SettingsCard>

        <SettingsCard icon={Fingerprint} title="Dashboard access" description="This is separate from your Instagram login.">
          <dl className="space-y-3 text-sm">
            <SettingsRow label="Authentication" value="Firebase email and password" />
            <SettingsRow label="Signed-in email" value={reviewMode ? 'Hidden in local preview' : user?.email || 'Not available'} />
            <SettingsRow label="Workspace role" value="Owner" />
          </dl>
          <p className="mt-4 text-xs leading-5 text-slate-500">Use “Forgot your password?” on the login screen if you do not remember the private dashboard password. Never enter your Instagram password here.</p>
        </SettingsCard>

        <SettingsCard icon={CloudArrowUp} title="Deployment boundary" description="What is local versus available on the hosted dashboard.">
          <div className={cn('flex items-start gap-3 rounded-xl border p-4', reviewMode ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50')}>
            {reviewMode ? <Warning size={20} weight="fill" className="mt-0.5 text-amber-700" /> : <CheckCircle size={20} weight="fill" className="mt-0.5 text-emerald-700" />}
            <div>
              <p className={cn('text-sm font-semibold', reviewMode ? 'text-amber-900' : 'text-emerald-900')}>{reviewMode ? 'New dashboard is local only' : 'Hosted dashboard is active'}</p>
              <p className={cn('mt-1 text-xs leading-5', reviewMode ? 'text-amber-800' : 'text-emerald-800')}>{reviewMode ? 'Review and approve it before any Vercel or Firebase deployment.' : 'Changes on this version are connected to the bot backend.'}</p>
            </div>
          </div>
        </SettingsCard>
      </section>
    </div>
  );
}

function SettingsCard({ icon: Icon, title, description, children }: { icon: typeof InstagramLogo; title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700"><Icon size={19} weight="bold" /></span>
        <div><h2 className="font-semibold text-slate-950">{title}</h2><p className="mt-1 text-xs leading-5 text-slate-500">{description}</p></div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function SettingsRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3 last:border-0 last:pb-0"><dt className="text-slate-500">{label}</dt><dd className={cn('max-w-[60%] text-right font-semibold text-slate-900', mono && 'font-mono text-xs')}>{value}</dd></div>;
}

function BehaviorRow({ icon: Icon, title, detail }: { icon: typeof Robot; title: string; detail: string }) {
  return <div className="flex gap-3"><span className="mt-0.5 grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700"><Icon size={15} weight="bold" /></span><div><p className="text-sm font-semibold text-slate-900">{title}</p><p className="mt-0.5 text-xs leading-5 text-slate-500">{detail}</p></div></div>;
}

function ChecklistRow({ label, complete }: { label: string; complete: boolean }) {
  return <div className="flex items-center gap-2.5 text-sm text-slate-700">{complete ? <CheckCircle size={18} weight="fill" className="text-emerald-600" /> : <Warning size={18} className="text-amber-600" />}<span>{label}</span></div>;
}

function StatusPill({ good, label }: { good: boolean; label: string }) {
  return <span className={cn('rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em]', good ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800')}>{label}</span>;
}
