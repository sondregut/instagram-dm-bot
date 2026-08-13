'use client';

import { FormEvent, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  ArrowCounterClockwise,
  CheckCircle,
  Flask,
  PaperPlaneTilt,
  Robot,
  ShieldCheck,
  UserCircle,
  Warning,
} from '@phosphor-icons/react';
import { useAccount } from '@/components/AccountSelector';
import {
  MindsetConversationStage,
  MindsetTestTurnResult,
} from '@/lib/firebase';
import { simulateMindsetConversation } from '@/lib/mindsetData';
import { mindsetStageLabel } from '@/lib/mindsetPresentation';
import { cn } from '@/lib/utils';

interface LabMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface LabTurn {
  message: string;
}

const stageOptions: MindsetConversationStage[] = [
  'awaiting_download_status',
  'awaiting_use_status',
  'awaiting_feedback',
  'awaiting_subscription_status',
  'trial_claimed',
  'subscription_claimed',
  'trial_started',
  'subscribed',
  'ai_follow_up',
];

const scenarios = [
  { label: 'Price objection', message: 'I like it, but it is too expensive for me.' },
  { label: 'Already paid', message: 'I already paid and subscribed.' },
  { label: 'Link problem', message: 'The download link does not work.' },
  { label: 'Send link again', message: 'Send it again' },
  { label: 'Did not use it', message: "I downloaded it, but I didn't use it yet." },
  { label: 'App and sport fit', message: 'Does this work for pole vaulters too?' },
  { label: 'Different topic', message: 'What poles and spikes do you use?' },
  { label: 'Mixed topic', message: 'Thanks for the app link. What poles do you use?' },
  { label: 'Refund request', message: 'I was charged twice and need a refund.' },
];

export default function TestLabPage() {
  const { selectedAccount, accounts, isLoading: accountsLoading } = useAccount();
  const [stage, setStage] = useState<MindsetConversationStage>('awaiting_download_status');
  const [draft, setDraft] = useState('');
  const [transcript, setTranscript] = useState<LabMessage[]>([]);
  const [lastResult, setLastResult] = useState<MindsetTestTurnResult | null>(null);
  const mutation = useMutation({
    mutationFn: ({ message }: LabTurn) => simulateMindsetConversation({
      accountId: selectedAccount!.id,
      stage,
      message,
      history: transcript,
    }),
    onSuccess: (result, turn) => {
      setTranscript((current) => [
        ...current,
        { role: 'user', content: turn.message },
        ...[result.reply, ...(result.additionalReplies || [])]
          .filter((reply) => reply.trim())
          .map((reply) => ({ role: 'assistant' as const, content: reply })),
      ]);
      setStage(result.nextStage);
      setLastResult(result);
      setDraft('');
    },
  });

  const runMessage = (message: string) => {
    const trimmed = message.trim();
    if (!trimmed || mutation.isPending || !selectedAccount) return;
    mutation.mutate({ message: trimmed });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    runMessage(draft);
  };

  const reset = () => {
    mutation.reset();
    setTranscript([]);
    setLastResult(null);
    setStage('awaiting_download_status');
    setDraft('');
  };

  if (accountsLoading) return <div className="h-[720px] animate-pulse rounded-2xl bg-white" />;
  if (accounts.length === 0 || !selectedAccount) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center"><Flask size={32} className="mx-auto text-slate-300" /><p className="mt-3 font-semibold text-slate-900">Connect @sondre_pv to use the Test Lab.</p></div>;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
            <ShieldCheck size={18} weight="fill" />
            Safe conversation testing
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-slate-950">Test Lab</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Try realistic messages against the Athlete Mindset conversation flow. Nothing here sends an Instagram DM or changes a real conversation.</p>
        </div>
        <button type="button" onClick={reset} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 active:scale-[0.98]">
          <ArrowCounterClockwise size={17} />
          Reset test
        </button>
      </header>

      <section className="grid min-h-[650px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_70px_-52px_rgba(15,23,42,0.5)] xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="flex min-h-[650px] min-w-0 flex-col">
          <div className="border-b border-slate-200 px-5 py-4">
            <label className="block max-w-sm">
              <span className="text-xs font-semibold text-slate-700">Starting conversation stage</span>
              <select
                value={stage}
                onChange={(event) => {
                  setStage(event.target.value as MindsetConversationStage);
                  setTranscript([]);
                  setLastResult(null);
                }}
                className="mt-2 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
              >
                {stageOptions.map((option) => <option key={option} value={option}>{mindsetStageLabel(option)}</option>)}
              </select>
            </label>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto bg-[#f7f7f4] px-4 py-6 sm:px-6">
            {transcript.length === 0 ? (
              <div className="mx-auto max-w-md py-14 text-center">
                <Flask size={38} className="mx-auto text-slate-300" />
                <p className="mt-4 font-semibold text-slate-900">Start with a realistic athlete reply</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">Use one of the test cases or write anything an Instagram user might send.</p>
              </div>
            ) : transcript.map((message, index) => {
              const assistant = message.role === 'assistant';
              return (
                <div key={`${index}-${message.content}`} className={cn('flex gap-2.5', assistant ? 'justify-end' : 'justify-start')}>
                  {!assistant && <span className="mt-auto grid h-8 w-8 place-items-center rounded-full border border-slate-200 bg-white text-slate-500"><UserCircle size={18} weight="fill" /></span>}
                  <div className={cn('max-w-[82%] sm:max-w-[70%]', assistant && 'text-right')}>
                    <p className="mb-1 px-1 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">{assistant ? 'Athlete Mindset' : 'Test athlete'}</p>
                    <p className={cn('inline-block rounded-2xl px-3.5 py-2.5 text-left text-sm leading-6 shadow-sm', assistant ? 'rounded-br-md bg-emerald-700 text-white' : 'rounded-bl-md border border-slate-200 bg-white text-slate-800')}>{message.content}</p>
                  </div>
                  {assistant && <span className="mt-auto grid h-8 w-8 place-items-center rounded-full bg-slate-950 text-emerald-300"><Robot size={17} weight="fill" /></span>}
                </div>
              );
            })}
          </div>

          <div className="border-t border-slate-200 bg-white p-4 sm:p-5">
            <form onSubmit={handleSubmit}>
              <label htmlFor="test-message" className="block text-xs font-semibold text-slate-700">Athlete message</label>
              <div className="mt-2 flex gap-2">
                <textarea
                  id="test-message"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  rows={2}
                  maxLength={500}
                  placeholder="Example: I downloaded it but haven't used it"
                  className="min-w-0 flex-1 resize-none rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm leading-5 text-slate-900 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                />
                <button type="submit" disabled={!draft.trim() || mutation.isPending} className="inline-flex w-24 flex-shrink-0 items-center justify-center gap-1.5 rounded-xl bg-slate-950 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 active:scale-[0.98]">
                  <PaperPlaneTilt size={16} weight="fill" />
                  {mutation.isPending ? 'Testing…' : 'Test'}
                </button>
              </div>
              {mutation.error && <p role="alert" className="mt-2 flex items-center gap-1.5 text-xs font-medium text-red-700"><Warning size={15} weight="fill" />{mutation.error.message}</p>}
            </form>
          </div>
        </div>

        <aside className="border-t border-slate-200 p-5 xl:border-l xl:border-t-0">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Current outcome</p>
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs text-slate-500">Conversation stage</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{mindsetStageLabel(stage)}</p>
          </div>
          {lastResult?.createsHandoff && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
              <div className="flex items-center gap-2 text-sm font-semibold"><Warning size={17} weight="fill" />Sondre takes over</div>
              <p className="mt-1 text-xs leading-5 text-amber-800">No automated reply would be sent. The automation would pause and place this conversation in Needs me.</p>
              {lastResult.handoffReason && (
                <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-700">
                  {lastResult.handoffReason.replace(/_/g, ' ')}
                </p>
              )}
            </div>
          )}
          {lastResult && !lastResult.createsHandoff && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
              <CheckCircle size={18} weight="fill" className="mt-0.5 flex-shrink-0" />
              <p className="text-xs leading-5">The conversation can continue safely from the new stage.</p>
            </div>
          )}

          <div className="mt-6 border-t border-slate-200 pt-6">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Useful test cases</p>
            <div className="mt-3 space-y-2">
              {scenarios.map((scenario) => (
                <button key={scenario.label} type="button" onClick={() => runMessage(scenario.message)} disabled={mutation.isPending} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-left transition hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50 active:scale-[0.98]">
                  <span className="block text-xs font-semibold text-slate-900">{scenario.label}</span>
                  <span className="mt-0.5 block line-clamp-1 text-[11px] text-slate-500">{scenario.message}</span>
                </button>
              ))}
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}
