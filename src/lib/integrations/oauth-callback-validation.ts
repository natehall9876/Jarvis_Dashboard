/**
 * Shared CSRF-state + provider-response validation for every OAuth callback
 * route in this project (Homeworks, QuickBooks, Google Calendar). Pulled out
 * of the route handlers so it can be unit-tested directly — every one of
 * these routes requires an authenticated session before reaching this logic
 * (`requireAuthenticatedUser` / the inline `auth.getUser()` check runs
 * first), which makes the validation itself untestable via a real HTTP
 * request in an environment with no test account to sign in with. Extracting
 * it as a pure function is what makes "callback state validation, rejected
 * authorization" actually verifiable here — see
 * e2e/oauth-integrations.spec.ts.
 *
 * Each provider that uses this also has its own additional required cookie
 * (Homeworks: a PKCE `hw_oauth_verifier`) beyond the state cookie — those are
 * passed in `otherRequiredCookies` and returned in `cookies` so the caller
 * can use them without re-parsing the header itself.
 */
export type OAuthCallbackValidationResult =
  | { ok: true; code: string; cookies: Record<string, string> }
  | { ok: false; message: string };

function readCookie(cookieHeader: string, name: string): string | undefined {
  // Cookie names are not regex-safe by construction here (all are literal,
  // hardcoded identifiers this project defines itself — never provider- or
  // user-supplied), so no escaping is needed for the ones actually passed.
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match?.[1];
}

export function validateOAuthCallback(params: {
  searchParams: URLSearchParams;
  cookieHeader: string;
  providerLabel: string;
  stateCookieName: string;
  otherRequiredCookies?: string[];
}): OAuthCallbackValidationResult {
  const errorParam = params.searchParams.get("error");
  if (errorParam) return { ok: false, message: `${params.providerLabel} declined the connection: ${errorParam}` };

  const code = params.searchParams.get("code");
  if (!code) return { ok: false, message: "No authorization code was returned." };

  const state = params.searchParams.get("state");
  const expectedState = readCookie(params.cookieHeader, params.stateCookieName);

  const otherCookies: Record<string, string> = {};
  let missingOther = false;
  for (const name of params.otherRequiredCookies ?? []) {
    const value = readCookie(params.cookieHeader, name);
    if (!value) missingOther = true;
    else otherCookies[name] = value;
  }

  if (!expectedState || missingOther) return { ok: false, message: "The connection attempt expired — try connecting again." };
  if (state !== expectedState) return { ok: false, message: "State mismatch — the connection attempt may have been tampered with. Try again." };

  return { ok: true, code, cookies: otherCookies };
}
