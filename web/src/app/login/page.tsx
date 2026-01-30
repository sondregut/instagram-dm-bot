'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { styles } from '@/lib/styles';

export default function LoginPage() {
  const { signIn, signUp, isAuthenticated, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  useEffect(() => {
    if (!loading && isAuthenticated) {
      router.push('/');
    }
  }, [isAuthenticated, loading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      if (isSignUp) {
        await signUp(email, password);
      } else {
        await signIn(email, password);
      }
      router.push('/');
    } catch (err: any) {
      const errorMessage = err.code === 'auth/email-already-in-use'
        ? 'Email already in use'
        : err.code === 'auth/weak-password'
        ? 'Password should be at least 6 characters'
        : err.code === 'auth/invalid-email'
        ? 'Invalid email address'
        : err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password'
        ? 'Invalid email or password'
        : err.message || 'Authentication failed';
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface">
        <span className={styles.spinner} />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="text-xl font-semibold text-ink tracking-tight">
            DM Bot
          </h1>
          <p className="mt-1 text-ink-muted text-sm">
            {isSignUp ? 'Create your admin account' : 'Sign in to your dashboard'}
          </p>
        </div>

        <div className="rounded-md border border-surface-border bg-surface p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />

            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isSignUp ? 'Create a password (6+ characters)' : 'Enter your password'}
              required
              minLength={6}
            />

            {error && (
              <p className="text-sm text-status-error">{error}</p>
            )}

            <Button
              type="submit"
              className="w-full"
              loading={isSubmitting}
            >
              {isSignUp ? 'Create Account' : 'Sign In'}
            </Button>
          </form>

          <div className="mt-5 text-center">
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError('');
              }}
              className="text-sm text-ink-muted hover:text-ink transition-colors"
            >
              {isSignUp
                ? 'Already have an account? Sign in'
                : "Don't have an account? Create one"}
            </button>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-ink-subtle">
          This is your admin dashboard login, not Instagram login.
          <br />
          You'll connect Instagram in Settings after logging in.
        </p>
      </div>
    </div>
  );
}
