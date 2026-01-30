'use client';

import { cn } from '@/lib/utils';
import { styles } from '@/lib/styles';
import { forwardRef, InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={id}
            className="block text-sm font-medium text-ink-muted mb-1"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={cn(
            styles.input.base,
            error && styles.input.error,
            className
          )}
          {...props}
        />
        {error && <p className="mt-1 text-sm text-status-error">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
