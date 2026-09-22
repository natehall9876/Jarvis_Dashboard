import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { isIntegrationConfigured, integrationEnv, homeworksWebhookEnv, supabaseServiceRoleKey } from "@/lib/env.server";
import { getWeatherForCoordinates } from "@/lib/integrations/weather";

type IntegrationKey = keyof typeof integrationEnv;

export type IntegrationStatus = "connected" | "needs_setup" | "not_connected";

export type IntegrationCard = {
  key: string;
  name: string;
  description: string;
  status: IntegrationStatus;
  statusDetail: string;
};

/**
 * Supabase is the only integration we can actually verify with a live call —
 * everything else only reports whether credentials are present, which is
 * why they cap out at "needs_setup" rather than "connected". Claiming a
 * verified connection for an integration Jarvis has never actually talked
 * to would violate the "don't pretend it's connected" requirement.
 */
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

/**
 * The real Homeworks integration is the Zapier webhook
 * (src/app/api/integrations/homeworks/webhook/route.ts), authenticated by
 * HOMEWORKS_WEBHOOK_SECRET + SUPABASE_SERVICE_ROLE_KEY — NOT the unused
 * HOMEWORKS_API_KEY env var (there is no direct Homeworks API; that
 * variable predates the actual integration and nothing reads it anymore).
 * Checking the old variable here would report "Not Connected" even with a
 * fully live, working integration — this checks the real credentials the
 * webhook actually needs, and verifies with a live query (same rigor as
 * Supabase/Weather above) whether at least one record has actually synced,
 * rather than just reporting that secrets exist.
 */
async function getHomeworksStatus(): Promise<IntegrationCard> {
  const name = "Homeworks (Zapier sync)";
  const description =
    "CRM push sync via Homeworks' own Zapier app — new customers/properties/invoices arrive here as they're created in Homeworks. Separate from the direct API card above, and separate from the generic \"Zapier\" card below (that one is for unrelated future automations, not this).";

  if (!homeworksWebhookEnv.secret || !supabaseServiceRoleKey) {
    const missing = [!homeworksWebhookEnv.secret && "HOMEWORKS_WEBHOOK_SECRET", !supabaseServiceRoleKey && "SUPABASE_SERVICE_ROLE_KEY"]
      .filter(Boolean)
      .join(" and ");
    return { key: "homeworks", name, description, status: "not_connected", statusDetail: `Missing ${missing} — see docs/HOMEWORKS_VERIFICATION.md.` };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { count, error } = await supabase.from("clients").select("id", { count: "exact", head: true }).not("homeworks_id", "is", null);
    if (error) {
      return { key: "homeworks", name, description, status: "needs_setup", statusDetail: `Credentials found but the verification query failed: ${error.message}` };
    }
    if (!count || count === 0) {
      return { key: "homeworks", name, description, status: "needs_setup", statusDetail: "Credentials configured, but no customer has synced yet — see docs/HOMEWORKS_VERIFICATION.md." };
    }
    return { key: "homeworks", name, description, status: "connected", statusDetail: `Verified — ${count} customer${count === 1 ? "" : "s"} synced from Homeworks.` };
  } catch (err) {
    return { key: "homeworks", name, description, status: "needs_setup", statusDetail: err instanceof Error ? err.message : "Verification query failed." };
  }
}

/**
 * Unlike QuickBooks/Google Calendar (credential-only cards below — zero
 * integration code exists for those yet, so "needs_setup" is accurate),
 * the AI Advisor is a fully built, extensively real-world-verified feature
 * — the "Needs Setup" tier previously applied here directly contradicted
 * its own description text ("API key found — the AI Advisor is live"),
 * a real misleading-label bug (flagged directly by the owner). Deliberately
 * NOT making a live paid Anthropic call on every Settings page load the
 * way Weather/Supabase do (those are free); "connected" here means
 * "configured, and this integration has a real, tested implementation" —
 * the AI Advisor itself is the actual live-verification surface.
 */
function getAIProviderStatus(): IntegrationCard {
  const configured = isIntegrationConfigured("aiProvider");
  return {
    key: "aiProvider",
    name: "AI Provider",
    description: "Powers the AI Advisor's answers.",
    status: configured ? "connected" : "not_connected",
    statusDetail: configured
      ? "API key configured — the AI Advisor is live. Ask it a real question to confirm right now; this badge reflects configuration, not a fresh test call."
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
      "Client credentials found — OAuth connection flow isn't implemented yet.",
    ),
    credentialOnlyCard(
      "zapier",
      "Zapier (general automation)",
      "Outbound automation FROM Jarvis to other tools — unrelated to the Homeworks sync above, which already works and doesn't need this.",
      "Webhook URL found — no automations have been wired up yet.",
    ),
    credentialOnlyCard(
      "googleCalendar",
      "Google Calendar",
      "Two-way sync for the job schedule.",
      "Client credentials found — OAuth connection flow isn't implemented yet.",
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
