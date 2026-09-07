import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, isIntegrationConfigured, integrationEnv } from "@/lib/env";

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
  const supabase = await getSupabaseStatus();

  return [
    supabase,
    credentialOnlyCard(
      "homeworks",
      "Homeworks",
      "Field operations & customer communication system of record.",
      "API key found — the sync layer to map Homeworks records isn't built yet.",
    ),
    credentialOnlyCard(
      "quickbooks",
      "QuickBooks",
      "Accounting: invoices, payments, expenses, and financial reporting.",
      "Client credentials found — OAuth connection flow isn't implemented yet.",
    ),
    credentialOnlyCard(
      "zapier",
      "Zapier",
      "Webhook automation for connecting Jarvis to other tools.",
      "Webhook URL found — no automations have been wired up yet.",
    ),
    credentialOnlyCard(
      "googleCalendar",
      "Google Calendar",
      "Two-way sync for the job schedule.",
      "Client credentials found — OAuth connection flow isn't implemented yet.",
    ),
    credentialOnlyCard(
      "weather",
      "Weather",
      "Rain alerts and route-planning warnings.",
      "API key found — route weather warnings aren't wired up yet.",
    ),
    credentialOnlyCard(
      "github",
      "GitHub",
      "Version control for this codebase.",
      "Token found in the environment.",
    ),
    credentialOnlyCard(
      "aiProvider",
      "AI Provider",
      "Powers the AI Advisor's answers.",
      "API key found — the AI Advisor is live.",
    ),
  ];
}
