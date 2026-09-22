import { test, expect } from "@playwright/test";
import { validateOAuthCallback } from "../src/lib/integrations/oauth-callback-validation";
import { isExpiringWithin } from "../src/lib/integrations/token-expiry";
import * as quickbooksOAuth from "../src/lib/integrations/quickbooks-oauth";
import * as googleCalendarOAuth from "../src/lib/integrations/google-calendar-oauth";

/**
 * Unit coverage for the QuickBooks/Google Calendar OAuth logic that has no
 * other verification yet (the matrix in JARVIS_PROGRESS.md called this out
 * explicitly: typecheck/lint only, no behavioral tests). Every one of these
 * routes requires a signed-in session before reaching the callback logic —
 * there is no test account in this environment to authenticate with, so an
 * HTTP-level test against the running route (the pattern security-probe.spec.ts
 * uses) cannot exercise state validation, rejected authorization, or token
 * exchange at all; it would only ever see the "redirect to /login" branch.
 * That is exactly why validateOAuthCallback and isExpiringWithin were pulled
 * out as pure functions — this file tests the real logic directly.
 */

test.describe("OAuth callback validation (state, rejected authorization, expiry)", () => {
  const base = { searchParams: new URLSearchParams(), cookieHeader: "", providerLabel: "QuickBooks", stateCookieName: "qb_oauth_state" };

  test("the provider declining authorization is reported, not treated as a missing code", () => {
    const result = validateOAuthCallback({ ...base, searchParams: new URLSearchParams("error=access_denied") });
    expect(result).toEqual({ ok: false, message: "QuickBooks declined the connection: access_denied" });
  });

  test("a missing authorization code is rejected", () => {
    const result = validateOAuthCallback({ ...base, searchParams: new URLSearchParams("state=abc") });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("No authorization code");
  });

  test("a missing state cookie (expired/never set) is rejected, distinct from a mismatch", () => {
    const result = validateOAuthCallback({ ...base, searchParams: new URLSearchParams("code=x&state=abc"), cookieHeader: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("expired");
  });

  test("a state that does not match the cookie is rejected as tampering, not silently accepted", () => {
    const result = validateOAuthCallback({ ...base, searchParams: new URLSearchParams("code=x&state=attacker-supplied"), cookieHeader: "qb_oauth_state=real-value" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("State mismatch");
  });

  test("a provider-declined error takes priority even if state also looks wrong", () => {
    // The real Homeworks/QuickBooks/Google redirect always includes `error`
    // INSTEAD of a code+state pair, but this proves the check order is safe
    // either way: the honest "provider declined" message must never be
    // masked by a generic state-mismatch message.
    const result = validateOAuthCallback({ ...base, searchParams: new URLSearchParams("error=access_denied&state=whatever") });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("declined");
  });

  test("matching state succeeds and returns the code", () => {
    const result = validateOAuthCallback({ ...base, searchParams: new URLSearchParams("code=auth-code-123&state=real-value"), cookieHeader: "qb_oauth_state=real-value" });
    expect(result).toEqual({ ok: true, code: "auth-code-123", cookies: {} });
  });

  test("a cookie header with multiple cookies still finds the right one (not fooled by a name substring)", () => {
    const result = validateOAuthCallback({
      ...base,
      searchParams: new URLSearchParams("code=c&state=real"),
      cookieHeader: "other_qb_oauth_state=wrong; qb_oauth_state=real; unrelated=ignored",
    });
    expect(result).toEqual({ ok: true, code: "c", cookies: {} });
  });

  test("Homeworks' extra PKCE verifier cookie is required and returned alongside the code", () => {
    const missing = validateOAuthCallback({
      searchParams: new URLSearchParams("code=c&state=real"),
      cookieHeader: "hw_oauth_state=real",
      providerLabel: "Homeworks",
      stateCookieName: "hw_oauth_state",
      otherRequiredCookies: ["hw_oauth_verifier"],
    });
    expect(missing.ok).toBe(false);

    const present = validateOAuthCallback({
      searchParams: new URLSearchParams("code=c&state=real"),
      cookieHeader: "hw_oauth_state=real; hw_oauth_verifier=verifier-xyz",
      providerLabel: "Homeworks",
      stateCookieName: "hw_oauth_state",
      otherRequiredCookies: ["hw_oauth_verifier"],
    });
    expect(present).toEqual({ ok: true, code: "c", cookies: { hw_oauth_verifier: "verifier-xyz" } });
  });
});

test.describe("token expiry decision (the exact boundary a refresh depends on)", () => {
  const now = Date.parse("2026-09-22T12:00:00Z");
  const marginMs = 2 * 60 * 1000;

  test("well before expiry: not expiring", () => {
    expect(isExpiringWithin(new Date(now + 60 * 60 * 1000).toISOString(), marginMs, now)).toBe(false);
  });
  test("already past expiry: expiring", () => {
    expect(isExpiringWithin(new Date(now - 1000).toISOString(), marginMs, now)).toBe(true);
  });
  test("inside the safety margin but not yet expired: still treated as expiring (refresh early, not late)", () => {
    expect(isExpiringWithin(new Date(now + 60 * 1000).toISOString(), marginMs, now)).toBe(true);
  });
  test("exactly at the margin boundary: expiring (>= , not >)", () => {
    expect(isExpiringWithin(new Date(now + marginMs).toISOString(), marginMs, now)).toBe(true);
  });
});

function mockFetchOnce(impl: (url: string, init?: RequestInit) => Promise<Response> | Response) {
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => impl(String(url), init)) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

for (const [label, oauth] of [
  ["QuickBooks", quickbooksOAuth],
  ["Google Calendar", googleCalendarOAuth],
] as const) {
  test.describe(`${label} token exchange (mocked provider — no real credentials needed)`, () => {
    test("a successful exchange returns the parsed token response", async () => {
      const restore = mockFetchOnce(async () => new Response(JSON.stringify({ access_token: "at", refresh_token: "rt", expires_in: 3600, x_refresh_token_expires_in: 8640000, scope: "s", token_type: "bearer" }), { status: 200 }));
      try {
        const result = await oauth.exchangeCodeForToken({ code: "auth-code", redirectUri: "https://example.com/cb" });
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.data.access_token).toBe("at");
      } finally {
        restore();
      }
    });

    test("a rejected authorization code (provider 400) surfaces the provider's real error, not a generic failure", async () => {
      const restore = mockFetchOnce(async () => new Response("invalid_grant: authorization code expired or already used", { status: 400 }));
      try {
        const result = await oauth.exchangeCodeForToken({ code: "reused-or-expired-code", redirectUri: "https://example.com/cb" });
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.message).toContain("400");
          expect(result.message).toContain("invalid_grant");
        }
      } finally {
        restore();
      }
    });

    test("a network failure reaching the token endpoint is reported, not thrown", async () => {
      const restore = mockFetchOnce(async () => {
        throw new TypeError("fetch failed");
      });
      try {
        const result = await oauth.exchangeCodeForToken({ code: "x", redirectUri: "https://example.com/cb" });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.message.length).toBeGreaterThan(0);
      } finally {
        restore();
      }
    });

    test("refreshing with a revoked/expired refresh token surfaces the provider's real error (not silently treated as success)", async () => {
      const restore = mockFetchOnce(async () => new Response(JSON.stringify({ error: "invalid_grant", error_description: "Token has been expired or revoked." }), { status: 400 }));
      try {
        const result = await oauth.refreshAccessToken("dead-refresh-token");
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.message).toContain("400");
      } finally {
        restore();
      }
    });

    test("a successful refresh returns a new access token", async () => {
      const restore = mockFetchOnce(async () => new Response(JSON.stringify({ access_token: "new-at", refresh_token: "rt", expires_in: 3600, x_refresh_token_expires_in: 8640000, scope: "s", token_type: "bearer" }), { status: 200 }));
      try {
        const result = await oauth.refreshAccessToken("still-valid-refresh-token");
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.data.access_token).toBe("new-at");
      } finally {
        restore();
      }
    });

    test("revoke never throws even when the provider's revoke endpoint fails", async () => {
      const restore = mockFetchOnce(async () => new Response("server error", { status: 500 }));
      try {
        await expect(oauth.revokeToken("some-token")).resolves.toBeUndefined();
      } finally {
        restore();
      }
    });

    test("revoke never throws even when the network itself fails", async () => {
      const restore = mockFetchOnce(async () => {
        throw new TypeError("fetch failed");
      });
      try {
        await expect(oauth.revokeToken("some-token")).resolves.toBeUndefined();
      } finally {
        restore();
      }
    });

    test("the authorization URL includes state, redirect_uri and the read-only scope", () => {
      const url = new URL(oauth.buildAuthorizationUrl({ redirectUri: "https://example.com/cb", state: "csrf-state-123" }));
      expect(url.searchParams.get("redirect_uri")).toBe("https://example.com/cb");
      expect(url.searchParams.get("state")).toBe("csrf-state-123");
      expect(url.searchParams.get("response_type")).toBe("code");
      expect(url.searchParams.get("scope")).toBeTruthy();
    });
  });
}

test("Google's authorization URL specifically forces a refresh token (access_type=offline&prompt=consent)", () => {
  // Google only issues a refresh_token on the FIRST ever consent unless both
  // of these are present — without them, a reconnect after the token store
  // is cleared would silently stop working past the first hour. This is the
  // one provider-specific requirement worth asserting on directly.
  const url = new URL(googleCalendarOAuth.buildAuthorizationUrl({ redirectUri: "https://example.com/cb", state: "s" }));
  expect(url.searchParams.get("access_type")).toBe("offline");
  expect(url.searchParams.get("prompt")).toBe("consent");
  expect(url.searchParams.get("scope")).toContain("calendar.readonly");
});

test("QuickBooks' authorization URL requests only the read-only accounting scope", () => {
  const url = new URL(quickbooksOAuth.buildAuthorizationUrl({ redirectUri: "https://example.com/cb", state: "s" }));
  expect(url.searchParams.get("scope")).toBe("com.intuit.quickbooks.accounting");
});
