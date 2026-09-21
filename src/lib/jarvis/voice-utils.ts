/**
 * Pure helpers for the persistent voice layer. No DOM, no React — so the
 * behaviours that matter (what gets spoken, what counts as a navigation
 * command) are unit-testable.
 */

/** Markdown -> plain text suitable for speech synthesis. */
export function stripForSpeech(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/(\*\*|__|\*|_|~~)/g, "")
    .replace(/\|/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/**
 * Streaming text arrives in fragments. Returns the complete sentences found at
 * or after `fromIndex` and the index to resume from, so speech can begin while
 * the rest of the answer is still generating — without ever speaking a
 * half-finished sentence. A sentence ends at . ! ? followed by whitespace, or
 * at a newline.
 */
export function takeSpeakableSentences(text: string, fromIndex: number, final = false): { sentences: string[]; nextIndex: number } {
  const sentences: string[] = [];
  let start = fromIndex;
  const re = /[.!?]+(?=\s)|\n+/g;
  re.lastIndex = fromIndex;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const end = m.index + m[0].length;
    const piece = stripForSpeech(text.slice(start, end));
    if (piece) sentences.push(piece);
    start = end;
  }
  if (final) {
    const rest = stripForSpeech(text.slice(start));
    if (rest) sentences.push(rest);
    start = text.length;
  }
  return { sentences, nextIndex: start };
}

export type NavTarget = { label: string; href: string };

const ROUTES: { words: RegExp; target: NavTarget }[] = [
  { words: /\b(command center|home|dashboard|today screen)\b/, target: { label: "the Command Center", href: "/" } },
  { words: /\b(schedule|calendar)\b/, target: { label: "the schedule", href: "/schedule" } },
  { words: /\b(customers?|clients?)\b(?!\s+\w)/, target: { label: "your clients", href: "/clients" } },
  { words: /\bproperties\b/, target: { label: "your properties", href: "/properties" } },
  { words: /\bjobs\b/, target: { label: "your jobs", href: "/jobs" } },
  { words: /\broutes?\b/, target: { label: "your routes", href: "/routes" } },
  { words: /\b(quotes?|estimates?)\b/, target: { label: "your quotes", href: "/quotes" } },
  { words: /\binvoices?\b/, target: { label: "your invoices", href: "/invoices" } },
  { words: /\bemployees?|crew\b/, target: { label: "your employees", href: "/employees" } },
  { words: /\bequipment\b/, target: { label: "your equipment", href: "/equipment" } },
  { words: /\bexpenses?\b/, target: { label: "your expenses", href: "/expenses" } },
  { words: /\breports?\b/, target: { label: "your reports", href: "/reports" } },
  { words: /\bsettings?\b/, target: { label: "settings", href: "/settings" } },
];

export type NavIntent =
  | { kind: "route"; target: NavTarget }
  | { kind: "entity"; query: string }
  | { kind: "none" };

const NAV_VERB = /^(?:hey |ok |okay )?(?:jarvis[, ]+)?(?:please )?(open|show me|show|pull up|bring up|go to|take me to|navigate to|find|look up)\b\s*(.*)$/i;

/**
 * Deterministic navigation. "Open my schedule" is a route change and needs no
 * language model. "Pull up Rob Elliot" is an entity lookup: the advisor
 * resolves it, and the caller only navigates if exactly one record matched.
 */
export function parseNavigationIntent(utterance: string): NavIntent {
  const text = utterance.trim().replace(/[.?!]+$/g, "");
  const match = NAV_VERB.exec(text);
  if (!match) return { kind: "none" };
  const rest = match[2].toLowerCase().replace(/^(my|the|our|all)\s+/, "").trim();
  if (!rest) return { kind: "none" };
  for (const r of ROUTES) if (r.words.test(rest) && rest.split(/\s+/).length <= 3) return { kind: "route", target: r.target };
  return { kind: "entity", query: match[2].trim() };
}

/** Maps a Jarvis tool name to the capability nodes it exercises, so the network highlights what was actually consulted. */
export function toolToCapabilities(tool: string): string[] {
  const t = tool.toLowerCase();
  if (t.includes("workload") || t.includes("today_snapshot") || t.includes("owner_briefing")) return ["schedule", "jobs"];
  if (t.includes("attention")) return ["schedule", "finances", "equipment"];
  if (t.includes("task")) return ["tasks"];
  if (t.includes("job_note")) return ["jobs", "tasks"];
  if (t.includes("propose_create_job") || t.includes("propose_reschedule") || t.includes("propose_update_job") || t.includes("job")) return ["jobs", "schedule"];
  if (t.includes("propose_assign_employee") || t.includes("employee")) return ["employees", "jobs"];
  if (t.includes("client")) return ["customers"];
  if (t.includes("propert")) return ["properties"];
  if (t.includes("route")) return ["routes"];
  if (t.includes("quote")) return ["estimates"];
  if (t.includes("invoice") || t.includes("expense") || t.includes("pulse") || t.includes("report")) return ["finances"];
  if (t.includes("equipment")) return ["equipment"];
  return [];
}
