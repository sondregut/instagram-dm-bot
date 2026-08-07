'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { useAuth } from '@/hooks/useAuth';
import { AccountProvider } from '@/components/AccountSelector';
import { styles } from '@/lib/styles';
import { isDashboardReviewMode } from '@/lib/mindsetReview';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();
  const reviewMode = isDashboardReviewMode();

  useEffect(() => {
    if (!reviewMode && !loading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, loading, reviewMode, router]);

  if (!reviewMode && loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-surface-sunken">
        <span className={styles.spinner} />
      </div>
    );
  }

  if (!reviewMode && !isAuthenticated) {
    return null;
  }

  return (
    <AccountProvider>
      <div className="flex min-h-[100dvh] bg-surface-sunken">
        <Sidebar />
        <main className="min-w-0 flex-1 pb-20 md:pb-0">
          <div className="mx-auto w-full max-w-[1480px] px-4 py-5 sm:px-6 lg:px-10 lg:py-8">{children}</div>
        </main>
      </div>
    </AccountProvider>
  );
}
