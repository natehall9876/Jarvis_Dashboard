/**
 * Central place for reading and validating environment configuration.
 *
 * Nothing in this file throws at import time — pages and data-access
 * functions must be able to render "not configured" states instead of
 * crashing the build or the request when credentials are missing.
 */

export const supabaseEnv = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
};

export function isSupabaseConfigured(): boolean {
  return supabaseEnv.url.length > 0 && supabaseEnv.publishableKey.length > 0;
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

export function isIntegrationConfigured(
  key: keyof typeof integrationEnv,
): boolean {
  return hasAllValues(integrationEnv[key]);
}
