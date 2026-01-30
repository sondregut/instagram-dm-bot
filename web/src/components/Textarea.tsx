'use client';

import { cn } from '@/lib/utils';
import { styles } from '@/lib/styles';
import { forwardRef, TextareaHTMLAttributes } from 'react';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
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
        <textarea
          ref={ref}
          id={id}
          className={cn(
            styles.input.base,
            'resize-none',
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

Textarea.displayName = 'Textarea';
