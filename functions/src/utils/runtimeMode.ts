export type BotMode = 'disabled' | 'test' | 'mindset' | 'full';

/**
 * Outbound automation is disabled unless an explicit mode is configured.
 * `test` requires a secondary-account allowlist and a non-production keyword.
 * `mindset` runs only the Athlete Mindset flow; `full` also enables legacy flows.
 */
export function getBotMode(): BotMode {
  const value = (process.env.BOT_MODE || 'disabled').trim().toLowerCase();
  if (value === 'test' || value === 'mindset' || value === 'full') return value;
  return 'disabled';
}

export function isMindsetAutomationEnabled(): boolean {
  return process.env.MINDSET_AUTOMATION_ENABLED?.trim().toLowerCase() === 'true';
}

export function isMindsetModeActive(): boolean {
  const mode = getBotMode();
  return isMindsetAutomationEnabled() &&
    (mode === 'test' || mode === 'mindset' || mode === 'full');
}

export function isMindsetTestMode(): boolean {
  return getBotMode() === 'test';
}

export function isLegacyAutomationEnabled(): boolean {
  return getBotMode() === 'full';
}
