// Component style constants - single source of truth
export const styles = {
  // Button variants
  button: {
    base: 'inline-flex items-center justify-center font-medium transition-colors focus-ring disabled:opacity-40',
    variants: {
      primary: 'bg-ink text-white hover:bg-ink/90',
      secondary: 'bg-surface-sunken text-ink hover:bg-surface-border',
      ghost: 'text-ink-muted hover:bg-surface-sunken hover:text-ink',
      danger: 'bg-status-error text-white hover:bg-status-error/90',
    },
    sizes: {
      sm: 'h-7 px-2.5 text-xs gap-1.5 rounded',
      md: 'h-8 px-3 text-sm gap-2 rounded-md',
      lg: 'h-9 px-4 text-sm gap-2 rounded-md',
    },
  },

  // Input styles
  input: {
    base: 'block w-full rounded-md border border-surface-border px-3 py-2 text-sm text-ink placeholder:text-ink-subtle focus:outline-none focus:border-ink-muted hover:border-ink-subtle/50 disabled:bg-surface-sunken disabled:cursor-not-allowed',
    error: 'border-status-error focus:border-status-error',
  },

  // Card styles
  card: {
    base: 'rounded-md border border-surface-border',
    padding: 'p-4',
  },

  // Navigation
  nav: {
    item: 'flex items-center gap-2.5 px-2.5 py-1.5 text-sm rounded-md transition-colors',
    active: 'bg-surface-sunken text-ink font-medium',
    inactive: 'text-ink-muted hover:bg-surface-sunken hover:text-ink',
  },

  // Status badges
  badge: {
    base: 'px-1.5 py-0.5 text-xs rounded font-medium',
    success: 'bg-status-success/10 text-status-success',
    warning: 'bg-status-warning/10 text-status-warning',
    error: 'bg-status-error/10 text-status-error',
    neutral: 'bg-surface-sunken text-ink-muted',
  },

  // Avatar
  avatar: {
    base: 'rounded-full bg-ink flex items-center justify-center text-white font-medium',
    sizes: {
      xs: 'h-5 w-5 text-[10px]',
      sm: 'h-6 w-6 text-xs',
      md: 'h-8 w-8 text-sm',
      lg: 'h-10 w-10 text-base',
    },
  },

  // Typography
  text: {
    heading: 'font-medium tracking-tight',
    label: 'text-xs font-medium text-ink-subtle uppercase tracking-wide',
    body: 'text-sm text-ink',
    muted: 'text-sm text-ink-muted',
  },

  // Toggle
  toggle: {
    base: 'relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/10 focus-visible:ring-offset-1',
    active: 'bg-ink',
    inactive: 'bg-surface-border',
    knob: 'inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform',
    knobActive: 'translate-x-4',
    knobInactive: 'translate-x-1',
  },

  // Modal
  modal: {
    backdrop: 'fixed inset-0 bg-black/50 transition-opacity',
    container: 'relative w-full bg-surface rounded-lg border border-surface-border',
    header: 'flex items-center justify-between border-b border-surface-border px-5 py-4',
    title: 'text-base font-medium text-ink',
    content: 'px-5 py-4',
  },

  // Spinner
  spinner: 'h-4 w-4 animate-spin border-2 border-current border-t-transparent rounded-full',
} as const;

// Focus ring utility
export const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/10 focus-visible:ring-offset-1';
