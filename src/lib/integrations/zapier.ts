import { integrationEnv, isIntegrationConfigured } from "@/lib/env";

/**
 * Fires a Zapier "Catch Hook" webhook so external Zaps can react to Jarvis
 * events (e.g. notify a Slack channel when an invoice goes overdue, add a
 * row to a spreadsheet when a quote is accepted). No-ops with a console note
 * when ZAPIER_WEBHOOK_URL isn't configured — callers don't need to check
 * `isIntegrationConfigured` themselves before calling this.
 */
export async function triggerZapierWebhook(
  event: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  if (!isIntegrationConfigured("zapier")) {
    console.info(`[zapier] Skipped "${event}" — ZAPIER_WEBHOOK_URL not configured.`);
    return { ok: false, error: "Zapier webhook URL not configured." };
  }

  try {
    const response = await fetch(integrationEnv.zapier.webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        event,
        source: "jarvis",
        timestamp: new Date().toISOString(),
        ...payload,
      }),
    });

    if (!response.ok) {
      return { ok: false, error: `Zapier webhook returned ${response.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to reach Zapier." };
  }
}
