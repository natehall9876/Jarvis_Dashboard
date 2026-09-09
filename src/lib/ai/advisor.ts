import { integrationEnv, isIntegrationConfigured } from "@/lib/env";
import { getBusinessPulse, getTodaysMission } from "@/lib/data/command-center";
import { getOverdueInvoices } from "@/lib/data/invoices";
import { formatCurrency, formatPercent, clientDisplayName } from "@/lib/format";

const DEFAULT_MODEL = "claude-sonnet-5";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

const SYSTEM_PROMPT = `You are Jarvis, the AI operations advisor built into WeedEater Lawn Care's business dashboard.
You speak directly to the owner in short, plain, practical language — like a sharp operations manager, not a chatbot.
Only use the BUSINESS DATA block below to answer. If the data needed to answer isn't present, say so plainly instead of guessing or inventing numbers.
Never fabricate revenue, client, job, or financial figures that are not in the provided data.`;

/**
 * Pulls a compact snapshot of live business data to ground the advisor's
 * answers. Every function here already fails soft (DataResult), so a
 * partially-empty snapshot is fine — the model is instructed not to guess
 * past what it's given.
 */
async function buildBusinessContext(): Promise<string> {
  const [mission, pulse, overdue] = await Promise.all([
    getTodaysMission(),
    getBusinessPulse(),
    getOverdueInvoices(10),
  ]);

  const lines: string[] = [];

  if (mission.data) {
    const m = mission.data;
    lines.push(
      `Today (${m.date}): ${m.jobCount} jobs scheduled, ${formatCurrency(m.expectedRevenue)} expected revenue, ${m.crewWorking.length} crew members working, ${m.routesRunning.length} routes running.`,
      `Quotes needing follow-up: ${m.quotesNeedingFollowUp.length}. Equipment issues: ${m.equipmentIssues.length}. Schedule changes today: ${m.scheduleChanges.length}.`,
    );
  } else {
    lines.push("Today's schedule data is unavailable.");
  }

  if (pulse.data) {
    const p = pulse.data;
    lines.push(
      `Revenue — today: ${formatCurrency(p.revenueToday)}, this week: ${formatCurrency(p.revenueWeek)}, this month: ${formatCurrency(p.revenueMonth)}.`,
      `Accounts receivable: ${formatCurrency(p.accountsReceivable)} across ${p.outstandingInvoiceCount} outstanding invoices. Cash collected this month: ${formatCurrency(p.cashCollectedMonth)}.`,
      `Production $/hour: ${p.productionDollarsPerHour !== null ? formatCurrency(p.productionDollarsPerHour, true) : "unavailable"}. Labor cost this month: ${formatCurrency(p.laborCostMonth)}. Gross profit this month: ${formatCurrency(p.grossProfitMonth)}.`,
      `Average ticket: ${p.averageTicketMonth !== null ? formatCurrency(p.averageTicketMonth, true) : "unavailable"}. Jobs completed this month: ${p.jobsCompletedMonth}. Quote acceptance rate: ${p.quoteAcceptanceRatePct !== null ? formatPercent(p.quoteAcceptanceRatePct) : "unavailable"}.`,
    );
  } else {
    lines.push("Business pulse metrics are unavailable.");
  }

  if (overdue.data && overdue.data.length > 0) {
    lines.push(
      "Overdue invoices: " +
        overdue.data
          .map((inv) => `${clientDisplayName(inv.client)} owes ${formatCurrency(inv.balance)} (${inv.days_overdue}d overdue)`)
          .join("; "),
    );
  } else {
    lines.push("No overdue invoices on record.");
  }

  return lines.join("\n");
}

export type AdvisorResponse =
  | { ok: true; answer: string }
  | { ok: false; reason: "not_configured" | "upstream_error"; message: string };

export async function askAdvisor(question: string, pageContext?: string | null): Promise<AdvisorResponse> {
  if (!isIntegrationConfigured("aiProvider")) {
    return {
      ok: false,
      reason: "not_configured",
      message:
        "No AI provider is connected yet. Add AI_PROVIDER_API_KEY in Settings / Integrations to enable the advisor.",
    };
  }

  const businessContext = await buildBusinessContext();
  const context = pageContext ? `${pageContext}\n\n${businessContext}` : businessContext;

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": integrationEnv.aiProvider.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.AI_PROVIDER_MODEL || DEFAULT_MODEL,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `BUSINESS DATA:\n${context}\n\nOWNER'S QUESTION: ${question}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      return {
        ok: false,
        reason: "upstream_error",
        message: `AI provider returned an error (${response.status}): ${body.slice(0, 300)}`,
      };
    }

    const json = (await response.json()) as {
      content?: { type: string; text?: string }[];
    };
    const answer = json.content?.find((block) => block.type === "text")?.text;

    if (!answer) {
      return { ok: false, reason: "upstream_error", message: "AI provider returned an empty response." };
    }

    return { ok: true, answer };
  } catch (err) {
    return {
      ok: false,
      reason: "upstream_error",
      message: err instanceof Error ? err.message : "Failed to reach the AI provider.",
    };
  }
}
