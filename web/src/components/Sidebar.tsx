'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Zap,
  MessageSquare,
  Users,
  Settings,
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { styles } from '@/lib/styles';
import { useAuth } from '@/hooks/useAuth';
import { useAccount } from '@/components/AccountSelector';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Automations', href: '/automations', icon: Zap },
  { name: 'Conversations', href: '/conversations', icon: MessageSquare },
  { name: 'Leads', href: '/leads', icon: Users },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { signOut, user } = useAuth();
  const { accounts, selectedAccount, selectAccount, isLoading } = useAccount();

  return (
    <div className="flex h-full w-56 flex-col bg-surface-raised border-r border-surface-border">
      {/* Logo */}
      <div className="flex h-14 items-center px-4 border-b border-surface-border">
        <span className="text-base font-semibold text-ink tracking-tight">DM Bot</span>
      </div>

      {/* Account Selector */}
      <div className="px-3 py-3 border-b border-surface-border">
        {isLoading ? (
          <div className="h-8 rounded-md bg-surface-sunken animate-pulse" />
        ) : accounts.length > 0 ? (
          <div className="rounded-md bg-surface-sunken p-2">
            {accounts.length === 1 ? (
              <div className="flex items-center gap-2 px-1">
                <div className={cn(styles.avatar.base, styles.avatar.sizes.sm)}>
                  {accounts[0].username.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm font-medium text-ink truncate">
                  @{accounts[0].username}
                </span>
                <StatusDot status={accounts[0].connectionStatus} />
              </div>
            ) : (
              <select
                value={selectedAccount?.id || ''}
                onChange={(e) => selectAccount(e.target.value)}
                className="w-full bg-transparent text-ink text-sm font-medium focus:outline-none cursor-pointer appearance-none px-1"
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    @{account.username}
                  </option>
                ))}
              </select>
            )}
          </div>
        ) : (
          <Link
            href="/settings"
            className="flex items-center justify-center gap-2 rounded-md border border-dashed border-surface-border p-2 text-sm text-ink-muted hover:border-ink-subtle hover:text-ink transition-colors"
          >
            <span>Connect Instagram</span>
          </Link>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 px-2 py-3">
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                styles.nav.item,
                isActive ? styles.nav.active : styles.nav.inactive
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      <div className="border-t border-surface-border p-3">
        <div className="flex items-center justify-between">
          <div className="truncate">
            <p className="text-sm font-medium text-ink truncate">
              {user?.email || 'User'}
            </p>
          </div>
          <button
            onClick={signOut}
            className="rounded-md p-1.5 text-ink-muted hover:bg-surface-sunken hover:text-ink transition-colors"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors = {
    connected: 'bg-status-success',
    expired: 'bg-status-warning',
    error: 'bg-status-error',
  };

  return (
    <div
      className={cn(
        'h-1.5 w-1.5 rounded-full ml-auto',
        colors[status as keyof typeof colors] || colors.error
      )}
      title={status}
    />
  );
}
