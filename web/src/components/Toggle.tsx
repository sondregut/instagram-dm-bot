'use client';

import { cn } from '@/lib/utils';
import { styles } from '@/lib/styles';

interface ToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export function Toggle({ enabled, onChange, label, disabled }: ToggleProps) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => !disabled && onChange(!enabled)}
        className={cn(
          styles.toggle.base,
          enabled ? styles.toggle.active : styles.toggle.inactive,
          disabled && 'opacity-50 cursor-not-allowed'
        )}
        disabled={disabled}
      >
        <span
          className={cn(
            styles.toggle.knob,
            enabled ? styles.toggle.knobActive : styles.toggle.knobInactive
          )}
        />
      </button>
      {label && (
        <span className="text-sm font-medium text-ink">{label}</span>
      )}
    </div>
  );
}
