'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { useAuth } from '@/hooks/useAuth';
import { AccountProvider } from '@/components/AccountSelector';
import { styles } from '@/lib/styles';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, loading, router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface">
        <span className={styles.spinner} />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <AccountProvider>
      <div className="flex h-screen bg-surface">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <div className="p-6">{children}</div>
        </main>
      </div>
    </AccountProvider>
  );
}
