// Component style constants - single source of truth
export const styles = {
  // Button variants
  button: {
    base: 'inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed',
    variants: {
      primary: 'bg-gradient-to-r from-accent to-accent-secondary text-white hover:opacity-90 focus:ring-accent',
      secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200 focus:ring-gray-500',
      ghost: 'text-gray-600 hover:bg-gray-100 focus:ring-gray-500',
      danger: 'bg-status-error text-white hover:bg-status-error/90 focus:ring-status-error',
    },
    sizes: {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-4 py-2 text-sm',
      lg: 'px-6 py-3 text-base',
    },
  },

  // Input styles
  input: {
    base: 'block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:bg-gray-50 disabled:text-gray-500',
    error: 'border-status-error focus:border-status-error focus:ring-status-error',
  },

  // Card styles
  card: {
    base: 'rounded-xl bg-white shadow-sm border border-gray-100',
    padding: 'p-6',
  },

  // Navigation (dark sidebar)
  nav: {
    item: 'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
    active: 'bg-gray-800 text-white',
    inactive: 'text-gray-400 hover:bg-gray-800 hover:text-white',
  },

  // Sidebar
  sidebar: {
    base: 'flex h-full w-64 flex-col bg-gray-900',
    logo: 'flex h-16 items-center px-6',
    logoIcon: 'h-8 w-8 rounded-lg bg-gradient-to-br from-accent to-accent-secondary',
    logoText: 'text-lg font-semibold text-white',
    accountBox: 'rounded-lg bg-gray-800 p-2',
  },

  // Status badges
  badge: {
    base: 'px-2 py-0.5 text-xs rounded-full font-medium',
    success: 'bg-green-100 text-green-700',
    warning: 'bg-yellow-100 text-yellow-700',
    error: 'bg-red-100 text-red-700',
    neutral: 'bg-gray-100 text-gray-600',
    info: 'bg-blue-100 text-blue-700',
  },

  // Avatar
  avatar: {
    base: 'rounded-full bg-gradient-to-br from-accent to-accent-secondary flex items-center justify-center text-white font-semibold',
    sizes: {
      xs: 'h-5 w-5 text-xs',
      sm: 'h-8 w-8 text-sm',
      md: 'h-10 w-10 text-base',
      lg: 'h-14 w-14 text-lg',
    },
  },

  // Typography
  text: {
    heading: 'text-2xl font-bold text-gray-900',
    subheading: 'text-lg font-semibold text-gray-900',
    body: 'text-sm text-gray-900',
    muted: 'text-gray-500',
    label: 'text-sm font-medium text-gray-700',
  },

  // Toggle
  toggle: {
    base: 'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2',
    active: 'bg-accent',
    inactive: 'bg-gray-200',
    knob: 'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
    knobActive: 'translate-x-6',
    knobInactive: 'translate-x-1',
  },

  // Modal
  modal: {
    backdrop: 'fixed inset-0 bg-black/50 transition-opacity',
    container: 'relative w-full bg-white rounded-xl shadow-xl',
    header: 'flex items-center justify-between border-b border-gray-200 px-6 py-4',
    title: 'text-lg font-semibold text-gray-900',
    content: 'px-6 py-4',
  },

  // Spinner
  spinner: 'h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent',

  // Info banners
  banner: {
    info: 'rounded-xl bg-blue-50 p-6 border border-blue-200',
    success: 'rounded-xl bg-green-50 p-6 border border-green-200',
    warning: 'rounded-xl bg-yellow-50 p-6 border border-yellow-200',
    accent: 'rounded-xl bg-gradient-to-r from-purple-50 to-pink-50 p-4 border border-purple-200',
  },
} as const;

// Focus ring utility
export const focusRing = 'focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2';
