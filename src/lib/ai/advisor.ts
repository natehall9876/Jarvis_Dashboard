import { AnthropicProvider } from "@/lib/ai/providers/anthropic";
import { ALL_TOOLS, findTool, toolDefinitions } from "@/lib/ai/tools";
import type { AIMessage, AIContentBlock } from "@/lib/ai/provider";
import type { EntityReference } from "@/lib/ai/tool-types";
import type { PageContext } from "@/lib/ai/page-context";

const provider = new AnthropicProvider();

// A tool round-trip is cheap relative to a wasted turn, but this still needs
// a hard ceiling — a model stuck re-calling tools without converging should
// fail loudly rather than run up API cost silently.
const MAX_TOOL_ITERATIONS = 6;

function buildSystemPrompt(): string {
  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const weekdayFormatter = new Intl.DateTimeFormat("en-US", { weekday: "long" });

  // A deterministic weekday -> ISO date lookup for the next 14 days, computed
  // here rather than left to the model, so "this Friday" / "next Monday"
  // resolve from real arithmetic instead of a guess that can drift by a day.
  const upcoming: string[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const label = i === 0 ? "today" : i === 1 ? "tomorrow" : weekdayFormatter.format(d);
    upcoming.push(`${label} = ${iso}`);
  }

  return `You are Jarvis, the operations assistant built into WeedEater Lawn Care's business dashboard. You speak directly to the owner — concise, plain, practical, like a sharp ops manager, not a chatbot. WeedEater is a residential/commercial lawn care and landscaping company: weekly mowing, aeration, overseeding, fall cleanups, trimming, and similar seasonal work, billed through quotes -> jobs -> invoices -> payments, run by crews on recurring routes.

TODAY: ${weekdayFormatter.format(now)}, ${todayIso}.
UPCOMING DATES (use these verbatim for relative-date questions — do not recompute them yourself):
${upcoming.join(" | ")}

HOW YOU WORK
You have read-only tools into the real, live business database. You cannot see or guess at data you haven't fetched — always call a tool to get real numbers before answering anything about jobs, clients, money, schedule, employees, or equipment. Never invent or estimate a figure that isn't in a tool result. Call multiple tools when a question genuinely needs more than one (e.g. "how does Friday look" needs the day's jobs AND the crew assigned AND probably today's outstanding priorities for comparison) — you are expected to combine information across the business, not answer from a single lookup. When a tool result doesn't contain what's needed to answer reliably, say so plainly ("I don't have enough recorded labor-hour data for that") instead of estimating.

READ-ONLY: you cannot create, edit, delete, or send anything yet — no scheduling, no invoicing, no messages, no purchases. If asked to do one of these, say plainly that you can't take actions yet, this phase is read-only, and answer with the relevant information instead if you can.

HOW TO ANSWER
For a simple lookup ("what's on the schedule today", "who owes money"), just answer directly and briefly — no need for headers or structure.
For an analysis or recommendation, keep the underlying facts and your judgment visibly separate so the owner can trust which is which: state the real numbers from your tools first, then say plainly what you'd do and why, in one or two sentences. Don't pad this into an essay, and don't present your own judgment as if it were a database fact.
Always ground a recommendation in the specific numbers behind it (e.g. "Friday has 11.2 budgeted hours against a 3-person crew while Saturday only has 3.4" — not just "Friday looks busy").
Keep responses short — a few sentences to a short paragraph for most questions. Owners read this on a phone between jobs.`;
}

export type AdvisorTurn = { question: string; answer: string };

export type AdvisorResponse =
  | { ok: true; answer: string; references: EntityReference[]; toolsUsed: string[] }
  | { ok: false; reason: "not_configured" | "upstream_error"; message: string };

function dedupeReferences(refs: EntityReference[]): EntityReference[] {
  const seen = new Map<string, EntityReference>();
  for (const ref of refs) seen.set(`${ref.type}:${ref.id}`, ref);
  return Array.from(seen.values());
}

export async function askAdvisor(
  question: string,
  pageContext: PageContext | null,
  history: AdvisorTurn[] = [],
): Promise<AdvisorResponse> {
  if (!provider.isConfigured()) {
    return {
      ok: false,
      reason: "not_configured",
      message: "No AI provider is connected yet. Add AI_PROVIDER_API_KEY in Settings / Integrations to enable the advisor.",
    };
  }

  const messages: AIMessage[] = [];
  for (const turn of history.slice(-6)) {
    messages.push({ role: "user", content: turn.question });
    messages.push({ role: "assistant", content: turn.answer });
  }

  const questionWithContext = pageContext ? `[Page context: ${pageContext.summary}]\n\n${question}` : question;
  messages.push({ role: "user", content: questionWithContext });

  const references: EntityReference[] = pageContext?.entity ? [pageContext.entity] : [];
  const toolsUsed: string[] = [];
  const tools = toolDefinitions();

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const result = await provider.complete({ system: buildSystemPrompt(), messages, tools });

    if (result.stopReason === "error") {
      return {
        ok: false,
        reason: "upstream_error",
        message: result.errorMessage ?? "The AI provider returned an error.",
      };
    }

    if (result.stopReason !== "tool_use") {
      // end_turn or max_tokens — either way, this is the final answer.
      if (!result.text) {
        return { ok: false, reason: "upstream_error", message: "The AI provider returned an empty response." };
      }
      return { ok: true, answer: result.text, references: dedupeReferences(references), toolsUsed };
    }

    // Echo the assistant's tool_use turn back verbatim, then run every
    // requested tool and answer with tool_result blocks in the same order —
    // Anthropic's tool-use protocol requires this exact request/response
    // shape before the model will continue.
    messages.push({ role: "assistant", content: result.rawContent as AIContentBlock[] });

    const toolResultBlocks = await Promise.all(
      result.toolUses.map(async (call) => {
        const spec = findTool(call.name);
        if (!spec) {
          return {
            type: "tool_result" as const,
            tool_use_id: call.id,
            content: JSON.stringify({ error: `Unknown tool "${call.name}".` }),
            is_error: true,
          };
        }
        try {
          const input = (call.input ?? {}) as Record<string, unknown>;
          const { data, references: toolRefs } = await spec.execute(input);
          toolsUsed.push(call.name);
          if (toolRefs) references.push(...toolRefs);
          return { type: "tool_result" as const, tool_use_id: call.id, content: JSON.stringify(data) };
        } catch (err) {
          return {
            type: "tool_result" as const,
            tool_use_id: call.id,
            content: JSON.stringify({ error: err instanceof Error ? err.message : "Tool execution failed." }),
            is_error: true,
          };
        }
      }),
    );

    messages.push({ role: "user", content: toolResultBlocks });
  }

  return {
    ok: false,
    reason: "upstream_error",
    message: "Jarvis needed more tool calls than expected to answer that — try asking a narrower question.",
  };
}

export { ALL_TOOLS };
