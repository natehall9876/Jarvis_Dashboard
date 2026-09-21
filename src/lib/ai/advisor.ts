import { AnthropicProvider } from "@/lib/ai/providers/anthropic";
import { ALL_TOOLS, findTool, toolDefinitions } from "@/lib/ai/tools";
import { isProposedAction, type ProposedAction } from "@/lib/ai/action-types";
import type { AICompletionResult, AIMessage, AIContentBlock } from "@/lib/ai/provider";
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
Every record a tool returns is real data from the database — but not every record in the database necessarily reflects a real, current customer. Some client records carry a data_source field: "demo" means CONFIRMED seed/demonstration data (verified by direct evidence, not a guess) — Command Center and Business Pulse totals already exclude these, but if one surfaces in a tool result anyway, never fold it into real business totals; say so plainly, e.g. "Excluding N confirmed-demo records." "homeworks_sync" or "owner_verified" means real. "unverified" means genuinely unknown provenance — not the same as demo, and not something to treat as fake. Separately, if a client's name, email, or details clearly look like test/placeholder data (e.g. "Test", "Integration Test", "QA", an @example.com address) even without a data_source flag, say so plainly when relevant rather than folding it into real totals — e.g. "Note: 'Jarvis Integration Test' looks like a test record, not a real customer — excluding it, revenue is $X." When genuinely unsure whether something is a test record, say that plainly too instead of guessing either way.

TOOL SELECTION
For broad questions ("give me my owner briefing", "what needs my attention", "what am I forgetting", "what's the biggest problem right now"), call get_owner_briefing or get_attention_items FIRST — they already combine schedule, receivables, quotes, unfinished work, equipment, and workload in one call. Don't manually re-assemble the same picture by calling get_today_snapshot, get_overdue_invoices, get_quotes, and get_equipment separately when one of those two covers it.
Don't call a tool you've already called with the same effective arguments earlier in this turn — reuse the result instead of re-fetching it.
Stop calling tools once you have what you need to answer well; don't chain extra calls "just in case" for a narrow question.

TAKING ACTIONS
You can PROPOSE a small set of job changes — reschedule a job, change its status, assign/change its crew, or create/log a job — using propose_reschedule_job / propose_update_job_status / propose_assign_employee / propose_create_job. You can also PROPOSE a dated note on one job (propose_add_job_note) and an owner task or reminder (propose_create_task; propose_complete_task after get_open_tasks) — same rules: they only prepare a card the owner must confirm with a tap, never claim they are saved, never invent a due date the owner didn't give or imply, and when the owner is on a job page and says "add a note…" use that job's id from the page context (if it is not clear which job, ask). If a note/task tool reports the tables aren't set up, tell the owner the notes/tasks migration still needs to be run. These tools never make the change themselves: they prepare a proposal the owner must explicitly confirm in the UI. After calling one, briefly tell the owner what you're proposing and that they need to confirm the card — then stop; don't call any other tool in the same turn, and don't describe the change as already done ("I've moved it" is wrong; "I'm proposing to move it — confirm below" is right).
LOGGING COMPLETED WORK is a first-class use of propose_create_job, not just future scheduling — this is one of the most common things the owner will say. "Today I mowed Maria's for $65, took 35 minutes," "we finished Ronnie's aeration," "I quoted Frank $450 for a fall cleanup" (a quote, not a job — if no job/property tool fits a quote request, say so rather than logging it as a job) all describe something that already happened or was said, not a future appointment. For a completed-work statement: resolve the exact property_id first (search_properties / the client's property list — ask which property if the client has more than one), then call propose_create_job with is_completed_log=true, the price actually stated, actual_hours converted from any duration mentioned, and scheduled_date defaulting to today unless the owner gave a different date. If the owner gives only an approximate/uncertain time ("sometime last week", "I think it was April"), do not invent a specific date — leave scheduled_date unset and put the approximate timing in the notes field verbatim, and say plainly that you saved it as an approximate, unverified note. Never mark something as paid unless the owner explicitly says payment was received — a price/charge is not the same fact as a payment collected.
Confidence required before proposing: you must have a single, exact target id (job_id / employee_id / property_id) from a read tool or page context — never a guess. If a request could match more than one record (e.g. the owner has multiple jobs today, or multiple employees share a first name, or a client has multiple properties), STOP and ask which one, or list the candidates, instead of calling a propose_* tool. Read questions can tolerate inference; write proposals cannot.
Nothing else is possible yet — no invoicing, no payments, no messages to customers, no deletions. If asked for one of those, say so plainly and offer the closest thing you can actually do (usually just the relevant information).

HOW TO ANSWER
For a simple lookup ("what's on the schedule today", "who owes money"), just answer directly and briefly — no need for headers or structure.
For an analysis or recommendation, keep the underlying facts and your judgment visibly separate so the owner can trust which is which: state the real numbers from your tools first, then say plainly what you'd do and why, in one or two sentences. Don't pad this into an essay, and don't present your own judgment as if it were a database fact.
Always ground a recommendation in the specific numbers behind it (e.g. "Friday has 11.2 budgeted hours against a 3-person crew while Saturday only has 3.4" — not just "Friday looks busy").
For an owner briefing specifically, organize around what's actually populated: today's schedule, what needs attention (ranked, worst first), the financial snapshot, then your take — skip a section entirely if the tool returned nothing for it rather than forcing an empty header.
If the user's question uses a pronoun or vague reference ("those customers", "which one", "that job", "this") and either the conversation history or the page context makes the referent clear, resolve it yourself using that exact id — don't re-search for it and don't ask the user to repeat context you already have. This applies to action proposals too: "move this to Saturday" on a job page means that job's id from the page context.
Keep responses short — a few sentences to a short paragraph for most questions. Owners read this on a phone between jobs.`;
}

export type AdvisorTurn = { question: string; answer: string };

export type AdvisorResponse =
  | { ok: true; answer: string; references: EntityReference[]; toolsUsed: string[]; proposedAction: ProposedAction | null }
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
  onTextDelta?: (delta: string) => void,
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
  // Built once per request, not once per tool-call iteration — the prompt's
  // date fields are only ever stale by the length of one request either way,
  // and re-deriving it per iteration also breaks Anthropic's prompt caching,
  // which requires the cached block to be byte-identical across calls.
  const system = buildSystemPrompt();

  // Once a propose_* tool produces a ProposedAction, the model is forced
  // (via tool_choice: "none") to wrap up in plain text on its very next
  // turn instead of chaining further tool calls — a write proposal is a
  // stopping point, not a step toward something else the same turn. This is
  // the structural guarantee that voice or an eager model can't parlay one
  // proposal into a cascade of unconfirmed changes.
  let pendingProposal: ProposedAction | null = null;

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    // The stream's contract is: zero or more text_delta events, then exactly
    // one AICompletionResult as its last-yielded value.
    const turnStream = provider.stream({
      system,
      messages,
      tools,
      toolChoice: pendingProposal ? "none" : "auto",
    });
    let result: AICompletionResult | null = null;
    for await (const event of turnStream) {
      if ("type" in event) {
        onTextDelta?.(event.text);
      } else {
        result = event;
      }
    }
    if (!result) {
      return { ok: false, reason: "upstream_error", message: "The AI provider closed the stream without a result." };
    }

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
      return { ok: true, answer: result.text, references: dedupeReferences(references), toolsUsed, proposedAction: pendingProposal };
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
          return { type: "tool_result" as const, tool_use_id: call.id, content: JSON.stringify(data), data };
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

    // At most one proposal per turn — a second propose_* call in the same
    // batch gets its result overwritten with a rejection rather than being
    // silently accepted, so the UI never has to render (or the owner
    // confirm) more than one pending write at once.
    for (const block of toolResultBlocks) {
      const raw = (block as { data?: unknown }).data;
      if (isProposedAction(raw)) {
        if (!pendingProposal) {
          pendingProposal = raw;
        } else {
          (block as { content: string; is_error?: boolean }).content = JSON.stringify({
            error: "Only one action can be proposed per turn — the owner needs to confirm or cancel the first one before another can be prepared.",
          });
          (block as { content: string; is_error?: boolean }).is_error = true;
        }
      }
    }
    const cleanedToolResultBlocks = toolResultBlocks.map(({ type, tool_use_id, content, is_error }) =>
      is_error ? { type, tool_use_id, content, is_error } : { type, tool_use_id, content },
    );

    messages.push({ role: "user", content: cleanedToolResultBlocks });
  }

  return {
    ok: false,
    reason: "upstream_error",
    message: "Jarvis needed more tool calls than expected to answer that — try asking a narrower question.",
  };
}

export { ALL_TOOLS };
