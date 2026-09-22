/**
 * Everything in this file is a secret, or configuration that only makes
 * sense server-side (webhook shared secrets, OAuth client secrets, the
 * Supabase service-role key). Never import this from a "use client"
 * component or anything it pulls in.
 *
 * This split exists because of a real, found-not-assumed problem: this
 * file's contents used to live in src/lib/env.ts together with
 * `supabaseEnv` (the public anon key, genuinely safe for the browser and
 * imported by src/lib/supabase/client.ts, a client-reachable module).
 * Because both lived in one flat module, importing the public export
 * dragged the WHOLE module — including every `process.env.X` reference
 * below — into at least one client bundle chunk (confirmed by inspecting
 * `.next/static/chunks/*.js` after a production build: the literal
 * property-access expressions for SUPABASE_SERVICE_ROLE_KEY,
 * QUICKBOOKS_CLIENT_SECRET, GOOGLE_CALENDAR_CLIENT_SECRET, and others were
 * present in a chunk referenced by several dashboard pages' client-reference
 * manifests). The actual secret VALUES were never inlined — Next.js only
 * build-time-inlines `NEXT_PUBLIC_*` vars, so a bare `process.env.X`
 * reference in browser code evaluates to `undefined`, not the real secret —
 * but the reference chain itself was a real architectural violation of
 * "secrets stay server-side," not just a theoretical one.
 *
 * Deliberately NOT using the `server-only` package here, even though it
 * exists for exactly this: its enforcement only works inside Next.js's own
 * bundler, which resolves it via a `react-server` package-export condition
 * to a no-op on the server and a throwing stub on the client. Any other
 * Node-based tool that imports this module — including this project's own
 * Playwright e2e tests, which import quickbooks-oauth.ts / google-calendar-
 * oauth.ts directly to unit-test token exchange/refresh (see
 * e2e/oauth-integrations.spec.ts) — resolves the same package to the
 * ALWAYS-throwing default export, since it isn't aware of that condition.
 * That would make this file (and everything that imports it) permanently
 * untestable outside Next's own build, which is a worse trade than the
 * protection is worth. The real, verified guard is
 * scripts/check-no-client-secrets.mjs (run in CI right after `next build`)
 * — it checks the actual shipped output for these exact strings, which is
 * strictly stronger evidence than an import-graph rule anyway, and was
 * proven to catch a planted violation during this session, not just
 * assumed to work.
 */

/**
 * The ONE deliberate exception to "no service-role key" in this project.
 * Read ONLY by src/lib/supabase/admin.ts, which is imported ONLY by
 * server-to-server webhook routes and the OAuth connection modules (no
 * logged-in user session exists for a webhook call to authenticate as, so
 * RLS's `to authenticated` policy has nothing to scope against). Never
 * imported by anything reachable from a page, Server Action, or anywhere a
 * browser session drives the request.
 */
export const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export const homeworksWebhookEnv = {
  secret: process.env.HOMEWORKS_WEBHOOK_SECRET ?? "",
};

/**
 * The real Homeworks API (api.home.works) — OAuth 2.1 + PKCE, verified live
 * on 2026-09-18 (registered via the API's own self-serve /oauth/register
 * endpoint, confirmed against the live /.well-known/oauth-authorization-
 * server discovery document). This is genuinely separate from
 * homeworksWebhookEnv above, which only ever receives data pushed in by
 * Zapier — this is Jarvis authenticating outbound TO Homeworks.
 *
 * client_id is a public identifier, not a secret — this OAuth client uses
 * `token_endpoint_auth_method: "none"` (PKCE secures the flow instead of a
 * client secret), the same trust model as a mobile app or SPA's OAuth
 * client id. It's kept in this server-only file anyway (rather than moved
 * to the public env module) because it's meaningless outside the server-side
 * OAuth flow that uses it, not because it needs hiding.
 */
export const homeworksOAuthEnv = {
  clientId: process.env.HOMEWORKS_OAUTH_CLIENT_ID ?? "",
};

export function isHomeworksOAuthConfigured(): boolean {
  return homeworksOAuthEnv.clientId.length > 0;
}

/**
 * Integration environment flags. These only report whether credentials are
 * present, never whether the third-party service actually accepted them —
 * that distinction matters on the Settings / Integrations page, where
 * "Connected" should mean a verified connection, not just a configured key.
 */
export const integrationEnv = {
  homeworks: {
    apiKey: process.env.HOMEWORKS_API_KEY ?? "",
  },
  quickbooks: {
    clientId: process.env.QUICKBOOKS_CLIENT_ID ?? "",
    clientSecret: process.env.QUICKBOOKS_CLIENT_SECRET ?? "",
  },
  zapier: {
    webhookUrl: process.env.ZAPIER_WEBHOOK_URL ?? "",
  },
  googleCalendar: {
    clientId: process.env.GOOGLE_CALENDAR_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET ?? "",
  },
  // National Weather Service (api.weather.gov) needs no API key — just a
  // location. Requiring only lat/lon here is intentional, not an oversight.
  weather: {
    lat: process.env.WEATHER_LOCATION_LAT ?? "",
    lon: process.env.WEATHER_LOCATION_LON ?? "",
  },
  github: {
    token: process.env.GITHUB_TOKEN ?? "",
  },
  aiProvider: {
    apiKey: process.env.AI_PROVIDER_API_KEY ?? "",
  },
} as const;

function hasAllValues(record: Record<string, string>): boolean {
  return Object.values(record).every((value) => value.length > 0);
}

export function isIntegrationConfigured(key: keyof typeof integrationEnv): boolean {
  return hasAllValues(integrationEnv[key]);
}
