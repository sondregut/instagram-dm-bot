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
        styles.card.base,
        styles.card.padding,
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-gradient-to-br from-accent to-accent-secondary p-2">
              <Icon className="h-5 w-5 text-white" />
            </div>
            <p className={styles.text.muted}>{title}</p>
          </div>
          <p className="mt-3 text-3xl font-bold text-gray-900 tabular-nums">{value}</p>
          {subtitle && (
            <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
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
