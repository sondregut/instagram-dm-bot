'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Check,
  ChatsCircle,
  CursorClick,
  FileText,
  Flask,
  Images,
  Lightning,
  LockKey,
  Megaphone,
  PaperPlaneTilt,
  Pause,
  PencilSimple,
  Play,
  Plus,
  ShieldWarning,
  SpinnerGap,
  X,
} from '@phosphor-icons/react';
import { useAccount } from '@/components/AccountSelector';
import {
  InstagramPost,
  MindsetCampaign,
  MindsetCampaignStatus,
} from '@/lib/firebase';
import {
  loadInstagramPosts,
  loadMindsetCampaigns,
  saveMindsetCampaign,
} from '@/lib/mindsetData';
import { isDashboardReviewMode } from '@/lib/mindsetReview';
import {
  DEFAULT_MINDSET_PUBLIC_REPLY_TEXT,
  parseMindsetPublicReplyVariants,
} from '@/lib/mindsetPublicReplies';
import { formatRelativeTimestamp } from '@/lib/mindsetPresentation';
import { cn } from '@/lib/utils';

interface CampaignFormState {
  id?: string;
  name: string;
  keyword: string;
  postIds: string[];
  postMode: 'any' | 'specific';
  publicReplyEnabled: boolean;
  publicReplyText: string;
  currentStatus: MindsetCampaignStatus;
}

const emptyForm: CampaignFormState = {
  name: '',
  keyword: '',
  postIds: [],
  postMode: 'any',
  publicReplyEnabled: true,
  publicReplyText: DEFAULT_MINDSET_PUBLIC_REPLY_TEXT,
  currentStatus: 'draft',
};

export default function CampaignsPage() {
  const { selectedAccount, accounts, isLoading: accountsLoading } = useAccount();
  const queryClient = useQueryClient();
  const reviewMode = isDashboardReviewMode();
  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState<CampaignFormState>(emptyForm);
  const [confirmedSafeActivation, setConfirmedSafeActivation] = useState(false);
  const [saveError, setSaveError] = useState('');
  const editorAnchor = useRef<HTMLDivElement>(null);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['mindset-campaigns', selectedAccount?.id],
    queryFn: () => loadMindsetCampaigns(selectedAccount!.id),
    enabled: Boolean(selectedAccount),
  });
  const { data: posts = [], isLoading: postsLoading } = useQuery({
    queryKey: ['instagram-posts', selectedAccount?.id, reviewMode ? 'review' : 'live'],
    queryFn: () => loadInstagramPosts(selectedAccount!.id),
    enabled: Boolean(selectedAccount),
    staleTime: 5 * 60 * 1000,
  });
  const saveMutation = useMutation({
    mutationFn: (status: MindsetCampaignStatus) => {
      if (!selectedAccount) throw new Error('Instagram account is not connected.');
      return saveMindsetCampaign({
        id: form.id,
        accountId: selectedAccount.id,
        name: form.name,
        keyword: form.keyword,
        postIds: form.postMode === 'any' ? [] : form.postIds,
        status,
        publicReplyEnabled: form.publicReplyEnabled,
        publicReplyText: form.publicReplyText,
      });
    },
    onSuccess: async () => {
      setSaveError('');
      setEditorOpen(false);
      setForm(emptyForm);
      setConfirmedSafeActivation(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['mindset-campaigns', selectedAccount?.id] }),
        queryClient.invalidateQueries({ queryKey: ['mindset-overview', selectedAccount?.id] }),
      ]);
    },
    onError: (error) => {
      setSaveError(error instanceof Error ? error.message : 'Campaign could not be saved.');
    },
  });

  const keyword = form.keyword.trim().toUpperCase();
  const runtimeMode = data?.runtime.mode || 'off';
  const keywordValid = /^[A-Z0-9_-]{2,40}$/.test(keyword);
  const publicReplyVariants = parseMindsetPublicReplyVariants(form.publicReplyText);
  const formValid = form.name.trim().length >= 2 && keywordValid
    && (form.postMode === 'any' || form.postIds.length > 0)
    && (!form.publicReplyEnabled || (
      publicReplyVariants.length >= 1
      && publicReplyVariants.length <= 5
      && publicReplyVariants.every((reply) => reply.length >= 2 && reply.length <= 180)
    ));
  const canEnableTest = formValid
    && keyword !== 'MINDSET'
    && ['test', 'full'].includes(runtimeMode)
    && confirmedSafeActivation;
  const canGoLive = formValid
    && ['mindset', 'full'].includes(runtimeMode)
    && confirmedSafeActivation;

  useEffect(() => {
    if (!editorOpen || !window.matchMedia('(max-width: 1279px)').matches) return;
    window.requestAnimationFrame(() => {
      editorAnchor.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [editorOpen]);

  if (accountsLoading) return <CampaignsSkeleton />;
  if (accounts.length === 0 || !selectedAccount) return <NoAccountState />;

  const campaigns = data?.campaigns || [];

  const openNewCampaign = () => {
    setForm(emptyForm);
    setSaveError('');
    setConfirmedSafeActivation(false);
    setEditorOpen(true);
  };

  const openCampaign = (campaign: MindsetCampaign) => {
    if (campaign.isSystem) return;
    setForm({
      id: campaign.id,
      name: campaign.name,
      keyword: campaign.keyword,
      postIds: campaign.postIds,
      postMode: campaign.postIds.length ? 'specific' : 'any',
      publicReplyEnabled: campaign.publicReplyEnabled,
      publicReplyText: campaign.publicReplyText,
      currentStatus: campaign.status,
    });
    setSaveError('');
    setConfirmedSafeActivation(false);
    setEditorOpen(true);
  };

  const pauseCampaign = async (campaign: MindsetCampaign) => {
    if (!selectedAccount || campaign.isSystem) return;
    setSaveError('');
    try {
      await saveMindsetCampaign({
        id: campaign.id,
        accountId: selectedAccount.id,
        name: campaign.name,
        keyword: campaign.keyword,
        postIds: campaign.postIds,
        status: 'paused',
        publicReplyEnabled: campaign.publicReplyEnabled,
        publicReplyText: campaign.publicReplyText,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['mindset-campaigns', selectedAccount.id] }),
        queryClient.invalidateQueries({ queryKey: ['mindset-overview', selectedAccount.id] }),
      ]);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Campaign could not be paused.');
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-emerald-700">Comment-to-DM setup</p>
            {reviewMode && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-800">Local preview</span>}
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-slate-950">Campaigns</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Choose the comment keyword and posts. Every campaign uses the same tested download, activation, follow-up, and conversion sequence.</p>
        </div>
        <button type="button" onClick={openNewCampaign} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800">
          <Plus size={17} weight="bold" />
          New campaign
        </button>
      </header>

      {isError && (
        <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Campaigns could not be loaded.
          <button type="button" onClick={() => refetch()} className="font-semibold">Try again</button>
        </div>
      )}
      {saveError && !editorOpen && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{saveError}</div>}

      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 sm:p-6">
        <div className="grid gap-5 lg:grid-cols-[0.8fr_1.8fr] lg:items-center">
          <div>
            <div className="flex items-center gap-2 text-emerald-900">
              <LockKey size={19} weight="fill" />
              <h2 className="font-semibold">The conversation logic stays protected</h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-emerald-900/70">Campaign setup changes where the journey starts, not how the bot responds.</p>
          </div>
          <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr] items-center gap-2 overflow-x-auto pb-1">
            <FlowNode icon={Megaphone} label="Keyword comment" />
            <ArrowRight size={15} className="text-emerald-400" />
            <FlowNode icon={ChatsCircle} label="Public reply" />
            <ArrowRight size={15} className="text-emerald-400" />
            <FlowNode icon={PaperPlaneTilt} label="Private reply" />
            <ArrowRight size={15} className="text-emerald-400" />
            <FlowNode icon={CursorClick} label="Tracked app link" />
            <ArrowRight size={15} className="text-emerald-400" />
            <FlowNode icon={ChatsCircle} label="Follow-up conversation" />
          </div>
        </div>
      </section>

      <section className={cn('grid gap-5', editorOpen && 'xl:grid-cols-[minmax(0,1fr)_460px]')}>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 sm:px-6">
            <div>
              <h2 className="font-semibold text-slate-950">@{selectedAccount.username} campaigns</h2>
              <p className="mt-0.5 text-xs text-slate-500">{campaigns.length} configured campaign{campaigns.length === 1 ? '' : 's'}</p>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-600">Mode: {runtimeMode}</span>
          </div>

          {isLoading ? (
            <CampaignListSkeleton />
          ) : campaigns.length ? (
            <div className="divide-y divide-slate-100">
              {campaigns.map((campaign) => (
                <CampaignRow
                  key={campaign.id}
                  campaign={campaign}
                  posts={posts}
                  onEdit={() => openCampaign(campaign)}
                  onPause={() => pauseCampaign(campaign)}
                />
              ))}
            </div>
          ) : (
            <div className="px-6 py-16 text-center">
              <FileText size={32} className="mx-auto text-slate-300" />
              <p className="mt-3 font-semibold text-slate-900">No campaigns configured</p>
              <button type="button" onClick={openNewCampaign} className="mt-4 text-sm font-semibold text-emerald-700">Create the first campaign</button>
            </div>
          )}
        </div>

        {editorOpen && (
          <div
            ref={editorAnchor}
            className="order-first scroll-mt-4 xl:sticky xl:top-6 xl:order-none xl:max-h-[calc(100dvh-3rem)] xl:overflow-y-auto xl:overscroll-contain"
          >
            <CampaignEditor
              form={form}
              setForm={setForm}
              posts={posts}
              postsLoading={postsLoading}
              runtimeMode={runtimeMode}
              reviewMode={reviewMode}
              formValid={formValid}
              keywordValid={keywordValid}
              canEnableTest={canEnableTest}
              canGoLive={canGoLive}
              confirmedSafeActivation={confirmedSafeActivation}
              setConfirmedSafeActivation={setConfirmedSafeActivation}
              saveError={saveError}
              saving={saveMutation.isPending}
              onSave={(status) => {
                setSaveError('');
                saveMutation.mutate(status);
              }}
              onClose={() => {
                setEditorOpen(false);
                setSaveError('');
              }}
            />
          </div>
        )}
      </section>
    </div>
  );
}

function CampaignEditor({
  form,
  setForm,
  posts,
  postsLoading,
  runtimeMode,
  reviewMode,
  formValid,
  keywordValid,
  canEnableTest,
  canGoLive,
  confirmedSafeActivation,
  setConfirmedSafeActivation,
  saveError,
  saving,
  onSave,
  onClose,
}: {
  form: CampaignFormState;
  setForm: React.Dispatch<React.SetStateAction<CampaignFormState>>;
  posts: InstagramPost[];
  postsLoading: boolean;
  runtimeMode: string;
  reviewMode: boolean;
  formValid: boolean;
  keywordValid: boolean;
  canEnableTest: boolean;
  canGoLive: boolean;
  confirmedSafeActivation: boolean;
  setConfirmedSafeActivation: (value: boolean) => void;
  saveError: string;
  saving: boolean;
  onSave: (status: MindsetCampaignStatus) => void;
  onClose: () => void;
}) {
  const keyword = form.keyword.trim().toUpperCase();
  const publicReplyVariants = parseMindsetPublicReplyVariants(form.publicReplyText);
  const testBlockedByKeyword = keyword === 'MINDSET';
  const productionMode = ['mindset', 'full'].includes(runtimeMode);

  return (
    <aside className="h-fit rounded-2xl border border-slate-200 bg-white shadow-[0_24px_70px_-52px_rgba(15,23,42,0.5)]">
      <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">{form.id ? 'Edit campaign' : 'New campaign'}</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-950">Configure the trigger</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Close campaign editor" className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"><X size={18} /></button>
      </div>

      <div className="space-y-6 p-5">
        {reviewMode && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-xs leading-5 text-emerald-900">
            Preview only. Saving here changes local sample data and cannot send an Instagram DM.
          </div>
        )}

        <label className="block">
          <span className="text-sm font-semibold text-slate-800">Campaign name</span>
          <input
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            placeholder="Example: Pole vault reel — August"
            className="mt-2 h-11 w-full rounded-xl border border-slate-300 px-3.5 text-sm outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
          />
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-slate-800">Comment keyword</span>
          <input
            value={form.keyword}
            onChange={(event) => {
              setForm((current) => ({ ...current, keyword: event.target.value.toUpperCase() }));
              setConfirmedSafeActivation(false);
            }}
            placeholder="Example: FOCUS"
            className={cn(
              'mt-2 h-11 w-full rounded-xl border px-3.5 font-mono text-sm font-semibold uppercase outline-none transition focus:ring-2',
              form.keyword && !keywordValid
                ? 'border-red-300 focus:border-red-500 focus:ring-red-100'
                : 'border-slate-300 focus:border-emerald-600 focus:ring-emerald-100'
            )}
          />
          <p className="mt-2 text-xs leading-5 text-slate-500">Letters, numbers, hyphens, or underscores. Matching is case-insensitive.</p>
        </label>

        <fieldset>
          <legend className="text-sm font-semibold text-slate-800">Trigger on</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <ModeButton
              selected={form.postMode === 'any'}
              icon={Lightning}
              label="Any post"
              detail="Current and future"
              onClick={() => setForm((current) => ({ ...current, postMode: 'any', postIds: [] }))}
            />
            <ModeButton
              selected={form.postMode === 'specific'}
              icon={Images}
              label="Specific posts"
              detail="Choose below"
              onClick={() => setForm((current) => ({ ...current, postMode: 'specific' }))}
            />
          </div>

          {form.postMode === 'specific' && (
            <PostGrid
              posts={posts}
              selectedPostIds={form.postIds}
              loading={postsLoading}
              onToggle={(postId) => setForm((current) => ({
                ...current,
                postIds: current.postIds.includes(postId)
                  ? current.postIds.filter((id) => id !== postId)
                  : [...current.postIds, postId],
              }))}
            />
          )}
        </fieldset>

        <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Reply publicly on the post</h3>
              <p className="mt-1 text-xs leading-5 text-slate-500">This is separate from the private DM and is sent only after the DM succeeds.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={form.publicReplyEnabled}
              onClick={() => setForm((current) => ({ ...current, publicReplyEnabled: !current.publicReplyEnabled }))}
              className={cn(
                'relative h-6 w-11 flex-shrink-0 rounded-full transition active:scale-[0.98]',
                form.publicReplyEnabled ? 'bg-emerald-700' : 'bg-slate-300'
              )}
            >
              <span className={cn(
                'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform',
                form.publicReplyEnabled ? 'translate-x-5' : 'translate-x-0.5'
              )} />
              <span className="sr-only">Toggle public comment reply</span>
            </button>
          </div>

          {form.publicReplyEnabled && (
            <div className="mt-4 space-y-3">
              <label htmlFor="public-comment-reply" className="block">
                <span className="text-xs font-semibold text-slate-700">Public comment replies</span>
                <textarea
                  id="public-comment-reply"
                  value={form.publicReplyText}
                  onChange={(event) => setForm((current) => ({ ...current, publicReplyText: event.target.value }))}
                  rows={5}
                  maxLength={904}
                  className="mt-2 w-full resize-none rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm leading-5 text-slate-900 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                />
              </label>
              <div className="flex items-center justify-between gap-3 text-[11px] text-slate-500">
                <span>Add one reply per line. The bot rotates between up to five.</span>
                <span className="font-mono">{publicReplyVariants.length}/5 replies</span>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Post comment preview</p>
                <div className="mt-3 space-y-2 text-xs">
                  <p><span className="font-semibold text-slate-900">@athlete</span> <span className="text-slate-600">{keyword || 'KEYWORD'}</span></p>
                  <p className="border-l-2 border-emerald-500 pl-3"><span className="font-semibold text-slate-900">@sondre_pv</span> <span className="text-slate-600">{publicReplyVariants[0] || 'Your public reply appears here.'}</span></p>
                  {publicReplyVariants.length > 1 && <p className="pl-3 text-[11px] text-emerald-700">Rotates between {publicReplyVariants.length} replies</p>}
                </div>
              </div>
            </div>
          )}
        </section>

        {testBlockedByKeyword && (
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs leading-5 text-amber-900">
            <ShieldWarning size={18} weight="fill" className="mt-0.5 flex-shrink-0" />
            <p><strong>MINDSET can be saved as a draft only.</strong> ManyChat still owns that keyword. It cannot be activated here until ManyChat is off and production mode is deliberately enabled.</p>
          </div>
        )}

        {(formValid && !testBlockedByKeyword) && (
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3">
            <input
              type="checkbox"
              checked={confirmedSafeActivation}
              onChange={(event) => setConfirmedSafeActivation(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
            />
            <span className="text-xs leading-5 text-slate-600">
              {productionMode
                ? 'I confirmed the old automation is off and this keyword should run on the selected posts.'
                : 'I confirmed this is a private test keyword and does not overlap with the live ManyChat automation.'}
            </span>
          </label>
        )}

        {saveError && <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-3 text-xs leading-5 text-red-800">{saveError}</p>}

        <div className="flex flex-col gap-2 border-t border-slate-200 pt-5 sm:flex-row">
          <button
            type="button"
            onClick={() => onSave('draft')}
            disabled={!formValid || saving}
            className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-800 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <SpinnerGap size={17} className="animate-spin" /> : <FileText size={17} />}
            Save draft
          </button>
          {productionMode ? (
            <button
              type="button"
              onClick={() => onSave('live')}
              disabled={!canGoLive || saving}
              className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-950 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Play size={17} weight="fill" />
              Go live
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onSave('test')}
              disabled={!canEnableTest || saving}
              className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-950 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Flask size={17} weight="fill" />
              Enable test
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}

function CampaignRow({ campaign, posts, onEdit, onPause }: { campaign: MindsetCampaign; posts: InstagramPost[]; onEdit: () => void; onPause: () => void }) {
  const active = campaign.status === 'test' || campaign.status === 'live';
  const publicReplyCount = parseMindsetPublicReplyVariants(campaign.publicReplyText).length;
  const previewPost = campaign.postIds
    .map((postId) => posts.find((post) => post.id === postId))
    .find((post): post is InstagramPost => Boolean(post));
  const previewImage = previewPost?.thumbnailUrl || previewPost?.mediaUrl;
  return (
    <div className="grid gap-4 px-5 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6">
      <div className="flex min-w-0 gap-3.5">
        <span
          className={cn(
            'relative grid h-11 w-11 flex-shrink-0 place-items-center overflow-hidden rounded-xl bg-cover bg-center',
            campaign.isSystem ? 'bg-slate-950 text-emerald-300' : active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
          )}
          style={previewImage ? { backgroundImage: `url(${previewImage})` } : undefined}
        >
          {previewImage && <span className="absolute inset-0 bg-slate-950/35" />}
          <span className="relative">
            {campaign.isSystem ? <LockKey size={20} weight="fill" /> : <Megaphone size={20} weight={active ? 'fill' : 'regular'} />}
          </span>
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-semibold text-slate-950">{campaign.name}</h3>
            <CampaignStatus status={campaign.status} />
            {campaign.isSystem && <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">Protected</span>}
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            Comment <span className="font-mono font-bold text-slate-800">{campaign.keyword}</span>
            <span className="mx-2 text-slate-300">•</span>
            {campaign.postIds.length ? `${campaign.postIds.length} selected post${campaign.postIds.length === 1 ? '' : 's'}` : 'Any current or future post'}
          </p>
          <p className="mt-1 line-clamp-1 text-[11px] text-slate-500">
            {campaign.publicReplyEnabled
              ? publicReplyCount > 1
                ? `Public reply rotates between ${publicReplyCount} responses`
                : `Public reply: “${campaign.publicReplyText}”`
              : 'No public comment reply — private DM only'}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">{campaign.updatedAt ? `Updated ${formatRelativeTimestamp(campaign.updatedAt)}` : 'Controlled by the bot runtime'}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 pl-[58px] sm:pl-0">
        {campaign.isSystem ? (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />Test running</span>
        ) : (
          <>
            {active && (
              <button type="button" onClick={onPause} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-400">
                <Pause size={15} weight="fill" />Pause
              </button>
            )}
            <button type="button" onClick={onEdit} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-400">
              <PencilSimple size={15} />Edit
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function ModeButton({ selected, icon: Icon, label, detail, onClick }: { selected: boolean; icon: typeof Lightning; label: string; detail: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn('flex items-center gap-2.5 rounded-xl border px-3 py-3 text-left transition', selected ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-slate-300')}>
      <span className={cn('grid h-8 w-8 place-items-center rounded-lg', selected ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-500')}><Icon size={16} weight={selected ? 'fill' : 'regular'} /></span>
      <span><span className="block text-xs font-semibold text-slate-900">{label}</span><span className="mt-0.5 block text-[10px] text-slate-500">{detail}</span></span>
    </button>
  );
}

function PostGrid({ posts, selectedPostIds, loading, onToggle }: { posts: InstagramPost[]; selectedPostIds: string[]; loading: boolean; onToggle: (postId: string) => void }) {
  const [showAllPosts, setShowAllPosts] = useState(false);
  if (loading) return <div className="mt-3 grid grid-cols-2 gap-2">{[0, 1, 2, 3].map((item) => <div key={item} className="h-28 animate-pulse rounded-xl bg-slate-100" />)}</div>;
  if (!posts.length) return <div className="mt-3 rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-xs text-slate-500">No recent Instagram posts were returned.</div>;

  const visiblePosts = showAllPosts ? posts : posts.slice(0, 8);
  const selectedPosts = selectedPostIds
    .map((postId) => posts.find((post) => post.id === postId))
    .filter((post): post is InstagramPost => Boolean(post));

  return (
    <div className="mt-3 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">{selectedPostIds.length} of {posts.length} selected</p>
        {selectedPostIds.length > 0 && (
          <button
            type="button"
            onClick={() => selectedPostIds.forEach(onToggle)}
            className="text-xs font-semibold text-slate-600 hover:text-slate-950"
          >
            Clear selection
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {visiblePosts.map((post, index) => {
          const selected = selectedPostIds.includes(post.id);
          const imageUrl = post.thumbnailUrl || post.mediaUrl;
          return (
            <button
              key={post.id}
              type="button"
              onClick={() => onToggle(post.id)}
              aria-pressed={selected}
              aria-label={`${selected ? 'Remove' : 'Add'} ${post.caption || `Instagram post ${index + 1}`}`}
              className={cn('group relative aspect-[4/3] overflow-hidden rounded-xl border p-3 text-left transition active:scale-[0.98]', selected ? 'border-emerald-500 ring-2 ring-emerald-100' : 'border-slate-200 hover:border-slate-400')}
              style={imageUrl ? { backgroundImage: `url(${imageUrl})`, backgroundPosition: 'center', backgroundSize: 'cover' } : undefined}
            >
              <span className={cn('absolute inset-0 transition', imageUrl ? 'bg-gradient-to-t from-slate-950/90 via-slate-950/35 to-slate-950/10' : 'bg-slate-100')} />
              <span className={cn('relative z-10 line-clamp-3 text-[11px] font-semibold leading-4', imageUrl ? 'text-white' : 'text-slate-700')}>{post.caption || `Instagram post ${index + 1}`}</span>
              <span className={cn('absolute bottom-2 left-2 z-10 rounded-md px-1.5 py-1 text-[9px] font-bold uppercase tracking-wide', imageUrl ? 'bg-slate-950/65 text-white' : 'bg-white text-slate-500')}>{post.mediaType.replace('_', ' ')}</span>
              <span className={cn('absolute bottom-2 right-2 z-10 grid h-6 w-6 place-items-center rounded-full border transition', selected ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-white/70 bg-white text-transparent')}><Check size={14} weight="bold" /></span>
            </button>
          );
        })}
      </div>

      {posts.length > 8 && (
        <button
          type="button"
          onClick={() => setShowAllPosts((current) => !current)}
          className="w-full rounded-lg border border-slate-200 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-950"
        >
          {showAllPosts ? 'Show fewer posts' : `Show all ${posts.length} posts`}
        </button>
      )}

      {selectedPosts.length > 0 && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-800">Selected post preview</p>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {selectedPosts.map((post) => {
              const imageUrl = post.thumbnailUrl || post.mediaUrl;
              return (
                <div key={post.id} className="w-24 flex-shrink-0">
                  <div
                    className="aspect-square rounded-lg border border-emerald-200 bg-white bg-cover bg-center"
                    style={imageUrl ? { backgroundImage: `url(${imageUrl})` } : undefined}
                  />
                  <p className="mt-1 line-clamp-2 text-[9px] leading-3 text-emerald-950/70">{post.caption || 'Instagram post'}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function FlowNode({ icon: Icon, label }: { icon: typeof Megaphone; label: string }) {
  return <div className="flex min-w-[112px] items-center gap-2 rounded-xl border border-emerald-200 bg-white/70 px-3 py-2.5"><Icon size={17} className="flex-shrink-0 text-emerald-700" /><span className="text-xs font-semibold text-emerald-950">{label}</span></div>;
}

function CampaignStatus({ status }: { status: MindsetCampaignStatus }) {
  const className = status === 'live' || status === 'test' ? 'bg-emerald-100 text-emerald-800' : status === 'draft' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600';
  return <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]', className)}>{status}</span>;
}

function CampaignsSkeleton() {
  return <div className="space-y-5 animate-pulse"><div className="h-24 max-w-2xl rounded-2xl bg-slate-200" /><div className="h-32 rounded-2xl bg-emerald-50" /><div className="h-96 rounded-2xl bg-white" /></div>;
}

function CampaignListSkeleton() {
  return <div>{[0, 1, 2].map((item) => <div key={item} className="flex animate-pulse gap-3 border-b border-slate-100 p-6"><div className="h-11 w-11 rounded-xl bg-slate-100" /><div className="flex-1 space-y-2"><div className="h-3 w-48 rounded bg-slate-100" /><div className="h-3 w-72 rounded bg-slate-100" /></div></div>)}</div>;
}

function NoAccountState() {
  return <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center"><Megaphone size={32} className="mx-auto text-slate-300" /><p className="mt-3 font-semibold text-slate-900">Connect @sondre_pv before creating campaigns.</p></div>;
}
