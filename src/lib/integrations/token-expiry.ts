/**
 * Shared token-expiry decision, used by every OAuth connection module
 * (Homeworks, QuickBooks, Google Calendar) to decide "still valid" vs
 * "needs a refresh" vs (QuickBooks only) "refresh token itself is dead,
 * needs a full reconnect". Extracted as a pure function so the actual
 * decision boundary (the safety margin) is unit-tested directly rather than
 * only exercised indirectly through a live token refresh — see
 * e2e/oauth-integrations.spec.ts.
 */
export function isExpiringWithin(expiresAtIso: string, marginMs: number, now: number = Date.now()): boolean {
  return now >= new Date(expiresAtIso).getTime() - marginMs;
}
