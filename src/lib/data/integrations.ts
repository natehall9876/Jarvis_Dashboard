import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { isIntegrationConfigured, integrationEnv, homeworksWebhookEnv, supabaseServiceRoleKey } from "@/lib/env.server";
import { getWeatherForCoordinates } from "@/lib/integrations/weather";
import { getCompanyInfo } from "@/lib/integrations/quickbooks-api";
import { getConnectionStatus as getCalendarConnection } from "@/lib/integrations/google-calendar-connection";
import { listEvents } from "@/lib/integrations/google-calendar-api";
import { todayInZone } from "@/lib/integrations/homeworks-dates";
import type { ServiceCheck, WorkspaceReadiness } from "@/lib/jarvis/workspace";

type IntegrationKey = keyof typeof integrationEnv;

export type IntegrationStatus = "connected" | "needs_setup" | "not_connected" | "unverified";

export type IntegrationCard = {
  key: string;
  name: string;
  description: string;
  status: IntegrationStatus;
  statusDetail: string;
};

/** This card verifies Supabase with a live query. */
async function getSupabaseStatus(): Promise<IntegrationCard> {
  if (!isSupabaseConfigured()) {
    return {
      key: "supabase",
      name: "Supabase",
      description: "Primary database — clients, jobs, quotes, invoices, and everything else.",
      status: "not_connected",
      statusDetail: "Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to .env.local.",
    };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("clients").select("id").limit(1);
    if (error) {
      return {
        key: "supabase",
        name: "Supabase",
        description: "Primary database — clients, jobs, quotes, invoices, and everything else.",
        status: "needs_setup",
        statusDetail: `Credentials found but the query failed: ${error.message}`,
      };
    }
    return {
      key: "supabase",
      name: "Supabase",
      description: "Primary database — clients, jobs, quotes, invoices, and everything else.",
      status: "connected",
      statusDetail: "Verified with a live query.",
    };
  } catch (err) {
    return {
      key: "supabase",
      name: "Supabase",
      description: "Primary database — clients, jobs, quotes, invoices, and everything else.",
      status: "needs_setup",
      statusDetail: err instanceof Error ? err.message : "Connection failed.",
    };
  }
}

/**
 * Weather (National Weather Service) needs no API key, only a location, and
 * we can actually verify it with a live call — same treatment as Supabase.
 */
async function getWeatherStatus(): Promise<IntegrationCard> {
  const description = "Rain alerts and route-planning warnings (National Weather Service — free, no key).";
  if (!isIntegrationConfigured("weather")) {
    return {
      key: "weather",
      name: "Weather",
      description,
      status: "not_connected",
      statusDetail: "Add WEATHER_LOCATION_LAT and WEATHER_LOCATION_LON to .env.local.",
    };
  }

  const snapshot = await getWeatherForCoordinates(Number(integrationEnv.weather.lat), Number(integrationEnv.weather.lon));
  if (!snapshot) {
    return {
      key: "weather",
      name: "Weather",
      description,
      status: "needs_setup",
      statusDetail: "Location configured but the National Weather Service call failed — check the coordinates.",
    };
  }

  return {
    key: "weather",
    name: "Weather",
    description,
    status: "connected",
    statusDetail: `Verified with a live call — currently ${snapshot.temperatureF}°F in ${snapshot.location}.`,
  };
}

/** Webhook delivery evidence is distinct from direct API/manual import counts. */
async function getHomeworksStatus(): Promise<IntegrationCard> {
  const name = "Homeworks (webhook sync)";
  const description = "Optional event receiver. Automatic API synchronization runs separately every 5 minutes; see Homeworks live for current checkpoints and errors.";
  const missing = [!homeworksWebhookEnv.secret && "HOMEWORKS_WEBHOOK_SECRET", !supabaseServiceRoleKey && "SUPABASE_SERVICE_ROLE_KEY"].filter(Boolean);
  if (missing.length) return { key: "homeworks", name, description, status: "not_connected", statusDetail: "Missing " + missing.join(" and ") + "." };
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.from("activity_log").select("created_at")
      .eq("event_type", "homeworks_webhook_sync")
      .contains("detail", { origin: "webhook", provenance_version: 2 })
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) return { key: "homeworks", name, description, status: "needs_setup", statusDetail: "Delivery verification failed: " + error.message };
    if (!data) return { key: "homeworks", name, description, status: "needs_setup", statusDetail: "Configured, but no delivery with verified webhook provenance is recorded. Older entries may be manual imports." };
    const recent = Date.now() - new Date(data.created_at).getTime() < 24 * 60 * 60 * 1000;
    return { key: "homeworks", name, description, status: recent ? "connected" : "needs_setup", statusDetail: "Last verified webhook delivery: " + data.created_at + (recent ? "." : ". No verified delivery in the past 24 hours.") };
  } catch (error) {
    return { key: "homeworks", name, description, status: "needs_setup", statusDetail: error instanceof Error ? error.message : "Delivery verification failed." };
  }
}

/** Configuration alone does not verify the provider; the Advisor performs the live call. */
function getAIProviderStatus(): IntegrationCard {
  const configured = isIntegrationConfigured("aiProvider");
  return {
    key: "aiProvider",
    name: "AI Provider",
    description: "Powers the AI Advisor's answers.",
    status: configured ? "unverified" : "not_connected",
    statusDetail: configured
      ? "API key configured; connectivity is unverified. Ask it a real question to confirm right now; this badge reflects configuration, not a fresh test call."
      : "No credentials found in the environment.",
  };
}

function credentialOnlyCard(
  key: IntegrationKey,
  name: string,
  description: string,
  needsSetupDetail: string,
): IntegrationCard {
  const configured = isIntegrationConfigured(key);
  return {
    key,
    name,
    description,
    status: configured ? "needs_setup" : "not_connected",
    statusDetail: configured
      ? needsSetupDetail
      : "No credentials found in the environment.",
  };
}

export async function getIntegrationCards(): Promise<IntegrationCard[]> {
  const [supabase, weather, homeworks] = await Promise.all([getSupabaseStatus(), getWeatherStatus(), getHomeworksStatus()]);

  return [
    supabase,
    homeworks,
    credentialOnlyCard(
      "quickbooks",
      "QuickBooks",
      "Accounting: invoices, payments, expenses, and financial reporting.",
      "Client credentials found. Use the dedicated OAuth card above to authorize and verify.",
    ),
    credentialOnlyCard(
      "zapier",
      "Zapier (general automation)",
      "Outbound automation FROM Jarvis to other tools — unrelated to the Homeworks sync above, which is configured separately.",
      "Webhook URL found — no automations have been wired up yet.",
    ),
    credentialOnlyCard(
      "googleCalendar",
      "Google Calendar",
      "Read-only calendar preview, kept separate from Homeworks jobs.",
      "Client credentials found. Use the dedicated OAuth card above to authorize and verify.",
    ),
    weather,
    credentialOnlyCard(
      "github",
      "GitHub",
      "Version control for this codebase.",
      "Token found in the environment.",
    ),
    getAIProviderStatus(),
  ];
}

/** Cheap live reads, isolated per provider. Configuration never becomes a green check. */
export async function getWorkspaceReadiness(): Promise<WorkspaceReadiness> {
  const checks = await Promise.allSettled([
    (async (): Promise<ServiceCheck> => {
      if (!isIntegrationConfigured("quickbooks")) return { id: "quickbooks", name: "QuickBooks", state: "setup", detail: "App credentials are missing. Complete setup in Connections." };
      const result = await getCompanyInfo();
      return result.ok
        ? { id: "quickbooks", name: "QuickBooks", state: "live", detail: "Company access verified. Financial totals are checked separately in Money." }
        : { id: "quickbooks", name: "QuickBooks", state: "attention", detail: result.message };
    })(),
    (async (): Promise<ServiceCheck> => {
      if (!isIntegrationConfigured("googleCalendar")) return { id: "calendar", name: "Google Calendar", state: "setup", detail: "Google app setup is missing. Homeworks jobs remain available." };
      const connection = await getCalendarConnection();
      if (!connection.connected) return { id: "calendar", name: "Google Calendar", state: "attention", detail: "Calendar authorization needs attention in Connections." };
      if (!connection.selectedCalendarId) return { id: "calendar", name: "Google Calendar", state: "setup", detail: "Choose a calendar in Connections to finish setup." };
      const today = todayInZone();
      const result = await listEvents(connection.selectedCalendarId, { from: today, to: today });
      return result.ok
        ? { id: "calendar", name: "Google Calendar", state: "live", detail: "Selected calendar read verified. Events stay separate from paid jobs." }
        : { id: "calendar", name: "Google Calendar", state: "attention", detail: result.message };
    })(),
  ]);
  const aiReady = isIntegrationConfigured("aiProvider");
  const services: ServiceCheck[] = [{ id: "ai", name: "Jarvis AI", state: aiReady ? "ready" : "setup", detail: aiReady ? "Configured. Run a review to verify a live answer." : "The AI provider key needs configuration." }];
  checks.forEach((result, index) => services.push(result.status === "fulfilled" ? result.value : {
    id: index === 0 ? "quickbooks" : "calendar", name: index === 0 ? "QuickBooks" : "Google Calendar", state: "attention", detail: "The live check could not finish. Open Connections to retry.",
  }));
  return { checkedAt: new Date().toISOString(), services };
}
