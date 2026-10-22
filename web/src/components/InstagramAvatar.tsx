'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

interface InstagramAvatarProps {
  username: string;
  platform?: 'instagram' | 'facebook';
  src?: string | null;
  className?: string;
  fallbackClassName?: string;
  eager?: boolean;
}

export function InstagramAvatar({
  username,
  platform = 'instagram',
  src,
  className,
  fallbackClassName,
  eager = false,
}: InstagramAvatarProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const normalizedUsername = username.trim().replace(/^@/, '');
  const initial = normalizedUsername.slice(0, 1).toUpperCase() || '?';
  const showPhoto = Boolean(src && failedSrc !== src);

  return (
    <span
      role="img"
      aria-label={`${platform === 'facebook' ? normalizedUsername : `@${normalizedUsername}`} ${platform === 'facebook' ? 'Facebook' : 'Instagram'} profile picture`}
      data-avatar-state={showPhoto ? 'profile-photo' : 'fallback'}
      className={cn(
        'relative grid h-10 w-10 flex-shrink-0 place-items-center overflow-hidden rounded-full bg-slate-100 text-sm font-bold text-slate-700 ring-1 ring-inset ring-slate-950/10',
        className
      )}
    >
      <span aria-hidden="true" className={cn('grid h-full w-full place-items-center', fallbackClassName)}>
        {initial}
      </span>
      {showPhoto ? (
        // Meta profile URLs are short-lived and their hosts vary by region,
        // so a native image element is more reliable than a build-time host allowlist.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src!}
          alt=""
          aria-hidden="true"
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
          referrerPolicy="no-referrer"
          onError={() => setFailedSrc(src!)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : null}
    </span>
  );
}
