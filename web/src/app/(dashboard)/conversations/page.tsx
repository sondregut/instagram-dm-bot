'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowSquareOut,
  Broadcast,
  CheckCircle,
  ChatsCircle,
  Circle,
  Clock,
  MagnifyingGlass,
  PaperPlaneTilt,
  Pause,
  Play,
  Robot,
  Timer,
  UserCircle,
  Warning,
} from '@phosphor-icons/react';
import { useAccount } from '@/components/AccountSelector';
import { InstagramAvatar } from '@/components/InstagramAvatar';
import { MindsetConversation, MindsetConversationStage } from '@/lib/firebase';
import {
  loadMindsetInbox,
  sendMindsetHumanReply,
  setMindsetAutomation,
} from '@/lib/mindsetData';
import { isDashboardReviewMode } from '@/lib/mindsetReview';
import {
  formatRelativeTimestamp,
  formatTimestamp,
  latestConversationMessage,
  mindsetStageLabel,
  mindsetStageTone,
} from '@/lib/mindsetPresentation';
import { cn } from '@/lib/utils';

type InboxFilter = 'all' | 'active' | 'handoff' | 'converted';

const filters: Array<{ id: InboxFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'handoff', label: 'Needs me' },
  { id: 'converted', label: 'Converted' },
];

export default function ConversationsPage() {
  const { selectedAccount, accounts, isLoading: accountsLoading } = useAccount();
  const queryClient = useQueryClient();
  const reviewMode = isDashboardReviewMode();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const initializedSelection = useRef(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<InboxFilter>('all');
  const replyMutation = useMutation({
    mutationFn: ({ conversationId, message }: { conversationId: string; message: string }) =>
      sendMindsetHumanReply(selectedAccount!.id, conversationId, message),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mindset-inbox', selectedAccount?.id] }),
  });
  const automationMutation = useMutation({
    mutationFn: ({ conversationId, paused }: { conversationId: string; paused: boolean }) =>
      setMindsetAutomation(selectedAccount!.id, conversationId, paused),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mindset-inbox', selectedAccount?.id] }),
  });
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['mindset-inbox', selectedAccount?.id],
    queryFn: () => loadMindsetInbox(selectedAccount!.id),
    enabled: Boolean(selectedAccount),
    refetchInterval: reviewMode ? false : 5_000,
  });

  const conversations = data?.conversations || [];
  const filteredConversations = useMemo(() => {
    const query = search.trim().toLowerCase();
    return conversations.filter((conversation) => {
      const matchesSearch = !query
        || conversation.username.toLowerCase().includes(query)
        || latestConversationMessage(conversation).toLowerCase().includes(query)
        || conversation.keyword.toLowerCase().includes(query)
        || (conversation.campaignName || '').toLowerCase().includes(query)
        || (conversation.previousBotState || '').toLowerCase().includes(query);
      if (!matchesSearch) return false;
      if (filter === 'handoff') return !isPreviousBotConversation(conversation) && (Boolean(conversation.handoff)
        || conversation.stage === 'human_handoff'
        || conversation.automation.paused);
      if (filter === 'converted') return !isPreviousBotConversation(conversation)
        && (conversation.stage === 'trial_started' || conversation.stage === 'subscribed');
      if (filter === 'active' && isPreviousBotConversation(conversation)) {
        return conversation.previousBotState !== 'completed';
      }
      if (filter === 'active') return ![
        'human_handoff',
        'trial_claimed',
        'subscription_claimed',
        'trial_started',
        'subscribed',
        'completed',
      ].includes(conversation.stage);
      return true;
    });
  }, [conversations, filter, search]);

  useEffect(() => {
    if (initializedSelection.current || conversations.length === 0) return;
    const requestedId = new URLSearchParams(window.location.search).get('conversation');
    initializedSelection.current = true;
    setSelectedId(
      requestedId && conversations.some((conversation) => conversation.id === requestedId)
        ? requestedId
        : conversations[0].id
    );
  }, [conversations]);

  const selectedConversation = conversations.find((conversation) => conversation.id === selectedId) || null;

  if (accountsLoading) return <InboxSkeleton />;
  if (accounts.length === 0 || !selectedAccount) return <EmptyAccount />;

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-emerald-700">Conversation workspace</p>
            <span className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em]',
              reviewMode ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'
            )}>
              <span className={cn('h-1.5 w-1.5 rounded-full', reviewMode ? 'bg-emerald-500' : 'animate-pulse bg-red-500')} />
              {reviewMode ? 'Preview' : 'Live'}
            </span>
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-slate-950">Live inbox</h1>
          <p className="mt-2 text-sm text-slate-600">Follow every reply, milestone, scheduled check-in, and human handoff.</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Broadcast size={16} className={isFetching ? 'animate-pulse text-emerald-600' : 'text-slate-400'} />
          <span>
            {reviewMode
              ? `${conversations.length} preview conversations`
              : `${data?.summary?.total ?? conversations.length} conversations`}
          </span>
          <span aria-hidden="true">•</span>
          <span>{reviewMode ? 'Local preview data' : `Updated ${formatRelativeTimestamp(data?.refreshedAt || null)}`}</span>
          <button type="button" onClick={() => refetch()} className="font-semibold text-slate-700 underline decoration-slate-300 underline-offset-4 hover:text-slate-950">Refresh</button>
        </div>
      </header>

      {isError && (
        <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span className="flex items-center gap-2"><Warning size={18} weight="fill" />The inbox could not reach the bot backend.</span>
          <button type="button" onClick={() => refetch()} className="font-semibold">Try again</button>
        </div>
      )}

      {!reviewMode && data?.summary && (
        !data.summary.mindsetDataAvailable
        || !data.summary.previousBotDataAvailable
        || !data.summary.mindsetDataComplete
        || !data.summary.previousDataComplete
      ) && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Warning size={18} weight="fill" className="mt-0.5 flex-shrink-0" />
          <span>
            Showing all currently available conversations.{' '}
            {!data.summary.mindsetDataAvailable
              ? 'The Athlete Mindset funnel source could not be reached.'
              : !data.summary.previousBotDataAvailable
                ? 'The earlier bot archive could not be reached.'
                : 'The inbox reached its safe loading limit before every stored conversation was returned.'}
          </span>
        </div>
      )}

      <section className="min-h-[680px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_70px_-52px_rgba(15,23,42,0.5)] lg:grid lg:h-[calc(100dvh-200px)] lg:max-h-[850px] lg:grid-cols-[380px_minmax(0,1fr)]">
        <div className={cn('border-slate-200 lg:flex lg:h-full lg:min-h-0 lg:flex-col lg:border-r', selectedConversation ? 'hidden lg:flex' : 'block')}>
          <div className="border-b border-slate-200 p-4">
            <label className="relative block">
              <span className="sr-only">Search conversations</span>
              <MagnifyingGlass size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search people or messages"
                className="h-10 w-full rounded-xl border border-slate-300 bg-slate-50 pl-10 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-100"
              />
            </label>
            <div className="mt-3 flex gap-1 overflow-x-auto" role="tablist" aria-label="Conversation filter">
              {filters.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={filter === item.id}
                  onClick={() => setFilter(item.id)}
                  className={cn(
                    'whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-semibold transition',
                    filter === item.id ? 'bg-slate-950 text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <p className="mt-3 text-[11px] font-medium text-slate-400">
              Showing {filteredConversations.length} of {conversations.length} conversations
              {!reviewMode && data?.summary?.previousBotOnly
                ? `, including ${data.summary.previousBotOnly} from the earlier bot`
                : ''}
            </p>
          </div>

          <div className="overflow-y-auto lg:min-h-0 lg:flex-1">
            {isLoading ? (
              <ConversationListSkeleton />
            ) : filteredConversations.length ? (
              filteredConversations.map((conversation) => (
                <ConversationListItem
                  key={conversation.id}
                  conversation={conversation}
                  selected={conversation.id === selectedId}
                  onSelect={() => {
                    setSelectedId(conversation.id);
                    window.scrollTo({ top: 0, behavior: 'auto' });
                  }}
                />
              ))
            ) : (
              <div className="px-6 py-16 text-center">
                <ChatsCircle size={30} className="mx-auto text-slate-300" />
                <p className="mt-3 text-sm font-semibold text-slate-800">No matching conversations</p>
                <p className="mt-1 text-xs text-slate-500">Try a different search or filter.</p>
              </div>
            )}
          </div>
        </div>

        <div className={cn('min-w-0 lg:h-full lg:min-h-0', selectedConversation ? 'block' : 'hidden lg:block')}>
          {selectedConversation ? (
            <ConversationDetail
              key={selectedConversation.id}
              conversation={selectedConversation}
              reviewMode={reviewMode}
              replyPending={replyMutation.isPending}
              controlPending={automationMutation.isPending}
              actionError={replyMutation.error || automationMutation.error}
              onReply={(message) => replyMutation.mutateAsync({
                conversationId: selectedConversation.id,
                message,
              })}
              onToggleAutomation={(paused) => automationMutation.mutateAsync({
                conversationId: selectedConversation.id,
                paused,
              })}
              onBack={() => {
                setSelectedId(null);
                window.scrollTo({ top: 0, behavior: 'auto' });
              }}
            />
          ) : (
            <div className="grid min-h-[680px] place-items-center px-6 text-center">
              <div>
                <ChatsCircle size={40} className="mx-auto text-slate-300" />
                <p className="mt-4 font-semibold text-slate-900">Choose a conversation</p>
                <p className="mt-1 text-sm text-slate-500">The full transcript and conversion trail will appear here.</p>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function ConversationListItem({ conversation, selected, onSelect }: {
  conversation: MindsetConversation;
  selected: boolean;
  onSelect: () => void;
}) {
  const tone = isPreviousBotConversation(conversation)
    ? conversation.previousBotState === 'completed' ? 'complete' : 'active'
    : mindsetStageTone(conversation.stage);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full border-b border-slate-100 px-4 py-4 text-left transition last:border-b-0',
        selected ? 'bg-emerald-50/70' : 'hover:bg-slate-50'
      )}
    >
      <div className="flex gap-3">
        <InstagramAvatar
          username={conversation.username}
          src={conversation.profilePictureUrl}
          fallbackClassName={tone === 'attention' ? 'bg-amber-100 text-amber-800' : undefined}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-sm font-semibold text-slate-950">@{conversation.username}</p>
            <span className="flex-shrink-0 text-[11px] text-slate-400">{formatRelativeTimestamp(conversation.updatedAt)}</span>
          </div>
          <p className="mt-1 truncate text-xs leading-5 text-slate-500">{latestConversationMessage(conversation)}</p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <ConversationBadge conversation={conversation} />
            {conversation.pendingFollowUps.length > 0 && (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-slate-500"><Timer size={12} />Follow-up queued</span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

function ConversationDetail({
  conversation,
  reviewMode,
  replyPending,
  controlPending,
  actionError,
  onReply,
  onToggleAutomation,
  onBack,
}: {
  conversation: MindsetConversation;
  reviewMode: boolean;
  replyPending: boolean;
  controlPending: boolean;
  actionError: Error | null;
  onReply: (message: string) => Promise<unknown>;
  onToggleAutomation: (paused: boolean) => Promise<unknown>;
  onBack: () => void;
}) {
  const [draft, setDraft] = useState('');
  const previousBotConversation = isPreviousBotConversation(conversation);
  const unansweredFollowUpCount = conversation.automation.unansweredFollowUpCount || 0;
  const maxUnansweredFollowUps = conversation.automation.maxUnansweredFollowUps || 2;
  const followUpLimitReached = unansweredFollowUpCount >= maxUnansweredFollowUps;
  const canSend = !previousBotConversation
    && conversation.automation.canReply
    && draft.trim().length > 0
    && draft.trim().length <= 500
    && !replyPending;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSend) return;
    await onReply(draft.trim());
    setDraft('');
  };

  return (
    <div className="grid min-h-[680px] lg:h-full lg:min-h-0 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex min-w-0 flex-col lg:min-h-0">
        <div className="flex min-h-[73px] items-center gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
          <button type="button" onClick={onBack} aria-label="Back to conversation list" className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-600 lg:hidden">
            <ArrowLeft size={18} />
          </button>
          <InstagramAvatar
            username={conversation.username}
            src={conversation.profilePictureUrl}
            fallbackClassName="bg-slate-950 text-white"
            eager
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate font-semibold text-slate-950">@{conversation.username}</h2>
              <ConversationBadge conversation={conversation} />
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              {conversation.keyword
                ? <>Keyword <span className="font-mono font-semibold text-slate-700">{conversation.keyword}</span></>
                : previousBotConversation
                  ? 'Earlier Instagram bot conversation'
                  : 'Instagram direct message'}
            </p>
          </div>
          <a
            href={`https://www.instagram.com/${encodeURIComponent(conversation.username)}/`}
            target="_blank"
            rel="noreferrer"
            className="hidden h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-400 sm:flex"
          >
            Instagram <ArrowSquareOut size={15} />
          </a>
        </div>

        {conversation.handoff && (
          <div className="mx-4 mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:mx-5">
            <Warning size={19} weight="fill" className="mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold">Sondre should take over this conversation.</p>
              <p className="mt-0.5 text-xs leading-5 text-amber-800">Reason: {conversation.handoff.reason?.replace(/_/g, ' ') || 'The bot requested a human reply.'}</p>
            </div>
          </div>
        )}

        <div className="flex-1 space-y-5 overflow-y-auto bg-[#f7f7f4] px-4 py-6 sm:px-6">
          {conversation.history.map((message, index) => {
            const isAssistant = message.role === 'assistant';
            const isHumanReply = isAssistant && message.source === 'human';
            return (
              <div key={`${message.at}-${index}`} className={cn('flex gap-2.5', isAssistant ? 'justify-end' : 'justify-start')}>
                {!isAssistant && (
                  <InstagramAvatar
                    username={conversation.username}
                    src={conversation.profilePictureUrl}
                    className="mt-auto h-7 w-7 text-[10px] shadow-sm"
                    fallbackClassName="bg-white text-slate-500"
                  />
                )}
                <div className={cn('max-w-[82%] sm:max-w-[72%]', isAssistant && 'text-right')}>
                  <p className="mb-1 px-1 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
                    {isHumanReply
                      ? 'Sondre'
                      : isAssistant
                        ? previousBotConversation ? 'Earlier bot' : 'Athlete Mindset'
                        : `@${conversation.username}`}
                  </p>
                  <div className={cn(
                    'inline-block rounded-2xl px-3.5 py-2.5 text-left text-sm leading-6 shadow-sm',
                    isAssistant
                      ? isHumanReply
                        ? 'rounded-br-md bg-slate-950 text-white'
                        : 'rounded-br-md bg-emerald-700 text-white'
                      : 'rounded-bl-md border border-slate-200 bg-white text-slate-800'
                  )}>
                    {message.content}
                  </div>
                  <p className="mt-1 px-1 text-[10px] text-slate-400">{formatTimestamp(message.at)}</p>
                </div>
                {isAssistant && (
                  <span className={cn(
                    'mt-auto grid h-7 w-7 flex-shrink-0 place-items-center rounded-full',
                    isHumanReply ? 'bg-slate-950 text-white' : 'bg-slate-950 text-emerald-300'
                  )}>
                    {isHumanReply ? <UserCircle size={17} weight="fill" /> : <Robot size={16} weight="fill" />}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {previousBotConversation ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-4 sm:px-5">
            <div>
              <p className="text-sm font-semibold text-slate-900">Earlier bot conversation</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">The complete stored transcript is available here. Replies and automation controls remain read-only for safety.</p>
            </div>
            <a
              href={`https://www.instagram.com/${encodeURIComponent(conversation.username)}/`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-400"
            >
              Open Instagram <ArrowSquareOut size={15} />
            </a>
          </div>
        ) : (
        <div className="border-t border-slate-200 bg-white px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2 text-xs text-slate-600">
              {conversation.automation.paused
                ? <UserCircle size={18} weight="fill" className="flex-shrink-0 text-amber-700" />
                : <Robot size={18} weight="fill" className="flex-shrink-0 text-emerald-700" />}
              <span className="font-semibold">
                {conversation.automation.paused
                  ? `Manual control, automation paused. ${unansweredFollowUpCount}/${maxUnansweredFollowUps} unanswered follow-ups sent.`
                  : followUpLimitReached
                    ? `Follow-up limit reached (${unansweredFollowUpCount}/${maxUnansweredFollowUps}). Waiting for an athlete reply.`
                    : `Automated follow-ups: ${unansweredFollowUpCount}/${maxUnansweredFollowUps} sent without a reply`}
              </span>
            </div>
            <button
              type="button"
              disabled={controlPending}
              onClick={() => onToggleAutomation(!conversation.automation.paused)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]"
            >
              {conversation.automation.paused ? <Play size={15} weight="fill" /> : <Pause size={15} weight="fill" />}
              {controlPending ? 'Saving…' : conversation.automation.paused ? 'Resume automation' : 'Pause automation'}
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-3 space-y-2">
            <label htmlFor={`reply-${conversation.id}`} className="block text-xs font-semibold text-slate-700">
              Reply personally as Sondre
            </label>
            <textarea
              id={`reply-${conversation.id}`}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              disabled={!conversation.automation.canReply || replyPending}
              maxLength={500}
              rows={2}
              placeholder={conversation.automation.canReply ? 'Write a direct, personal reply…' : 'Instagram messaging window closed'}
              className="w-full resize-none rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm leading-5 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-slate-100"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-slate-500">
                {reviewMode
                  ? 'Preview only. No Instagram message will be sent.'
                  : conversation.automation.canReply
                    ? `Standard reply window closes ${formatRelativeTimestamp(conversation.automation.messagingWindowEndsAt)}.`
                    : 'The standard Instagram reply window is closed.'}
              </p>
              <div className="flex items-center gap-2">
                <span className={cn('font-mono text-[10px]', draft.length > 450 ? 'text-amber-700' : 'text-slate-400')}>{draft.length}/500</span>
                <button
                  type="submit"
                  disabled={!canSend}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-950 px-3.5 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 active:scale-[0.98]"
                >
                  <PaperPlaneTilt size={15} weight="fill" />
                  {replyPending ? 'Sending…' : reviewMode ? 'Add preview reply' : 'Send reply'}
                </button>
              </div>
            </div>
            {actionError && <p role="alert" className="text-xs font-medium text-red-700">{actionError.message}</p>}
          </form>
        </div>
        )}
      </div>

      <aside className="border-t border-slate-200 bg-white p-5 xl:overflow-y-auto xl:border-l xl:border-t-0">
        {previousBotConversation ? (
          <>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Conversation status</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">{previousBotStateLabel(conversation.previousBotState)}</p>
              <p className="mt-2 text-xs leading-5 text-slate-500">This thread predates Athlete Mindset conversion tracking, so download and payment milestones are not available.</p>
            </div>
            <dl className="mt-6 space-y-3 border-t border-slate-200 pt-6 text-xs">
              <InfoRow label="Source" value="Earlier Instagram bot" />
              <InfoRow label="Messages" value={String(conversation.history.length)} />
              <InfoRow label="Started" value={formatRelativeTimestamp(conversation.createdAt)} />
              <InfoRow label="Last athlete reply" value={formatRelativeTimestamp(conversation.lastUserInteractionAt)} />
              <InfoRow label="Controls" value="View only" />
            </dl>
          </>
        ) : (
        <>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Next step</p>
          <p className="mt-2 text-sm font-semibold text-slate-900">{nextStepForStage(conversation.stage)}</p>
          {conversation.pendingFollowUps[0] && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
              <Clock size={15} />
              {conversation.pendingFollowUps[0].type.replace(/_/g, ' ')} {formatRelativeTimestamp(conversation.pendingFollowUps[0].dueAt)}
            </p>
          )}
        </div>

        <div className="mt-6 border-t border-slate-200 pt-6">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Conversion trail</p>
          <div className="mt-4 space-y-0.5">
            <Milestone label="Conversation started" timestamp={conversation.createdAt} complete />
            <Milestone label="Download link clicked" timestamp={conversation.milestones.downloadClickedAt} />
            <Milestone label="App opened" timestamp={conversation.milestones.appOpenedAt} />
            <Milestone label="First mental rep" timestamp={conversation.milestones.firstRepCompletedAt || conversation.milestones.firstRepStartedAt} />
            <Milestone label="Paywall viewed" timestamp={conversation.milestones.paywallViewedAt} />
            <Milestone label="Trial reported" timestamp={conversation.milestones.claimedTrialStartedAt} claimed />
            <Milestone label="Trial verified" timestamp={conversation.milestones.trialStartedAt} />
            <Milestone label="Payment reported" timestamp={conversation.milestones.claimedSubscribedAt} claimed />
            <Milestone label="Payment verified" timestamp={conversation.milestones.subscribedAt} last />
          </div>
        </div>

        <dl className="mt-6 space-y-3 border-t border-slate-200 pt-6 text-xs">
          <InfoRow label="Campaign" value={conversation.campaignName || 'System campaign'} />
          <InfoRow label="Feedback" value={conversation.feedbackReason || 'None yet'} />
          <InfoRow label="Last athlete reply" value={formatRelativeTimestamp(conversation.lastUserInteractionAt)} />
          <InfoRow label="Automation" value={conversation.automation.paused ? 'Paused for Sondre' : 'Running'} />
          <InfoRow label="Reply window" value={conversation.automation.canReply ? `Closes ${formatRelativeTimestamp(conversation.automation.messagingWindowEndsAt)}` : 'Closed'} />
        </dl>
        </>
        )}
      </aside>
    </div>
  );
}

function Milestone({ label, timestamp, complete = false, claimed = false, last = false }: { label: string; timestamp: string | null; complete?: boolean; claimed?: boolean; last?: boolean }) {
  const isComplete = complete || Boolean(timestamp);
  return (
    <div className="grid grid-cols-[18px_1fr] gap-2.5">
      <div className="flex flex-col items-center">
        {isComplete ? <CheckCircle size={17} weight="fill" className={claimed ? 'text-amber-500' : 'text-emerald-600'} /> : <Circle size={15} className="text-slate-300" />}
        {!last && <span className={cn('h-7 w-px', isComplete ? (claimed ? 'bg-amber-200' : 'bg-emerald-200') : 'bg-slate-200')} />}
      </div>
      <div>
        <p className={cn('text-xs font-semibold', isComplete ? (claimed ? 'text-amber-800' : 'text-slate-800') : 'text-slate-400')}>{label}</p>
        {timestamp && <p className="mt-0.5 text-[10px] text-slate-400">{formatTimestamp(timestamp)}</p>}
      </div>
    </div>
  );
}

function StageBadge({ stage }: { stage: MindsetConversationStage }) {
  const tone = mindsetStageTone(stage);
  const className = {
    active: 'bg-sky-50 text-sky-700',
    attention: 'bg-amber-100 text-amber-800',
    converted: 'bg-emerald-100 text-emerald-800',
    complete: 'bg-slate-100 text-slate-600',
  }[tone];
  return <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', className)}>{mindsetStageLabel(stage)}</span>;
}

function isPreviousBotConversation(conversation: MindsetConversation): boolean {
  return conversation.recordSource === 'previous_bot';
}

function previousBotStateLabel(state: MindsetConversation['previousBotState']): string {
  const labels: Record<NonNullable<MindsetConversation['previousBotState']>, string> = {
    greeting: 'Conversation started',
    collecting_email: 'Collecting email',
    collecting_phone: 'Collecting phone number',
    ai_chat: 'AI conversation',
    completed: 'Completed',
  };
  return state ? labels[state] : 'Earlier Instagram conversation';
}

function ConversationBadge({ conversation }: { conversation: MindsetConversation }) {
  if (!isPreviousBotConversation(conversation)) return <StageBadge stage={conversation.stage} />;
  const complete = conversation.previousBotState === 'completed';
  return (
    <span className={cn(
      'rounded-full px-2 py-0.5 text-[10px] font-bold',
      complete ? 'bg-slate-100 text-slate-600' : 'bg-violet-50 text-violet-700'
    )}>
      {previousBotStateLabel(conversation.previousBotState)}
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-3"><dt className="text-slate-500">{label}</dt><dd className="max-w-[160px] text-right font-semibold text-slate-800">{value}</dd></div>;
}

function nextStepForStage(stage: MindsetConversationStage): string {
  const nextSteps: Record<MindsetConversationStage, string> = {
    awaiting_link_request: 'Waiting for them to tap “Send me the link.”',
    link_sent: 'Waiting for a tracked download-link click.',
    link_clicked: 'Check whether they downloaded and opened the app.',
    awaiting_download_status: 'Help with any download or opening blocker.',
    awaiting_activation: 'Guide them into their first mental rep.',
    awaiting_use_status: 'Ask whether they completed their first mental rep.',
    awaiting_feedback: 'Learn whether the first mental rep helped.',
    awaiting_offer_status: 'Answer their offer question honestly.',
    awaiting_subscription_status: 'Help them make an informed purchase decision.',
    trial_claimed: 'Trial reported. Wait for a signed app event before counting it as verified.',
    subscription_claimed: 'Payment reported. Wait for RevenueCat verification before counting it as paid.',
    trial_started: 'Stop selling and help them get first-week value.',
    subscribed: 'Converted. Focus only on retention and value.',
    ai_follow_up: 'Continue helping with their current blocker.',
    human_handoff: 'Reply personally in Instagram.',
    completed: 'No further follow-up is scheduled.',
  };
  return nextSteps[stage];
}

function InboxSkeleton() {
  return <div className="h-[760px] animate-pulse rounded-2xl bg-white" />;
}

function ConversationListSkeleton() {
  return <div>{[0, 1, 2, 3, 4].map((item) => <div key={item} className="flex animate-pulse gap-3 border-b border-slate-100 p-4"><div className="h-10 w-10 rounded-full bg-slate-100" /><div className="flex-1 space-y-2"><div className="h-3 w-28 rounded bg-slate-100" /><div className="h-3 w-full rounded bg-slate-100" /><div className="h-3 w-20 rounded bg-slate-100" /></div></div>)}</div>;
}

function EmptyAccount() {
  return <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center"><ChatsCircle size={32} className="mx-auto text-slate-300" /><p className="mt-3 font-semibold text-slate-900">Connect @sondre_pv to open the inbox.</p></div>;
}
