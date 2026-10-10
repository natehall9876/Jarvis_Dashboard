import type { Exchange } from "@/components/jarvis/jarvis-provider";
import type { EntityReference } from "@/lib/ai/tool-types";

const MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const TYPES = new Set(["client", "property", "job", "invoice", "quote", "employee", "equipment", "route"]);
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export const deviceMemoryKey = (owner: string) => `jarvis.device.v1:${owner}`;

/** Local history is context only. Never deserialize executable action cards. */
export function readDeviceMemory(raw: string | null, owner: string, now = Date.now()): { exchanges: Exchange[]; muted: boolean } {
  const empty = { exchanges: [] as Exchange[], muted: false };
  try {
    if (!raw || raw.length > 1_000_000) return empty;
    const saved: unknown = JSON.parse(raw);
    if (!record(saved) || saved.version !== 1 || saved.owner !== owner || !Array.isArray(saved.exchanges)) return empty;
    const exchanges: Exchange[] = [];
    for (const value of saved.exchanges) {
      if (exchanges.length === 20) break;
      if (!record(value) || value.status !== "done" || typeof value.id !== "string" || typeof value.question !== "string" || value.question.length > 2000 || typeof value.answer !== "string" || value.answer.length > 20000 || typeof value.createdAt !== "number" || !Number.isFinite(value.createdAt) || value.createdAt > now || now - value.createdAt > MAX_AGE) continue;
      const references = Array.isArray(value.references) ? value.references.filter((ref): ref is EntityReference => record(ref) && typeof ref.type === "string" && TYPES.has(ref.type) && typeof ref.id === "string" && /^[\w-]+$/.test(ref.id) && typeof ref.label === "string").slice(0, 30) : [];
      exchanges.push({ id: value.id, question: value.question, answer: value.answer, status: "done", error: null, references, toolsUsed: Array.isArray(value.toolsUsed) ? value.toolsUsed.filter((t): t is string => typeof t === "string").slice(0, 30) : [], proposedAction: null, viaVoice: value.viaVoice === true, createdAt: value.createdAt, restored: true });
    }
    return { exchanges, muted: saved.muted === true };
  } catch { return empty; }
}

export function writeDeviceMemory(owner: string, exchanges: Exchange[], muted: boolean): string {
  // Reuse validation/bounds at the write boundary as well as the read boundary.
  const validated = readDeviceMemory(JSON.stringify({ version: 1, owner, exchanges, muted }), owner);
  return JSON.stringify({ version: 1, owner, exchanges: validated.exchanges, muted });
}

export function toolProgressLabel(tool: string): string {
  if (tool.startsWith("propose_")) return "Preparing an action for your review";
  if (tool.includes("connection")) return "Checking your connections";
  if (tool.includes("homeworks")) return "Checking the Homeworks source";
  if (tool.includes("briefing") || tool.includes("attention")) return "Reviewing what needs your attention";
  if (tool.includes("collection") || tool.includes("invoice")) return "Checking invoice records";
  if (tool.includes("job") || tool.includes("today") || tool.includes("workload")) return "Checking your schedule and jobs";
  if (tool.includes("client") || tool.includes("propert")) return "Looking up the customer record";
  if (tool.includes("task")) return "Checking your tasks";
  return "Checking business records";
}

/** Bound transient errors separately so stopping requests never displaces context. */
export function retainSessionExchanges(exchanges: Exchange[]): Exchange[] {
  let completed = 0;
  let transient = 0;
  return exchanges.filter(exchange => exchange.status === "done" ? completed++ < 20 : transient++ < 20);
}
