'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { cloudFunctions, InstagramAccount } from '@/lib/firebase';
import { cn } from '@/lib/utils';
import { styles } from '@/lib/styles';

// ============================================
// ACCOUNT CONTEXT
// ============================================

interface AccountContextType {
  accounts: InstagramAccount[];
  selectedAccount: InstagramAccount | null;
  selectAccount: (accountId: string) => void;
  isLoading: boolean;
  error: string | null;
  refetchAccounts: () => Promise<void>;
}

const AccountContext = createContext<AccountContextType | undefined>(undefined);

export function useAccount() {
  const context = useContext(AccountContext);
  if (context === undefined) {
    throw new Error('useAccount must be used within an AccountProvider');
  }
  return context;
}

// ============================================
// ACCOUNT PROVIDER
// ============================================

interface AccountProviderProps {
  children: ReactNode;
}

export function AccountProvider({ children }: AccountProviderProps) {
  const [accounts, setAccounts] = useState<InstagramAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAccounts = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await cloudFunctions.getUserAccounts();
      const fetchedAccounts = result.data;
      setAccounts(fetchedAccounts);

      // Restore selected account from localStorage or select first account
      const storedAccountId = localStorage.getItem('selectedAccountId');
      if (storedAccountId && fetchedAccounts.find(a => a.id === storedAccountId)) {
        setSelectedAccountId(storedAccountId);
      } else if (fetchedAccounts.length > 0) {
        setSelectedAccountId(fetchedAccounts[0].id);
        localStorage.setItem('selectedAccountId', fetchedAccounts[0].id);
      }
    } catch (err) {
      console.error('Failed to fetch accounts:', err);
      setError('Failed to load accounts');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const selectAccount = (accountId: string) => {
    setSelectedAccountId(accountId);
    localStorage.setItem('selectedAccountId', accountId);
  };

  const selectedAccount = accounts.find(a => a.id === selectedAccountId) || null;

  return (
    <AccountContext.Provider
      value={{
        accounts,
        selectedAccount,
        selectAccount,
        isLoading,
        error,
        refetchAccounts: fetchAccounts,
      }}
    >
      {children}
    </AccountContext.Provider>
  );
}

// ============================================
// ACCOUNT SELECTOR DROPDOWN
// ============================================

interface AccountSelectorProps {
  className?: string;
  showLabel?: boolean;
}

export function AccountSelector({ className, showLabel = true }: AccountSelectorProps) {
  const { accounts, selectedAccount, selectAccount, isLoading, error } = useAccount();

  if (isLoading) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <div className="h-6 w-6 rounded-full bg-surface-sunken animate-pulse" />
        <div className="h-4 w-24 bg-surface-sunken rounded animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('text-sm text-status-error', className)}>
        {error}
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className={cn('text-sm text-ink-muted', className)}>
        No accounts connected
      </div>
    );
  }

  // Single account - just display it
  if (accounts.length === 1) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <AccountAvatar account={accounts[0]} size="sm" />
        {showLabel && (
          <span className="text-sm font-medium text-ink">
            @{accounts[0].username}
          </span>
        )}
      </div>
    );
  }

  // Multiple accounts - show dropdown
  return (
    <div className={cn('relative', className)}>
      <select
        value={selectedAccount?.id || ''}
        onChange={(e) => selectAccount(e.target.value)}
        className="appearance-none bg-surface border border-surface-border rounded-md pl-8 pr-6 py-1.5 text-sm font-medium text-ink focus:outline-none focus:border-ink-muted cursor-pointer"
      >
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            @{account.username}
          </option>
        ))}
      </select>
      {selectedAccount && (
        <div className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none">
          <AccountAvatar account={selectedAccount} size="xs" />
        </div>
      )}
      <div className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none">
        <svg className="h-3.5 w-3.5 text-ink-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </div>
  );
}

// ============================================
// ACCOUNT AVATAR
// ============================================

interface AccountAvatarProps {
  account: InstagramAccount;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  showStatus?: boolean;
}

const sizeClasses = {
  xs: 'h-5 w-5 text-[10px]',
  sm: 'h-6 w-6 text-xs',
  md: 'h-8 w-8 text-sm',
  lg: 'h-10 w-10 text-base',
};

const statusSizeClasses = {
  xs: 'h-1.5 w-1.5',
  sm: 'h-2 w-2',
  md: 'h-2.5 w-2.5',
  lg: 'h-3 w-3',
};

const statusColors = {
  connected: 'bg-status-success',
  expired: 'bg-status-warning',
  error: 'bg-status-error',
};

export function AccountAvatar({ account, size = 'sm', showStatus = true }: AccountAvatarProps) {
  const initial = account.username.charAt(0).toUpperCase();

  return (
    <div className="relative inline-block">
      <div
        className={cn(
          styles.avatar.base,
          sizeClasses[size]
        )}
      >
        {initial}
      </div>
      {showStatus && (
        <div
          className={cn(
            'absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-surface',
            statusSizeClasses[size],
            statusColors[account.connectionStatus]
          )}
          title={account.connectionStatus}
        />
      )}
    </div>
  );
}

// ============================================
// ACCOUNT CARD
// ============================================

interface AccountCardProps {
  account: InstagramAccount;
  isSelected?: boolean;
  onClick?: () => void;
  showDetails?: boolean;
}

export function AccountCard({ account, isSelected, onClick, showDetails = false }: AccountCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 p-3 rounded-md border transition-all cursor-pointer',
        isSelected
          ? 'border-ink bg-surface-sunken'
          : 'border-surface-border hover:border-ink-subtle hover:bg-surface-sunken'
      )}
    >
      <AccountAvatar account={account} size="md" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium text-ink truncate">@{account.username}</p>
          {account.connectionStatus !== 'connected' && (
            <span
              className={cn(
                styles.badge.base,
                account.connectionStatus === 'expired'
                  ? styles.badge.warning
                  : styles.badge.error
              )}
            >
              {account.connectionStatus === 'expired' ? 'Token Expired' : 'Error'}
            </span>
          )}
        </div>
        {showDetails && account.pageName && (
          <p className="text-sm text-ink-muted truncate">{account.pageName}</p>
        )}
      </div>
      {isSelected && (
        <svg className="h-5 w-5 text-ink flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
            clipRule="evenodd"
          />
        </svg>
      )}
    </div>
  );
}

// ============================================
// NO ACCOUNT CONNECTED PROMPT
// ============================================

interface NoAccountPromptProps {
  onConnectClick?: () => void;
}

export function NoAccountPrompt({ onConnectClick }: NoAccountPromptProps) {
  return (
    <div className="text-center py-12 px-6">
      <div className={cn(styles.avatar.base, 'mx-auto w-14 h-14 text-xl mb-4')}>
        <svg className="h-7 w-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
          />
        </svg>
      </div>
      <h3 className="text-base font-semibold text-ink mb-2">
        Connect Your Instagram Account
      </h3>
      <p className="text-ink-muted text-sm mb-6 max-w-sm mx-auto">
        Link your Instagram Business or Creator account to start automating your DMs and growing your audience.
      </p>
      {onConnectClick && (
        <button
          onClick={onConnectClick}
          className="inline-flex items-center gap-2 px-4 py-2 bg-ink text-white font-medium rounded-md hover:bg-ink/90 transition-colors text-sm"
        >
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
          </svg>
          Connect Instagram
        </button>
      )}
    </div>
  );
}
