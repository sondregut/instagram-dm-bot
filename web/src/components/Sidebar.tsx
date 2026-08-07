'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ChatCircleDots,
  ChatsCircle,
  Gauge,
  GearSix,
  Flask,
  InstagramLogo,
  Megaphone,
  ShieldCheck,
  SignOut,
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useAccount } from '@/components/AccountSelector';
import { isDashboardReviewMode } from '@/lib/mindsetReview';

const navigation = [
  { name: 'Overview', shortName: 'Overview', href: '/', icon: Gauge },
  { name: 'Campaigns', shortName: 'Campaigns', href: '/campaigns', icon: Megaphone },
  { name: 'Live inbox', shortName: 'Inbox', href: '/conversations', icon: ChatsCircle },
  { name: 'Test Lab', shortName: 'Test', href: '/test-lab', icon: Flask },
  { name: 'Settings', shortName: 'Settings', href: '/settings', icon: GearSix },
];

function isActiveRoute(pathname: string, href: string): boolean {
  return href === '/'
    ? pathname === '/'
    : pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut, user } = useAuth();
  const { accounts, selectedAccount, selectAccount, isLoading } = useAccount();
  const reviewMode = isDashboardReviewMode();

  const handleSignOut = async () => {
    if (!reviewMode) await signOut();
    router.push('/login');
  };

  return (
    <>
      <aside className="sticky top-0 hidden h-[100dvh] w-[268px] flex-shrink-0 flex-col bg-slate-950 text-white md:flex">
        <div className="flex h-[76px] items-center gap-3 border-b border-white/10 px-5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-400 text-slate-950">
            <ChatCircleDots size={22} weight="fill" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Athlete Mindset</p>
            <p className="text-xs text-slate-400">DM operations</p>
          </div>
        </div>

        <div className="px-4 pt-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
            {isLoading ? (
              <div className="h-9 animate-pulse rounded-lg bg-white/10" />
            ) : accounts.length > 0 ? (
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-white text-sm font-bold text-slate-950">
                  <InstagramLogo size={19} weight="bold" />
                </span>
                <div className="min-w-0 flex-1">
                  {accounts.length === 1 ? (
                    <p className="truncate text-sm font-semibold">@{accounts[0].username}</p>
                  ) : (
                    <select
                      value={selectedAccount?.id || ''}
                      onChange={(event) => selectAccount(event.target.value)}
                      aria-label="Instagram account"
                      className="w-full appearance-none bg-transparent text-sm font-semibold text-white outline-none"
                    >
                      {accounts.map((account) => (
                        <option key={account.id} value={account.id} className="bg-slate-950">
                          @{account.username}
                        </option>
                      ))}
                    </select>
                  )}
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    Instagram connected
                  </p>
                </div>
              </div>
            ) : (
              <Link href="/settings" className="text-sm font-semibold text-emerald-300">
                Connect Instagram
              </Link>
            )}
          </div>
        </div>

        {reviewMode && (
          <div className="mx-4 mt-3 rounded-xl border border-emerald-300/20 bg-emerald-300/10 px-3 py-2.5">
            <div className="flex items-center gap-2 text-emerald-200">
              <ShieldCheck size={16} weight="bold" />
              <span className="text-xs font-semibold">Local preview</span>
            </div>
            <p className="mt-1.5 text-[11px] leading-4 text-slate-400">Sample data. No Instagram messages are sent.</p>
          </div>
        )}

        <nav className="mt-4 flex-1 space-y-1 px-3" aria-label="Dashboard navigation">
          {navigation.map((item) => {
            const active = isActiveRoute(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition',
                  active
                    ? 'bg-white text-slate-950'
                    : 'text-slate-400 hover:bg-white/[0.06] hover:text-white'
                )}
              >
                <item.icon size={20} weight={active ? 'fill' : 'regular'} />
                {item.name}
                {item.href === '/conversations' && (
                  <span className="ml-auto rounded-full bg-emerald-400 px-2 py-0.5 text-[10px] font-bold text-slate-950">LIVE</span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-4">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-slate-800 text-xs font-bold text-slate-200">SG</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{reviewMode ? 'Sondre' : user?.email || 'Dashboard user'}</p>
              <p className="text-xs text-slate-500">Owner</p>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              aria-label="Sign out"
              title="Sign out"
              className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-white"
            >
              <SignOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      <nav className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-slate-200 bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-12px_30px_-26px_rgba(15,23,42,0.35)] backdrop-blur md:hidden" aria-label="Mobile dashboard navigation">
        {navigation.map((item) => {
          const active = isActiveRoute(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-semibold',
                active ? 'text-emerald-700' : 'text-slate-500'
              )}
            >
              <item.icon size={21} weight={active ? 'fill' : 'regular'} />
              {item.shortName}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
