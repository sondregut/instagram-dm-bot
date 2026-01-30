'use client';

import { cn } from '@/lib/utils';
import { styles } from '@/lib/styles';
import { LucideIcon } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  className?: string;
}

export function StatsCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  className,
}: StatsCardProps) {
  return (
    <div
      className={cn(
        'rounded-md border border-surface-border bg-surface p-5',
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-ink-muted" />
            <p className="text-sm font-medium text-ink-muted">{title}</p>
          </div>
          <p className="mt-2 text-2xl font-semibold text-ink tabular-nums">{value}</p>
          {subtitle && (
            <p className="mt-1 text-sm text-ink-subtle">{subtitle}</p>
          )}
          {trend && (
            <p
              className={cn(
                'mt-2 text-sm font-medium',
                trend.isPositive ? 'text-status-success' : 'text-status-error'
              )}
            >
              {trend.isPositive ? '+' : ''}
              {trend.value}% from last week
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
