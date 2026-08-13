'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  ArrowSquareOut,
  CalendarPlus,
  CaretRight,
  Check,
  ChatsCircle,
  ClockCountdown,
  CursorClick,
  FileText,
  Flask,
  Images,
  Lightning,
  LinkSimple,
  LockKey,
  Megaphone,
  PaperPlaneTilt,
  Pause,
  PencilSimple,
  Play,
  Plus,
  ShieldCheck,
  ShieldWarning,
  SpinnerGap,
  Trash,
  X,
} from '@phosphor-icons/react';
import { useAccount } from '@/components/AccountSelector';
import {
  InstagramPost,
  MindsetCampaign,
  MindsetCampaignFollowUpKey,
  MindsetCampaignJourney,
  MindsetCampaignPostMode,
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
import {
  DEFAULT_MINDSET_CAMPAIGN_JOURNEY,
  formatMindsetDelay,
  MINDSET_FOLLOW_UP_KEYS,
  normalizeMindsetCampaignJourney,
  validateMindsetCampaignJourney,
} from '@/lib/mindsetJourney';
import { cn } from '@/lib/utils';

interface CampaignFormState {
  id?: string;
  name: string;
  keyword: string;
  postIds: string[];
  postMode: MindsetCampaignPostMode;
  nextPostId: string | null;
  nextPostActivatedAt: string | null;
  nextPostResolvedAt: string | null;
  publicReplyEnabled: boolean;
  publicReplyText: string;
  journey: MindsetCampaignJourney;
  currentStatus: MindsetCampaignStatus;
}

function createEmptyForm(): CampaignFormState {
  return {
    name: '',
    keyword: '',
    postIds: [],
    postMode: 'any',
    nextPostId: null,
    nextPostActivatedAt: null,
    nextPostResolvedAt: null,
    publicReplyEnabled: true,
    publicReplyText: DEFAULT_MINDSET_PUBLIC_REPLY_TEXT,
    journey: normalizeMindsetCampaignJourney(DEFAULT_MINDSET_CAMPAIGN_JOURNEY),
    currentStatus: 'draft',
  };
}

export default function CampaignsPage() {
  const { selectedAccount, accounts, isLoading: accountsLoading } = useAccount();
  const queryClient = useQueryClient();
  const reviewMode = isDashboardReviewMode();
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [form, setForm] = useState<CampaignFormState>(createEmptyForm);
  const [confirmedSafeActivation, setConfirmedSafeActivation] = useState(false);
  const [saveError, setSaveError] = useState('');
  const workspaceAnchor = useRef<HTMLDivElement>(null);

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
        postIds: form.postMode === 'specific' ? form.postIds : [],
        postMode: form.postMode,
        status,
        publicReplyEnabled: form.publicReplyEnabled,
        publicReplyText: form.publicReplyText,
        journey: form.journey,
      });
    },
    onSuccess: async (campaign) => {
      setSaveError('');
      setEditorOpen(false);
      setSelectedCampaignId(campaign.id);
      setForm(createEmptyForm());
      setConfirmedSafeActivation(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['mindset-campaigns', selectedAccount?.id] }),
        queryClient.invalidateQueries({ queryKey: ['mindset-overview', selectedAccount?.id] }),
      ]);
    },
    onError: (error) => {
      setSaveError(error instanceof Error ? error.message : 'Automation could not be saved.');
    },
  });

  const campaigns = data?.campaigns || [];
  const keyword = form.keyword.trim().toUpperCase();
  const runtimeMode = data?.runtime.mode || 'off';
  const nameValid = form.name.trim().length >= 2;
  const keywordValid = /^[A-Z0-9_-]{2,40}$/.test(keyword);
  const postSelectionValid = form.postMode !== 'specific' || form.postIds.length > 0;
  const publicReplyVariants = parseMindsetPublicReplyVariants(form.publicReplyText);
  const publicRepliesValid = !form.publicReplyEnabled || (
    publicReplyVariants.length >= 1
    && publicReplyVariants.length <= 5
    && publicReplyVariants.every((reply) => reply.length >= 2 && reply.length <= 180)
  );
  const journeyErrors = validateMindsetCampaignJourney(form.journey);
  const journeyValid = journeyErrors.length === 0;
  const formValid = nameValid && keywordValid && postSelectionValid && publicRepliesValid && journeyValid;
  const nextPostConflict = form.postMode === 'next' && campaigns.some((campaign) => (
    campaign.id !== form.id
    && (campaign.status === 'test' || campaign.status === 'live')
    && effectiveCampaignPostMode(campaign) === 'next'
    && !campaign.nextPostId
  ));
  const canEnableTest = formValid
    && keyword !== 'MINDSET'
    && ['test', 'full'].includes(runtimeMode)
    && !nextPostConflict
    && confirmedSafeActivation;
  const canGoLive = formValid
    && ['mindset', 'full'].includes(runtimeMode)
    && !nextPostConflict
    && confirmedSafeActivation;
  const selectedCampaign = campaigns.find((campaign) => campaign.id === selectedCampaignId) || campaigns[0] || null;

  useEffect(() => {
    if (!campaigns.length) {
      setSelectedCampaignId(null);
      return;
    }
    setSelectedCampaignId((current) => (
      current && campaigns.some((campaign) => campaign.id === current) ? current : campaigns[0].id
    ));
  }, [campaigns]);

  useEffect(() => {
    if (!editorOpen || !window.matchMedia('(max-width: 1023px)').matches) return;
    window.requestAnimationFrame(() => {
      workspaceAnchor.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [editorOpen]);

  useEffect(() => {
    if (editorOpen) setConfirmedSafeActivation(false);
  }, [
    editorOpen,
    form.name,
    form.keyword,
    form.postMode,
    form.postIds,
    form.publicReplyEnabled,
    form.publicReplyText,
    form.journey,
  ]);

  if (accountsLoading) return <CampaignsSkeleton />;
  if (accounts.length === 0 || !selectedAccount) return <NoAccountState />;

  const openNewCampaign = () => {
    setForm(createEmptyForm());
    setSaveError('');
    setConfirmedSafeActivation(false);
    setEditorOpen(true);
  };

  const openCampaign = (campaign: MindsetCampaign) => {
    setSelectedCampaignId(campaign.id);
    if (campaign.isSystem) {
      setEditorOpen(false);
      return;
    }
    setForm({
      id: campaign.id,
      name: campaign.name,
      keyword: campaign.keyword,
      postIds: campaign.postIds,
      postMode: effectiveCampaignPostMode(campaign),
      nextPostId: campaign.nextPostId || null,
      nextPostActivatedAt: campaign.nextPostActivatedAt || null,
      nextPostResolvedAt: campaign.nextPostResolvedAt || null,
      publicReplyEnabled: campaign.publicReplyEnabled,
      publicReplyText: campaign.publicReplyText,
      journey: normalizeMindsetCampaignJourney(campaign.journey),
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
        postMode: effectiveCampaignPostMode(campaign),
        status: 'paused',
        publicReplyEnabled: campaign.publicReplyEnabled,
        publicReplyText: campaign.publicReplyText,
        journey: normalizeMindsetCampaignJourney(campaign.journey),
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['mindset-campaigns', selectedAccount.id] }),
        queryClient.invalidateQueries({ queryKey: ['mindset-overview', selectedAccount.id] }),
      ]);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Automation could not be paused.');
    }
  };

  return (
    <div className="min-w-0 space-y-5">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-emerald-700">Instagram growth</p>
            {reviewMode && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-800">Local preview</span>}
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-slate-950">Comment automations</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Turn a keyword comment into a public reply, private DM, tracked app visit, and guarded follow-up.</p>
        </div>
        <button type="button" onClick={openNewCampaign} className="inline-flex h-10 flex-shrink-0 self-start items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98]">
          <Plus size={17} weight="bold" />
          New automation
        </button>
      </header>

      {isError && (
        <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Automations could not be loaded.
          <button type="button" onClick={() => refetch()} className="font-semibold">Try again</button>
        </div>
      )}
      {saveError && !editorOpen && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{saveError}</div>}

      <JourneyStrip />

      <section className="grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[330px_minmax(0,1fr)]">
        <CampaignList
          campaigns={campaigns}
          posts={posts}
          runtimeMode={runtimeMode}
          selectedCampaignId={selectedCampaign?.id || null}
          loading={isLoading}
          onSelect={(campaign) => {
            setSelectedCampaignId(campaign.id);
            setEditorOpen(false);
            setSaveError('');
          }}
          onNew={openNewCampaign}
        />

        <div ref={workspaceAnchor} className={cn('min-w-0 scroll-mt-4', editorOpen && 'order-first lg:order-none')}>
          {editorOpen ? (
            <CampaignEditor
              accountUsername={selectedAccount.username}
              form={form}
              setForm={setForm}
              posts={posts}
              postsLoading={postsLoading}
              runtimeMode={runtimeMode}
              reviewMode={reviewMode}
              nameValid={nameValid}
              keywordValid={keywordValid}
              postSelectionValid={postSelectionValid}
              nextPostConflict={nextPostConflict}
              publicRepliesValid={publicRepliesValid}
              journeyValid={journeyValid}
              journeyErrors={journeyErrors}
              formValid={formValid}
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
          ) : selectedCampaign ? (
            <CampaignDetails
              accountUsername={selectedAccount.username}
              campaign={selectedCampaign}
              posts={posts}
              onEdit={() => openCampaign(selectedCampaign)}
              onPause={() => pauseCampaign(selectedCampaign)}
            />
          ) : (
            <EmptyWorkspace onNew={openNewCampaign} />
          )}
        </div>
      </section>
    </div>
  );
}

function JourneyStrip() {
  const steps = [
    { icon: Megaphone, label: 'Keyword comment' },
    { icon: ChatsCircle, label: 'Public reply' },
    { icon: PaperPlaneTilt, label: 'Editable opening DM' },
    { icon: LinkSimple, label: 'Direct app link' },
    { icon: ClockCountdown, label: 'Timed follow-ups' },
  ];
  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white px-4 py-3.5 sm:px-5">
      <div className="flex items-center gap-3 overflow-x-auto pb-0.5">
        <div className="flex min-w-max items-center gap-2 pr-3 text-xs font-semibold text-slate-600">
          <PencilSimple size={16} weight="fill" className="text-emerald-700" />
          Journey builder
        </div>
        <div className="h-5 w-px flex-shrink-0 bg-slate-200" />
        {steps.map((step, index) => (
          <div key={step.label} className="flex min-w-max items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-50 text-emerald-700"><step.icon size={15} weight="fill" /></span>
            <span className="text-xs font-semibold text-slate-700">{step.label}</span>
            {index < steps.length - 1 && <ArrowRight size={14} className="mx-1 text-slate-300" />}
          </div>
        ))}
      </div>
    </section>
  );
}

function CampaignList({
  campaigns,
  posts,
  runtimeMode,
  selectedCampaignId,
  loading,
  onSelect,
  onNew,
}: {
  campaigns: MindsetCampaign[];
  posts: InstagramPost[];
  runtimeMode: string;
  selectedCampaignId: string | null;
  loading: boolean;
  onSelect: (campaign: MindsetCampaign) => void;
  onNew: () => void;
}) {
  return (
    <aside className="min-w-0 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white lg:sticky lg:top-6">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-950">Automations</h2>
          <p className="mt-0.5 text-xs text-slate-500">{campaigns.length} configured</p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-600">{runtimeMode} mode</span>
      </div>
      {loading ? (
        <CampaignListSkeleton />
      ) : campaigns.length ? (
        <div className="divide-y divide-slate-100">
          {campaigns.map((campaign) => (
            <CampaignListItem
              key={campaign.id}
              campaign={campaign}
              posts={posts}
              selected={campaign.id === selectedCampaignId}
              onSelect={() => onSelect(campaign)}
            />
          ))}
        </div>
      ) : (
        <div className="px-6 py-12 text-center">
          <FileText size={28} className="mx-auto text-slate-300" />
          <p className="mt-3 text-sm font-semibold text-slate-900">No automations yet</p>
          <button type="button" onClick={onNew} className="mt-3 text-xs font-semibold text-emerald-700">Create the first one</button>
        </div>
      )}
      <div className="border-t border-slate-200 p-3">
        <button type="button" onClick={onNew} className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 active:scale-[0.99]">
          <Plus size={15} weight="bold" /> New automation
        </button>
      </div>
    </aside>
  );
}

function CampaignListItem({ campaign, posts, selected, onSelect }: { campaign: MindsetCampaign; posts: InstagramPost[]; selected: boolean; onSelect: () => void }) {
  const active = campaign.status === 'test' || campaign.status === 'live';
  const postMode = effectiveCampaignPostMode(campaign);
  const targetPostIds = postMode === 'next'
    ? campaign.nextPostId ? [campaign.nextPostId] : []
    : campaign.postIds;
  const previewPost = targetPostIds
    .map((postId) => posts.find((post) => post.id === postId))
    .find((post): post is InstagramPost => Boolean(post));
  const previewImage = previewPost?.thumbnailUrl || previewPost?.mediaUrl;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'group flex w-full items-start gap-3 px-4 py-4 text-left transition active:scale-[0.995]',
        selected ? 'bg-emerald-50/80' : 'hover:bg-slate-50'
      )}
    >
      <span
        className={cn(
          'relative grid h-10 w-10 flex-shrink-0 place-items-center overflow-hidden rounded-xl bg-cover bg-center',
          campaign.isSystem ? 'bg-slate-950 text-emerald-300' : active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
        )}
        style={previewImage ? { backgroundImage: `url(${previewImage})` } : undefined}
      >
        {previewImage && <span className="absolute inset-0 bg-slate-950/35" />}
        <span className="relative">{campaign.isSystem ? <LockKey size={18} weight="fill" /> : postMode === 'next' ? <CalendarPlus size={18} weight={active ? 'fill' : 'regular'} /> : <Megaphone size={18} weight={active ? 'fill' : 'regular'} />}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-slate-950">{campaign.name}</span>
          {campaign.isSystem && <LockKey size={12} weight="fill" className="flex-shrink-0 text-slate-400" />}
        </span>
        <span className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
          <span className="font-mono font-bold text-slate-700">{campaign.keyword}</span>
          <span className="text-slate-300">•</span>
          <span>{campaignPostScopeLabel(campaign)}</span>
        </span>
        <span className="mt-2 flex items-center justify-between gap-2">
          <CampaignStatus status={campaign.status} />
          {campaign.isSystem && active && <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Running</span>}
        </span>
      </span>
      <CaretRight size={15} className={cn('mt-3 flex-shrink-0 transition', selected ? 'text-emerald-700' : 'text-slate-300 group-hover:text-slate-500')} />
    </button>
  );
}

function CampaignDetails({
  accountUsername,
  campaign,
  posts,
  onEdit,
  onPause,
}: {
  accountUsername: string;
  campaign: MindsetCampaign;
  posts: InstagramPost[];
  onEdit: () => void;
  onPause: () => void;
}) {
  const active = campaign.status === 'test' || campaign.status === 'live';
  const publicReplies = parseMindsetPublicReplyVariants(campaign.publicReplyText);
  const journey = normalizeMindsetCampaignJourney(campaign.journey);
  const activeFollowUps = MINDSET_FOLLOW_UP_KEYS.filter((key) => journey.followUps[key].enabled);
  const postMode = effectiveCampaignPostMode(campaign);
  const targetPostIds = postMode === 'next'
    ? campaign.nextPostId ? [campaign.nextPostId] : []
    : campaign.postIds;
  const selectedPosts = targetPostIds
    .map((postId) => posts.find((post) => post.id === postId))
    .filter((post): post is InstagramPost => Boolean(post));

  return (
    <article className="min-w-0 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-950">{campaign.name}</h2>
            <CampaignStatus status={campaign.status} />
            {campaign.isSystem && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-600">Protected</span>}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {campaign.updatedAt ? `Updated ${formatRelativeTimestamp(campaign.updatedAt)}` : 'Controlled by the bot runtime'}
          </p>
        </div>
        {!campaign.isSystem && (
          <div className="flex gap-2">
            {active && <button type="button" onClick={onPause} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 active:scale-[0.98]"><Pause size={15} weight="fill" />Pause</button>}
            <button type="button" onClick={onEdit} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-950 px-3 text-xs font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98]"><PencilSimple size={15} />Edit automation</button>
          </div>
        )}
      </div>

      <div className="grid gap-0 2xl:grid-cols-[minmax(0,1fr)_350px]">
        <div className="px-5 py-6 sm:px-6">
          {campaign.isSystem && (
            <div className="mb-6 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3.5">
              <ShieldCheck size={20} weight="fill" className="mt-0.5 flex-shrink-0 text-emerald-700" />
              <div>
                <p className="text-sm font-semibold text-emerald-950">Protected test automation</p>
                <p className="mt-1 text-xs leading-5 text-emerald-900/70">This runtime automation is live for controlled testing. Its conversation logic is locked so campaign edits cannot change the tested journey.</p>
              </div>
            </div>
          )}

          {postMode === 'next' && (
            <div className="mb-6 flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3.5">
              <CalendarPlus size={20} weight="fill" className="mt-0.5 flex-shrink-0 text-blue-700" />
              <div>
                <p className="text-sm font-semibold text-blue-950">{campaign.nextPostId ? 'Locked to your next published post' : 'Waiting for your next post'}</p>
                <p className="mt-1 text-xs leading-5 text-blue-900/70">{campaign.nextPostId ? 'Only comments on that one post or reel can start this automation.' : 'Existing posts are ignored. The first post or reel published after activation becomes the permanent target.'}</p>
              </div>
            </div>
          )}

          <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Automation journey</h3>
          <div className="mt-4">
            <JourneyRow number="1" icon={Megaphone} title={`Comment contains ${campaign.keyword}`} detail={campaignPostScopeDetail(campaign)} />
            <JourneyRow number="2" icon={ChatsCircle} title={campaign.publicReplyEnabled ? 'Reply publicly after the DM succeeds' : 'Skip the public comment reply'} detail={campaign.publicReplyEnabled ? `${publicReplies.length} reply variation${publicReplies.length === 1 ? '' : 's'} rotate automatically` : 'The private DM still sends'} />
            <JourneyRow number="3" icon={PaperPlaneTilt} title="Send the opening DM" detail={`Button: ${journey.openingButtonText}`} />
            <JourneyRow number="4" icon={LinkSimple} title="Send the app link in two messages" detail={`A short note, then the direct ${mindsetDestinationHost(journey.destinationUrl)} link`} />
            <JourneyRow number="5" icon={ClockCountdown} title={`${activeFollowUps.length} follow-up${activeFollowUps.length === 1 ? '' : 's'} enabled`} detail="Replies, clicks, milestones, and conversions stop messages that are no longer relevant" last />
          </div>

          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            <SummaryItem label="Keyword" value={campaign.keyword} mono />
            <SummaryItem label="Post scope" value={campaignPostScopeLabel(campaign)} />
            <SummaryItem label="Public replies" value={campaign.publicReplyEnabled ? `${publicReplies.length} rotating` : 'Off'} />
            <SummaryItem label="First follow-up" value={activeFollowUps.length ? formatMindsetDelay(journey.followUps[activeFollowUps[0]].delayMinutes) : 'Off'} />
          </div>

          {selectedPosts.length > 0 && <SelectedPostStrip posts={selectedPosts} />}
        </div>
        <div className="border-t border-slate-200 bg-slate-50/70 p-5 2xl:border-l 2xl:border-t-0">
          <InstagramPreview
            accountUsername={accountUsername}
            keyword={campaign.keyword}
            replies={publicReplies}
            publicReplyEnabled={campaign.publicReplyEnabled}
            post={selectedPosts[0]}
            postMode={postMode}
            journey={journey}
          />
        </div>
      </div>
    </article>
  );
}

function CampaignEditor({
  accountUsername,
  form,
  setForm,
  posts,
  postsLoading,
  runtimeMode,
  reviewMode,
  nameValid,
  keywordValid,
  postSelectionValid,
  nextPostConflict,
  publicRepliesValid,
  journeyValid,
  journeyErrors,
  formValid,
  canEnableTest,
  canGoLive,
  confirmedSafeActivation,
  setConfirmedSafeActivation,
  saveError,
  saving,
  onSave,
  onClose,
}: {
  accountUsername: string;
  form: CampaignFormState;
  setForm: React.Dispatch<React.SetStateAction<CampaignFormState>>;
  posts: InstagramPost[];
  postsLoading: boolean;
  runtimeMode: string;
  reviewMode: boolean;
  nameValid: boolean;
  keywordValid: boolean;
  postSelectionValid: boolean;
  nextPostConflict: boolean;
  publicRepliesValid: boolean;
  journeyValid: boolean;
  journeyErrors: string[];
  formValid: boolean;
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
  const targetPostIds = form.postMode === 'next'
    ? form.nextPostId ? [form.nextPostId] : []
    : form.postIds;
  const selectedPosts = targetPostIds
    .map((postId) => posts.find((post) => post.id === postId))
    .filter((post): post is InstagramPost => Boolean(post));

  return (
    <article className="min-w-0 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_70px_-55px_rgba(15,23,42,0.5)]">
      <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4 sm:px-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">{form.id ? 'Edit automation' : 'New automation'}</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-950">Comment to DM</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Close automation editor" className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 active:scale-[0.96]"><X size={18} /></button>
      </div>

      {reviewMode && (
        <div className="border-b border-emerald-200 bg-emerald-50 px-5 py-2.5 text-xs leading-5 text-emerald-900 sm:px-6">
          Local preview only. Changes here cannot send an Instagram DM.
        </div>
      )}

      <div className="grid 2xl:grid-cols-[minmax(0,1fr)_350px]">
        <div className="divide-y divide-slate-200">
          <BuilderSection number="1" title="Choose the trigger" description="Name the automation, set the keyword, and choose where it runs.">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-semibold text-slate-800">Automation name</span>
                <input
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Pole vault reel, August"
                  className={cn(fieldClassName, form.name && !nameValid && invalidFieldClassName)}
                />
                <FieldHint invalid={Boolean(form.name) && !nameValid}>Use a clear internal name.</FieldHint>
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-800">Comment keyword</span>
                <input
                  value={form.keyword}
                  onChange={(event) => {
                    setForm((current) => ({ ...current, keyword: event.target.value.toUpperCase() }));
                    setConfirmedSafeActivation(false);
                  }}
                  placeholder="FOCUS"
                  className={cn(fieldClassName, 'font-mono font-semibold uppercase', form.keyword && !keywordValid && invalidFieldClassName)}
                />
                <FieldHint invalid={Boolean(form.keyword) && !keywordValid}>2 to 40 letters, numbers, hyphens, or underscores.</FieldHint>
              </label>
            </div>

            <fieldset className="mt-5">
              <legend className="text-sm font-semibold text-slate-800">Trigger on</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <ModeButton selected={form.postMode === 'any'} icon={Lightning} label="Any post" detail="Current and future" onClick={() => setForm((current) => ({ ...current, postMode: 'any', postIds: [] }))} />
                <ModeButton selected={form.postMode === 'specific'} icon={Images} label="Specific posts" detail="Choose one or more" onClick={() => setForm((current) => ({ ...current, postMode: 'specific' }))} />
                <ModeButton selected={form.postMode === 'next'} icon={CalendarPlus} label="Next post" detail="First post you publish" onClick={() => setForm((current) => ({ ...current, postMode: 'next', postIds: [] }))} />
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
              {form.postMode === 'specific' && !postSelectionValid && <p className="mt-2 text-xs font-medium text-red-700">Select at least one post.</p>}
              {form.postMode === 'next' && (
                <div className="mt-3 flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-3">
                  <CalendarPlus size={18} weight="fill" className="mt-0.5 flex-shrink-0 text-blue-700" />
                  <div>
                    <p className="text-xs font-semibold text-blue-950">{form.nextPostId ? 'This automation is already locked' : 'Wait for one new post or reel'}</p>
                    <p className="mt-1 text-[11px] leading-5 text-blue-900/70">{form.nextPostId ? 'It stays attached to the post that followed its original activation.' : 'Waiting begins when you enable the automation. Existing posts will not trigger it, and it locks to the first post you publish next.'}</p>
                  </div>
                </div>
              )}
              {nextPostConflict && (
                <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs leading-5 text-amber-900">
                  <ShieldWarning size={18} weight="fill" className="mt-0.5 flex-shrink-0" />
                  <p>Another active automation is already waiting for the next post. Pause it or let it lock before enabling this one.</p>
                </div>
              )}
            </fieldset>
          </BuilderSection>

          <BuilderSection number="2" title="Set the public reply" description="This reply appears under the comment only after the private DM succeeds.">
            <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Reply on the post</p>
                <p className="mt-0.5 text-xs text-slate-500">Rotate variations so replies feel natural.</p>
              </div>
              <Toggle enabled={form.publicReplyEnabled} onToggle={() => setForm((current) => ({ ...current, publicReplyEnabled: !current.publicReplyEnabled }))} label="Toggle public comment reply" />
            </div>
            {form.publicReplyEnabled && (
              <ReplyVariationsEditor
                value={form.publicReplyText}
                onChange={(value) => setForm((current) => ({ ...current, publicReplyText: value }))}
                valid={publicRepliesValid}
              />
            )}
          </BuilderSection>

          <BuilderSection number="3" title="Build the DM journey" description="Edit the messages, button labels, app destination, and follow-up timing.">
            <DmJourneyEditor
              journey={form.journey}
              onChange={(journey) => setForm((current) => ({ ...current, journey }))}
              errors={journeyErrors}
            />
          </BuilderSection>

          <BuilderSection number="4" title="Review and activate" description="Check the setup before this automation can receive real comments.">
            <div className="grid gap-2 sm:grid-cols-2">
              <ValidationLine valid={nameValid} label="Automation named" />
              <ValidationLine valid={keywordValid} label="Keyword is valid" />
              <ValidationLine valid={postSelectionValid} label="Post scope selected" />
              <ValidationLine valid={publicRepliesValid} label="Public replies ready" />
              <ValidationLine valid={journeyValid} label="DM journey ready" />
              <ValidationLine valid={!nextPostConflict} label="No trigger conflict" />
            </div>

            {testBlockedByKeyword && (
              <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs leading-5 text-amber-900">
                <ShieldWarning size={18} weight="fill" className="mt-0.5 flex-shrink-0" />
                <p><strong>MINDSET can only be saved as a draft.</strong> ManyChat still owns this keyword. Turn it off there before deliberately enabling production mode here.</p>
              </div>
            )}

            {runtimeMode === 'off' && !testBlockedByKeyword && (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-xs leading-5 text-slate-600">The bot runtime is off. You can save this automation as a draft.</div>
            )}

            {!testBlockedByKeyword && (
              <label className={cn('mt-4 flex items-start gap-3 rounded-xl border px-3.5 py-3', formValid ? 'cursor-pointer border-slate-200 bg-slate-50' : 'cursor-not-allowed border-slate-200 bg-slate-50/60 opacity-60')}>
                <input
                  type="checkbox"
                  checked={confirmedSafeActivation}
                  disabled={!formValid}
                  onChange={(event) => setConfirmedSafeActivation(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
                />
                <span className="text-xs leading-5 text-slate-600">
                  {productionMode
                    ? 'I confirmed the old automation is off and this keyword should run on the selected post scope.'
                    : 'I confirmed this is a private test keyword and does not overlap with the live ManyChat automation.'}
                </span>
              </label>
            )}

            {saveError && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-3.5 py-3 text-xs leading-5 text-red-800">{saveError}</p>}
          </BuilderSection>
        </div>

        <aside className="border-t border-slate-200 bg-slate-50/70 p-5 2xl:border-l 2xl:border-t-0">
          <div className="2xl:sticky 2xl:top-6">
            <InstagramPreview
              accountUsername={accountUsername}
              keyword={keyword || 'KEYWORD'}
              replies={publicReplyVariants}
              publicReplyEnabled={form.publicReplyEnabled}
              post={selectedPosts[0]}
              postMode={form.postMode}
              journey={form.journey}
            />
          </div>
        </aside>
      </div>

      <div className="sticky bottom-0 z-10 flex flex-col gap-2 border-t border-slate-200 bg-white/95 px-5 py-4 backdrop-blur sm:flex-row sm:justify-end sm:px-6">
        <button type="button" onClick={() => onSave('draft')} disabled={!formValid || saving} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-300 px-5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45">
          {saving ? <SpinnerGap size={17} className="animate-spin" /> : <FileText size={17} />}
          Save draft
        </button>
        {productionMode ? (
          <button type="button" onClick={() => onSave('live')} disabled={!canGoLive || saving} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40">
            <Play size={17} weight="fill" />Go live
          </button>
        ) : (
          <button type="button" onClick={() => onSave('test')} disabled={!canEnableTest || saving} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40">
            <Flask size={17} weight="fill" />Enable test
          </button>
        )}
      </div>
    </article>
  );
}

const fieldClassName = 'mt-2 h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100';
const textAreaClassName = 'mt-2 w-full resize-y rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100';
const invalidFieldClassName = 'border-red-300 focus:border-red-500 focus:ring-red-100';

function BuilderSection({ number, title, description, children }: { number: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="px-5 py-6 sm:px-6">
      <div className="flex gap-3">
        <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg bg-slate-950 text-xs font-bold text-white">{number}</span>
        <div>
          <h3 className="text-base font-semibold text-slate-950">{title}</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

type JourneyEditorStep = 'opening' | 'link' | 'followups' | 'guardrails';

const JOURNEY_EDITOR_STEPS: Array<{
  id: JourneyEditorStep;
  label: string;
  detail: string;
  icon: typeof PaperPlaneTilt;
}> = [
  { id: 'opening', label: 'Opening DM', detail: 'Message and quick reply', icon: PaperPlaneTilt },
  { id: 'link', label: 'App link', detail: 'Direct URL and preview', icon: LinkSimple },
  { id: 'followups', label: 'Follow-ups', detail: 'Timing and messages', icon: ClockCountdown },
  { id: 'guardrails', label: 'Safety rules', detail: 'Locked delivery limits', icon: ShieldCheck },
];

const FOLLOW_UP_META: Record<MindsetCampaignFollowUpKey, { label: string; trigger: string }> = {
  noClick: { label: 'After link sent', trigger: 'If the athlete has not replied' },
  downloadCheck: { label: 'App not opened', trigger: 'After a tracked link click' },
  useCheck: { label: 'First rep not started', trigger: 'After the app is opened' },
  feedbackCheck: { label: 'Ask for feedback', trigger: 'After the first rep is completed' },
};

function DmJourneyEditor({
  journey,
  onChange,
  errors,
}: {
  journey: MindsetCampaignJourney;
  onChange: (journey: MindsetCampaignJourney) => void;
  errors: string[];
}) {
  const [activeStep, setActiveStep] = useState<JourneyEditorStep>('opening');
  const [activeFollowUp, setActiveFollowUp] = useState<MindsetCampaignFollowUpKey>('noClick');
  const enabledFollowUps = MINDSET_FOLLOW_UP_KEYS.filter((key) => journey.followUps[key].enabled).length;

  const updateJourney = <K extends keyof Omit<MindsetCampaignJourney, 'followUps'>>(
    key: K,
    value: MindsetCampaignJourney[K]
  ) => onChange({ ...journey, [key]: value });

  const updateFollowUp = (
    key: MindsetCampaignFollowUpKey,
    updates: Partial<MindsetCampaignJourney['followUps'][MindsetCampaignFollowUpKey]>
  ) => onChange({
    ...journey,
    followUps: {
      ...journey.followUps,
      [key]: { ...journey.followUps[key], ...updates },
    },
  });

  return (
    <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] md:grid-cols-[200px_minmax(0,1fr)]">
        <nav aria-label="DM journey steps" className="min-w-0 overflow-hidden border-b border-slate-200 bg-slate-50/80 p-2 md:border-b-0 md:border-r">
          <div className="grid min-w-0 grid-cols-2 gap-1 md:block md:space-y-1">
            {JOURNEY_EDITOR_STEPS.map((step, index) => {
              const selected = activeStep === step.id;
              const status = step.id === 'followups'
                ? `${enabledFollowUps} on`
                : step.id === 'guardrails' ? 'Locked' : 'Editable';
              return (
                <button
                  key={step.id}
                  type="button"
                  aria-current={selected ? 'step' : undefined}
                  onClick={() => setActiveStep(step.id)}
                  className={cn(
                    'flex min-w-0 w-full items-center gap-2 rounded-xl px-2.5 py-3 text-left transition active:scale-[0.99] md:gap-2.5 md:px-3',
                    selected ? 'bg-white text-slate-950 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:bg-white/70'
                  )}
                >
                  <span className={cn('grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg', selected ? 'bg-emerald-700 text-white' : 'bg-slate-200/70 text-slate-500')}>
                    <step.icon size={16} weight={selected ? 'fill' : 'regular'} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold">{index + 1}. {step.label}</span>
                      <span className="hidden text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400 md:inline">{status}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-slate-500">{step.detail}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </nav>

        <div className="min-w-0 w-full p-4 sm:p-5">
          {activeStep === 'opening' && (
            <div>
              <JourneyPanelHeading title="Write the first DM" detail="This is the private reply sent after the keyword comment." />
              <label className="mt-5 block">
                <span className="text-sm font-semibold text-slate-800">Message</span>
                <textarea
                  value={journey.openingMessage}
                  maxLength={500}
                  rows={4}
                  onChange={(event) => updateJourney('openingMessage', event.target.value)}
                  className={textAreaClassName}
                />
                <CharacterCount current={journey.openingMessage.length} maximum={500} />
              </label>
              <label className="mt-4 block">
                <span className="text-sm font-semibold text-slate-800">Quick-reply button</span>
                <input
                  value={journey.openingButtonText}
                  maxLength={20}
                  onChange={(event) => updateJourney('openingButtonText', event.target.value)}
                  className={fieldClassName}
                />
                <CharacterCount current={journey.openingButtonText.length} maximum={20} />
              </label>
              <InlineInfo icon={ChatsCircle} title="Instagram requires this tap" detail="The first quick reply opens the normal messaging window. The short note and direct app link are sent immediately after the athlete taps it." />
            </div>
          )}

          {activeStep === 'link' && (
            <div>
              <JourneyPanelHeading title="Configure the app link" detail="The note and URL are sent as separate messages so Instagram can render the App Store link preview." />
              <div className="mt-5">
                <label className="block">
                  <span className="text-sm font-semibold text-slate-800">Link message</span>
                  <input
                    value={journey.linkMessage}
                    maxLength={80}
                    onChange={(event) => updateJourney('linkMessage', event.target.value)}
                    className={fieldClassName}
                  />
                  <CharacterCount current={journey.linkMessage.length} maximum={80} />
                </label>
              </div>
              <label className="mt-4 block">
                <span className="text-sm font-semibold text-slate-800">App destination</span>
                <div className="relative">
                  <LinkSimple size={17} className="pointer-events-none absolute left-3.5 top-[25px] text-slate-400" />
                  <input
                    type="url"
                    value={journey.destinationUrl}
                    onChange={(event) => updateJourney('destinationUrl', event.target.value)}
                    placeholder="https://athletemindset.app/app"
                    className={cn(fieldClassName, 'pl-10 pr-10')}
                  />
                  {isSafeHttpsUrl(journey.destinationUrl) && (
                    <a href={journey.destinationUrl} target="_blank" rel="noreferrer" aria-label="Open app destination" className="absolute right-3 top-[22px] grid h-7 w-7 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-900">
                      <ArrowSquareOut size={16} />
                    </a>
                  )}
                </div>
                <FieldHint invalid={!isSafeHttpsUrl(journey.destinationUrl)}>Use the clean HTTPS app link you want Instagram to preview.</FieldHint>
              </label>
              <InlineInfo icon={CursorClick} title="Clean link preview" detail="The app URL is sent as its own message so Instagram can show the image preview. The later check-in is plain text and does not add another button." />
            </div>
          )}

          {activeStep === 'followups' && (
            <div>
              <JourneyPanelHeading title="Set milestone follow-ups" detail="Choose what sends, when it sends, and what the athlete sees." />
              <div className="mt-5 space-y-4">
                <div className="grid gap-1 sm:grid-cols-2">
                  {MINDSET_FOLLOW_UP_KEYS.map((key) => {
                    const followUp = journey.followUps[key];
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setActiveFollowUp(key)}
                        className={cn('flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left transition active:scale-[0.99]', activeFollowUp === key ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-700 hover:bg-slate-100')}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-semibold">{FOLLOW_UP_META[key].label}</span>
                          <span className={cn('mt-0.5 block text-[10px]', activeFollowUp === key ? 'text-slate-300' : 'text-slate-500')}>{formatMindsetDelay(followUp.delayMinutes)}</span>
                        </span>
                        <span className={cn('h-2 w-2 flex-shrink-0 rounded-full', followUp.enabled ? 'bg-emerald-400' : 'bg-slate-400')} />
                      </button>
                    );
                  })}
                </div>

                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">{FOLLOW_UP_META[activeFollowUp].label}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{FOLLOW_UP_META[activeFollowUp].trigger}</p>
                    </div>
                    <Toggle
                      enabled={journey.followUps[activeFollowUp].enabled}
                      onToggle={() => updateFollowUp(activeFollowUp, { enabled: !journey.followUps[activeFollowUp].enabled })}
                      label={`Toggle ${FOLLOW_UP_META[activeFollowUp].label}`}
                    />
                  </div>
                  <div className={cn('mt-4 transition-opacity', !journey.followUps[activeFollowUp].enabled && 'pointer-events-none opacity-45')}>
                    <label className="block max-w-[180px]">
                      <span className="text-xs font-semibold text-slate-700">Wait time in minutes</span>
                      <input
                        type="number"
                        min={2}
                        max={1320}
                        value={journey.followUps[activeFollowUp].delayMinutes}
                        onChange={(event) => updateFollowUp(activeFollowUp, { delayMinutes: Number(event.target.value) })}
                        className={fieldClassName}
                      />
                      <FieldHint invalid={journey.followUps[activeFollowUp].delayMinutes < 2 || journey.followUps[activeFollowUp].delayMinutes > 1320}>2 minutes to 22 hours.</FieldHint>
                    </label>
                    <label className="mt-4 block">
                      <span className="text-xs font-semibold text-slate-700">Message</span>
                      <textarea
                        value={journey.followUps[activeFollowUp].message}
                        maxLength={500}
                        rows={4}
                        onChange={(event) => updateFollowUp(activeFollowUp, { message: event.target.value })}
                        className={textAreaClassName}
                      />
                      <CharacterCount current={journey.followUps[activeFollowUp].message.length} maximum={500} />
                    </label>
                    {activeFollowUp === 'noClick' && <p className="mt-3 text-[11px] leading-5 text-slate-500">This check-in is sent as a normal text message with no button.</p>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeStep === 'guardrails' && (
            <div>
              <JourneyPanelHeading title="Delivery rules stay protected" detail="These limits apply to every campaign and cannot be loosened from the dashboard." />
              <div className="mt-5 divide-y divide-slate-200 border-y border-slate-200">
                <GuardrailRow title="Maximum two unanswered follow-ups" detail="The automation stops instead of continuing to message someone who stays silent." />
                <GuardrailRow title="Replies cancel pending reminders" detail="A new message from the athlete resets the flow and is handled only inside that conversation." />
                <GuardrailRow title="Clicks and milestones suppress stale questions" detail="The bot does not ask whether a link was clicked after tracking has already proved it." />
                <GuardrailRow title="Instagram messaging window enforced" detail="Anything outside the conservative 23-hour window is skipped." />
                <GuardrailRow title="Verified conversion stops the funnel" detail="Trial and subscription events cancel every remaining campaign follow-up." />
              </div>
            </div>
          )}

          {errors.length > 0 && (
            <div role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-xs leading-5 text-red-800">
              Complete this journey before activation: {errors.join(', ')}.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function JourneyPanelHeading({ title, detail }: { title: string; detail: string }) {
  return <div><h4 className="text-base font-semibold text-slate-950">{title}</h4><p className="mt-1 max-w-xl text-xs leading-5 text-slate-500">{detail}</p></div>;
}

function CharacterCount({ current, maximum }: { current: number; maximum: number }) {
  return <p className={cn('mt-1.5 text-right text-[10px]', current > maximum ? 'font-semibold text-red-700' : 'text-slate-400')}>{current}/{maximum}</p>;
}

function InlineInfo({ icon: Icon, title, detail }: { icon: typeof ChatsCircle; title: string; detail: string }) {
  return (
    <div className="mt-5 flex items-start gap-3 border-t border-slate-200 pt-4">
      <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700"><Icon size={16} weight="fill" /></span>
      <div><p className="text-xs font-semibold text-slate-800">{title}</p><p className="mt-1 text-[11px] leading-5 text-slate-500">{detail}</p></div>
    </div>
  );
}

function GuardrailRow({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex items-start gap-3 py-3.5">
      <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700"><LockKey size={14} weight="fill" /></span>
      <div><p className="text-xs font-semibold text-slate-900">{title}</p><p className="mt-1 text-[11px] leading-5 text-slate-500">{detail}</p></div>
    </div>
  );
}

function ReplyVariationsEditor({ value, onChange, valid }: { value: string; onChange: (value: string) => void; valid: boolean }) {
  const lines = value === '' ? [''] : value.split(/\r?\n/);
  const parsed = parseMindsetPublicReplyVariants(value);
  const updateLine = (index: number, nextValue: string) => {
    const next = [...lines];
    next[index] = nextValue.replace(/[\r\n]+/g, ' ');
    onChange(next.join('\n'));
  };
  const removeLine = (index: number) => {
    if (lines.length === 1) {
      onChange('');
      return;
    }
    onChange(lines.filter((_, lineIndex) => lineIndex !== index).join('\n'));
  };

  return (
    <div className="mt-4">
      <div className="space-y-2">
        {lines.map((line, index) => (
          <div key={index} className="flex items-center gap-2">
            <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-slate-100 text-[11px] font-bold text-slate-500">{index + 1}</span>
            <input
              value={line}
              maxLength={180}
              aria-label={`Public reply variation ${index + 1}`}
              onChange={(event) => updateLine(index, event.target.value)}
              placeholder="Write a short public reply"
              className={cn('h-10 min-w-0 flex-1 rounded-lg border bg-white px-3 text-sm outline-none transition focus:ring-2', line.trim().length > 0 && line.trim().length < 2 ? 'border-red-300 focus:border-red-500 focus:ring-red-100' : 'border-slate-300 focus:border-emerald-600 focus:ring-emerald-100')}
            />
            <button type="button" onClick={() => removeLine(index)} aria-label={`Remove reply variation ${index + 1}`} className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-700 active:scale-[0.96]"><Trash size={16} /></button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={() => onChange(`${value}\n`)} disabled={lines.length >= 5} className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 transition hover:text-emerald-900 disabled:cursor-not-allowed disabled:text-slate-400"><Plus size={14} weight="bold" />Add variation</button>
        <span className={cn('text-[11px]', valid ? 'text-slate-500' : 'font-medium text-red-700')}>{parsed.length}/5 valid replies</span>
      </div>
      {!valid && <p className="mt-2 text-xs font-medium text-red-700">Add 1 to 5 unique replies. Each reply must be 2 to 180 characters.</p>}
    </div>
  );
}

function InstagramPreview({
  accountUsername,
  keyword,
  replies,
  publicReplyEnabled,
  post,
  postMode,
  journey,
}: {
  accountUsername: string;
  keyword: string;
  replies: string[];
  publicReplyEnabled: boolean;
  post?: InstagramPost;
  postMode: MindsetCampaignPostMode;
  journey: MindsetCampaignJourney;
}) {
  const [view, setView] = useState<'comment' | 'dm'>('comment');
  const [dmStep, setDmStep] = useState<'opening' | 'link' | 'followup'>('opening');
  const [previewFollowUp, setPreviewFollowUp] = useState<MindsetCampaignFollowUpKey>('noClick');
  const [replyIndex, setReplyIndex] = useState(0);
  const currentReply = replies[replyIndex % Math.max(replies.length, 1)] || 'Your public reply appears here.';
  const imageUrl = post?.thumbnailUrl || post?.mediaUrl;
  const enabledFollowUps = MINDSET_FOLLOW_UP_KEYS.filter((key) => journey.followUps[key].enabled);
  const visibleFollowUp = journey.followUps[previewFollowUp].enabled
    ? previewFollowUp
    : enabledFollowUps[0];

  useEffect(() => {
    if (replyIndex >= replies.length) setReplyIndex(0);
  }, [replies.length, replyIndex]);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-950">Instagram preview</p>
          <p className="mt-0.5 text-[11px] text-slate-500">Preview the comment and opening DM.</p>
        </div>
        <div className="flex self-start rounded-lg bg-slate-200/70 p-0.5 sm:self-auto">
          <button type="button" onClick={() => setView('comment')} className={cn('rounded-md px-2.5 py-1.5 text-[10px] font-semibold transition', view === 'comment' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500')}>Comment</button>
          <button type="button" onClick={() => setView('dm')} className={cn('rounded-md px-2.5 py-1.5 text-[10px] font-semibold transition', view === 'dm' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500')}>DM</button>
        </div>
      </div>

      <div className="mx-auto mt-4 max-w-[300px] overflow-hidden rounded-[26px] border-[5px] border-slate-950 bg-white shadow-[0_24px_60px_-38px_rgba(15,23,42,0.8)]">
        {view === 'comment' ? (
          <div>
            <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2.5">
              <AccountAvatar username={accountUsername} />
              <span className="text-[11px] font-semibold text-slate-950">{accountUsername}</span>
            </div>
            {imageUrl ? (
              <div className="aspect-square bg-cover bg-center" style={{ backgroundImage: `url(${imageUrl})` }} />
            ) : (
              <div className="grid aspect-[4/3] place-items-center bg-slate-100 text-center">
                <div>
                  {postMode === 'next' ? <CalendarPlus size={24} className="mx-auto text-slate-300" /> : <Images size={24} className="mx-auto text-slate-300" />}
                  <p className="mt-2 text-[10px] font-medium text-slate-500">{postMode === 'next' ? 'Your next Instagram post' : postMode === 'specific' ? 'Selected Instagram post' : 'Any current or future post'}</p>
                </div>
              </div>
            )}
            <div className="space-y-3 px-3 py-4 text-[11px] leading-4">
              <p><span className="font-semibold text-slate-950">athlete</span> <span className="text-slate-600">{keyword}</span></p>
              {publicReplyEnabled ? (
                <p className="border-l-2 border-emerald-500 pl-2.5"><span className="font-semibold text-slate-950">{accountUsername}</span> <span className="text-slate-600">{currentReply}</span></p>
              ) : (
                <p className="rounded-lg bg-slate-50 px-2.5 py-2 text-slate-500">No public reply. The private DM still sends.</p>
              )}
            </div>
          </div>
        ) : (
          <div className="min-h-[380px] bg-[#f7f7f8]">
            <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2.5">
              <AccountAvatar username={accountUsername} />
              <div><p className="text-[11px] font-semibold text-slate-950">{accountUsername}</p><p className="text-[9px] text-slate-400">Instagram</p></div>
            </div>
            <div className="border-b border-slate-200 bg-white px-2 py-2">
              <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-0.5">
                {(['opening', 'link', 'followup'] as const).map((step) => (
                  <button key={step} type="button" onClick={() => setDmStep(step)} className={cn('rounded-md px-1 py-1.5 text-[9px] font-semibold capitalize transition', dmStep === step ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500')}>{step === 'followup' ? 'Follow-up' : step}</button>
                ))}
              </div>
            </div>
            <div className="space-y-3 px-3 py-5">
              {dmStep === 'opening' && (
                <>
                  <PreviewMessage text={journey.openingMessage} button={journey.openingButtonText} />
                  <p className="px-2 text-[9px] leading-4 text-slate-400">This quick reply opens the normal Instagram messaging window.</p>
                </>
              )}
              {dmStep === 'link' && (
                <>
                  <PreviewMessage text={journey.linkMessage} />
                  <PreviewMessage text={journey.destinationUrl} icon={LinkSimple} />
                  <p className="px-2 text-[9px] leading-4 text-slate-400">Instagram can render the App Store image preview from this direct link.</p>
                </>
              )}
              {dmStep === 'followup' && visibleFollowUp && (
                <>
                  <div className="flex gap-1 overflow-x-auto pb-1">
                    {enabledFollowUps.map((key) => <button key={key} type="button" onClick={() => setPreviewFollowUp(key)} className={cn('min-w-max rounded-full px-2 py-1 text-[8px] font-semibold transition', visibleFollowUp === key ? 'bg-slate-950 text-white' : 'bg-white text-slate-500')}>{FOLLOW_UP_META[key].label}</button>)}
                  </div>
                  <p className="px-1 text-[9px] font-medium text-slate-400">After {formatMindsetDelay(journey.followUps[visibleFollowUp].delayMinutes)}</p>
                  <PreviewMessage text={journey.followUps[visibleFollowUp].message} />
                </>
              )}
              {dmStep === 'followup' && !visibleFollowUp && (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-[10px] leading-4 text-slate-500">No campaign follow-ups are enabled.</div>
              )}
            </div>
          </div>
        )}
      </div>

      {view === 'comment' && publicReplyEnabled && replies.length > 1 && (
        <div className="mt-3 flex items-center justify-center gap-1.5" aria-label={`${replies.length} public reply variations`}>
          {replies.map((_, index) => (
            <button key={index} type="button" onClick={() => setReplyIndex(index)} aria-label={`Preview reply ${index + 1}`} className={cn('h-1.5 rounded-full transition-all', index === replyIndex ? 'w-5 bg-emerald-700' : 'w-1.5 bg-slate-300')} />
          ))}
        </div>
      )}
    </div>
  );
}

function PreviewMessage({ text, button, icon: Icon }: { text: string; button?: string; icon?: typeof LinkSimple }) {
  return (
    <div className="max-w-[88%] rounded-2xl rounded-bl-md bg-white px-3 py-3 shadow-sm">
      <p className="whitespace-pre-wrap text-[11px] leading-4 text-slate-700">{text || 'Your message appears here.'}</p>
      {button && <div className="mt-3 flex items-center justify-center gap-1.5 border-t border-slate-100 pt-2 text-center text-[10px] font-semibold text-blue-600">{Icon && <Icon size={12} />}{button}</div>}
    </div>
  );
}

function JourneyRow({ number, icon: Icon, title, detail, last = false }: { number: string; icon: typeof Megaphone; title: string; detail: string; last?: boolean }) {
  return (
    <div className="relative flex gap-3 pb-5 last:pb-0">
      {!last && <span className="absolute left-[15px] top-8 h-[calc(100%-1.25rem)] w-px bg-slate-200" />}
      <span className="relative z-[1] grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-emerald-700"><Icon size={16} weight="fill" /></span>
      <div><p className="text-sm font-semibold text-slate-900"><span className="mr-1.5 text-xs text-slate-400">{number}.</span>{title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p></div>
    </div>
  );
}

function effectiveCampaignPostMode(campaign: MindsetCampaign): MindsetCampaignPostMode {
  if (campaign.postMode === 'any' || campaign.postMode === 'specific' || campaign.postMode === 'next') {
    return campaign.postMode;
  }
  return campaign.postIds.length > 0 ? 'specific' : 'any';
}

function isSafeHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

function mindsetDestinationHost(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return 'the configured app page';
  }
}

function campaignPostScopeLabel(campaign: MindsetCampaign): string {
  const postMode = effectiveCampaignPostMode(campaign);
  if (postMode === 'next') return campaign.nextPostId ? 'Next post locked' : 'Next post waiting';
  if (postMode === 'specific') return `${campaign.postIds.length} selected`;
  return 'All posts';
}

function campaignPostScopeDetail(campaign: MindsetCampaign): string {
  const postMode = effectiveCampaignPostMode(campaign);
  if (postMode === 'next') {
    return campaign.nextPostId
      ? 'The first post published after activation is now the only target'
      : 'The first new post or reel published after activation becomes the only target';
  }
  if (postMode === 'specific') {
    return `${campaign.postIds.length} selected Instagram post${campaign.postIds.length === 1 ? '' : 's'}`;
  }
  return 'Any current or future Instagram post';
}

function SummaryItem({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="border-l-2 border-slate-200 pl-3"><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">{label}</p><p className={cn('mt-1 text-sm font-semibold text-slate-900', mono && 'font-mono')}>{value}</p></div>;
}

function SelectedPostStrip({ posts }: { posts: InstagramPost[] }) {
  return (
    <div className="mt-7">
      <p className="text-xs font-semibold text-slate-700">Selected posts</p>
      <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
        {posts.map((post) => {
          const imageUrl = post.thumbnailUrl || post.mediaUrl;
          return <div key={post.id} className="h-16 w-16 flex-shrink-0 rounded-lg border border-slate-200 bg-slate-100 bg-cover bg-center" style={imageUrl ? { backgroundImage: `url(${imageUrl})` } : undefined} />;
        })}
      </div>
    </div>
  );
}

function FieldHint({ invalid, children }: { invalid: boolean; children: React.ReactNode }) {
  return <p className={cn('mt-1.5 text-[11px] leading-4', invalid ? 'font-medium text-red-700' : 'text-slate-500')}>{children}</p>;
}

function ValidationLine({ valid, label }: { valid: boolean; label: string }) {
  return <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-xs font-medium text-slate-700"><span className={cn('grid h-4 w-4 place-items-center rounded-full', valid ? 'bg-emerald-700 text-white' : 'border border-slate-300 text-transparent')}><Check size={10} weight="bold" /></span>{label}</div>;
}

function Toggle({ enabled, onToggle, label }: { enabled: boolean; onToggle: () => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={enabled} onClick={onToggle} className={cn('relative h-6 w-11 flex-shrink-0 rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 active:scale-[0.98]', enabled ? 'bg-emerald-700' : 'bg-slate-300')}>
      <span className={cn('absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform', enabled ? 'translate-x-5' : 'translate-x-0')} />
      <span className="sr-only">{label}</span>
    </button>
  );
}

function AccountAvatar({ username }: { username: string }) {
  return <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-slate-950 text-[10px] font-bold uppercase text-white">{username.charAt(0)}</span>;
}

function ModeButton({ selected, icon: Icon, label, detail, onClick }: { selected: boolean; icon: typeof Lightning; label: string; detail: string; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={selected} onClick={onClick} className={cn('flex w-full min-w-0 items-center gap-2.5 rounded-xl border px-3 py-3 text-left transition active:scale-[0.99]', selected ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50')}>
      <span className={cn('grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg', selected ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-500')}><Icon size={16} weight={selected ? 'fill' : 'regular'} /></span>
      <span className="min-w-0"><span className="block text-xs font-semibold text-slate-900">{label}</span><span className="mt-0.5 block text-[10px] leading-4 text-slate-500">{detail}</span></span>
    </button>
  );
}

function PostGrid({ posts, selectedPostIds, loading, onToggle }: { posts: InstagramPost[]; selectedPostIds: string[]; loading: boolean; onToggle: (postId: string) => void }) {
  const [showAllPosts, setShowAllPosts] = useState(false);
  if (loading) return <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((item) => <div key={item} className="aspect-square animate-pulse rounded-xl bg-slate-100" />)}</div>;
  if (!posts.length) return <div className="mt-3 rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-xs text-slate-500">No recent Instagram posts were returned.</div>;

  const visiblePosts = showAllPosts ? posts : posts.slice(0, 6);
  return (
    <div className="mt-3 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">{selectedPostIds.length} of {posts.length} selected</p>
        {selectedPostIds.length > 0 && <button type="button" onClick={() => selectedPostIds.forEach(onToggle)} className="text-xs font-semibold text-slate-600 hover:text-slate-950">Clear selection</button>}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {visiblePosts.map((post, index) => {
          const selected = selectedPostIds.includes(post.id);
          const imageUrl = post.thumbnailUrl || post.mediaUrl;
          return (
            <button key={post.id} type="button" onClick={() => onToggle(post.id)} aria-pressed={selected} aria-label={`${selected ? 'Remove' : 'Add'} ${post.caption || `Instagram post ${index + 1}`}`} className={cn('group relative aspect-square overflow-hidden rounded-xl border p-3 text-left transition active:scale-[0.98]', selected ? 'border-emerald-500 ring-2 ring-emerald-100' : 'border-slate-200 hover:border-slate-400')} style={imageUrl ? { backgroundImage: `url(${imageUrl})`, backgroundPosition: 'center', backgroundSize: 'cover' } : undefined}>
              <span className={cn('absolute inset-0', imageUrl ? 'bg-gradient-to-t from-slate-950/90 via-slate-950/25 to-transparent' : 'bg-slate-100')} />
              <span className={cn('absolute bottom-2 left-2 z-10 rounded-md px-1.5 py-1 text-[9px] font-bold uppercase tracking-wide', imageUrl ? 'bg-slate-950/65 text-white' : 'bg-white text-slate-500')}>{post.mediaType.replace('_', ' ')}</span>
              <span className={cn('absolute right-2 top-2 z-10 grid h-6 w-6 place-items-center rounded-full border transition', selected ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-white/70 bg-white text-transparent')}><Check size={14} weight="bold" /></span>
            </button>
          );
        })}
      </div>
      {posts.length > 6 && <button type="button" onClick={() => setShowAllPosts((current) => !current)} className="w-full rounded-lg border border-slate-200 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-950">{showAllPosts ? 'Show fewer posts' : `Show all ${posts.length} posts`}</button>}
    </div>
  );
}

function CampaignStatus({ status }: { status: MindsetCampaignStatus }) {
  const className = status === 'live' || status === 'test' ? 'bg-emerald-100 text-emerald-800' : status === 'draft' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600';
  return <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]', className)}>{status}</span>;
}

function EmptyWorkspace({ onNew }: { onNew: () => void }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-20 text-center"><Megaphone size={32} className="mx-auto text-slate-300" /><p className="mt-3 font-semibold text-slate-900">Create your first comment automation</p><p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-slate-500">Choose a keyword and post scope. The tested DM journey is already connected.</p><button type="button" onClick={onNew} className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white"><Plus size={16} weight="bold" />New automation</button></div>;
}

function CampaignsSkeleton() {
  return <div className="space-y-5 animate-pulse"><div className="h-24 max-w-2xl rounded-2xl bg-slate-200" /><div className="h-14 rounded-2xl bg-white" /><div className="grid gap-5 lg:grid-cols-[330px_1fr]"><div className="h-96 rounded-2xl bg-white" /><div className="h-[560px] rounded-2xl bg-white" /></div></div>;
}

function CampaignListSkeleton() {
  return <div>{[0, 1, 2].map((item) => <div key={item} className="flex animate-pulse gap-3 border-b border-slate-100 p-4"><div className="h-10 w-10 rounded-xl bg-slate-100" /><div className="flex-1 space-y-2"><div className="h-3 w-36 rounded bg-slate-100" /><div className="h-3 w-24 rounded bg-slate-100" /></div></div>)}</div>;
}

function NoAccountState() {
  return <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center"><Megaphone size={32} className="mx-auto text-slate-300" /><p className="mt-3 font-semibold text-slate-900">Connect @sondre_pv before creating automations.</p></div>;
}
