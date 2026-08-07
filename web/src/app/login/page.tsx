'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, ChatCircleDots, LockKey, ShieldCheck } from '@phosphor-icons/react';
import { useAuth } from '@/hooks/useAuth';
import { isDashboardReviewMode } from '@/lib/mindsetReview';

export default function LoginPage() {
  const { signIn, resetPassword, isAuthenticated, loading } = useAuth();
  const router = useRouter();
  const reviewMode = isDashboardReviewMode();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && isAuthenticated) router.replace('/');
  }, [isAuthenticated, loading, router]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setIsSubmitting(true);
    try {
      await signIn(email.trim(), password);
      router.replace('/');
    } catch {
      setError('That email and password did not match the dashboard account.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = async () => {
    setError('');
    setNotice('');
    if (!email.trim()) {
      setError('Enter your dashboard email first.');
      return;
    }
    try {
      await resetPassword(email.trim());
      setNotice('Password reset email sent. Check your inbox.');
    } catch {
      setError('I could not send a reset email for that address.');
    }
  };

  return (
    <main className="grid min-h-[100dvh] bg-[#f4f5f1] lg:grid-cols-[1.1fr_0.9fr]">
      <section className="hidden border-r border-slate-200 bg-slate-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500 text-slate-950">
            <ChatCircleDots size={22} weight="fill" />
          </span>
          <div>
            <p className="font-semibold">Athlete Mindset</p>
            <p className="text-sm text-slate-400">Instagram DM operations</p>
          </div>
        </div>

        <div className="max-w-lg">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-300">Private operator workspace</p>
          <h1 className="mt-5 text-5xl font-semibold leading-[1.02] tracking-[-0.045em]">
            Turn comments into athletes who actually use the app.
          </h1>
          <p className="mt-6 max-w-md text-base leading-7 text-slate-300">
            Configure post campaigns, watch each conversation, and follow the journey from link click to paid conversion.
          </p>
        </div>

        <div className="flex items-center gap-2 text-sm text-slate-400">
          <ShieldCheck size={18} className="text-emerald-300" />
          Restricted to the @sondre_pv workspace
        </div>
      </section>

      <section className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-950 text-emerald-300">
              <ChatCircleDots size={22} weight="fill" />
            </span>
            <p className="mt-4 text-sm font-medium text-slate-500">Athlete Mindset DM operations</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_24px_70px_-44px_rgba(15,23,42,0.45)] sm:p-8">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
              <LockKey size={20} weight="bold" />
            </span>
            <h2 className="mt-5 text-2xl font-semibold tracking-[-0.025em] text-slate-950">Sign in to the dashboard</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Use the private Firebase dashboard account linked to @sondre_pv.
            </p>

            <form onSubmit={handleSubmit} className="mt-7 space-y-5">
              <label className="block">
                <span className="text-sm font-semibold text-slate-800">Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  required
                  className="mt-2 block h-11 w-full rounded-xl border border-slate-300 px-3.5 text-sm text-slate-950 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                  placeholder="you@example.com"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-800">Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                  minLength={6}
                  className="mt-2 block h-11 w-full rounded-xl border border-slate-300 px-3.5 text-sm text-slate-950 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                  placeholder="Enter your password"
                />
              </label>

              {error && <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-3 text-sm text-red-700">{error}</p>}
              {notice && <p role="status" className="rounded-xl bg-emerald-50 px-3.5 py-3 text-sm text-emerald-800">{notice}</p>}

              <button
                type="submit"
                disabled={isSubmitting}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? 'Signing in…' : 'Sign in'}
                {!isSubmitting && <ArrowRight size={17} weight="bold" />}
              </button>
            </form>

            <button
              type="button"
              onClick={handleReset}
              className="mt-4 w-full text-center text-sm font-medium text-slate-500 transition hover:text-slate-900"
            >
              Forgot your password?
            </button>
          </div>

          {reviewMode && (
            <button
              type="button"
              onClick={() => router.push('/')}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-100"
            >
              Open local dashboard preview
              <ArrowRight size={17} weight="bold" />
            </button>
          )}

          <p className="mt-5 text-center text-xs leading-5 text-slate-500">
            This is the bot dashboard login, not your Instagram password.
          </p>
        </div>
      </section>
    </main>
  );
}
