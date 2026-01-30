'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Zap,
  GitBranch,
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
  { name: 'Flows', href: '/flows', icon: GitBranch },
  { name: 'Conversations', href: '/conversations', icon: MessageSquare },
  { name: 'Leads', href: '/leads', icon: Users },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { signOut, user } = useAuth();
  const { accounts, selectedAccount, selectAccount, isLoading } = useAccount();

  return (
    <div className={styles.sidebar.base}>
      {/* Logo */}
      <div className={styles.sidebar.logo}>
        <div className={styles.sidebar.logoIcon} />
        <span className={cn('ml-3', styles.sidebar.logoText)}>DM Bot</span>
      </div>

      {/* Account Selector */}
      <div className="px-4 py-4">
        {isLoading ? (
          <div className="h-10 rounded-lg bg-gray-800 animate-pulse" />
        ) : accounts.length > 0 ? (
          <div className={styles.sidebar.accountBox}>
            {accounts.length === 1 ? (
              <div className="flex items-center gap-3 px-2">
                <div className={cn(styles.avatar.base, styles.avatar.sizes.sm)}>
                  {accounts[0].username.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm font-medium text-white truncate">
                  @{accounts[0].username}
                </span>
                <StatusDot status={accounts[0].connectionStatus} />
              </div>
            ) : (
              <select
                value={selectedAccount?.id || ''}
                onChange={(e) => selectAccount(e.target.value)}
                className="w-full bg-transparent text-white text-sm font-medium focus:outline-none cursor-pointer appearance-none px-2"
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id} className="bg-gray-800">
                    @{account.username}
                  </option>
                ))}
              </select>
            )}
          </div>
        ) : (
          <Link
            href="/settings"
            className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-gray-600 p-3 text-sm text-gray-400 hover:border-gray-500 hover:text-gray-300 transition-colors"
          >
            <span>Connect Instagram</span>
          </Link>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-2">
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
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      <div className="border-t border-gray-800 p-4">
        <div className="flex items-center justify-between">
          <div className="truncate">
            <p className="text-sm font-medium text-white truncate">
              {user?.email || 'User'}
            </p>
          </div>
          <button
            onClick={signOut}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
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
        'h-2 w-2 rounded-full ml-auto',
        colors[status as keyof typeof colors] || colors.error
      )}
      title={status}
    />
  );
}
