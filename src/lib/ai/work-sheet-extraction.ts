import { integrationEnv, isIntegrationConfigured } from "@/lib/env.server";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-sonnet-5";

/**
 * A field the model wasn't confident about is null, never a guess — the
 * owner reviews and fills gaps themselves. `legible` false means the model
 * couldn't read enough of the image to extract most fields at all; the UI
 * should treat that as "needs manual entry," not silently show empty
 * fields as if extraction succeeded.
 */
export type WorkSheetExtraction = {
  legible: boolean;
  work_date_guess: string | null;
  date_confidence: "exact" | "approximate" | "unknown";
  customer_name_guess: string | null;
  property_address_guess: string | null;
  service_description: string | null;
  employees_mentioned: string[];
  hours_worked_guess: number | null;
  price_guess: number | null;
  notes: string | null;
  uncertain_fields: string[];
  raw_model_notes: string | null;
};

export type ExtractionResult = { ok: true; data: WorkSheetExtraction } | { ok: false; message: string };

const EXTRACTION_SYSTEM_PROMPT = `You are reading a handwritten or photographed work sheet from a lawn care business, for a human to review and correct before anything is saved as a real record. Extract only what you can actually read — never invent a name, date, address, price, or hours that isn't legibly present. If handwriting is ambiguous, put your best reading in the field and note the uncertainty in uncertain_fields; if a field isn't present at all, use null. If the image is blurry, empty, unrelated, or otherwise not a legible work sheet, set legible to false and leave the other fields null/empty rather than guessing at anything.

Respond with ONLY a JSON object, no other text, matching exactly this shape:
{
  "legible": boolean,
  "work_date_guess": string | null,  // ISO YYYY-MM-DD only if an exact date is written; otherwise null even if a rough time period is mentioned
  "date_confidence": "exact" | "approximate" | "unknown",
  "customer_name_guess": string | null,
  "property_address_guess": string | null,
  "service_description": string | null,
  "employees_mentioned": string[],
  "hours_worked_guess": number | null,  // decimal hours
  "price_guess": number | null,
  "notes": string | null,  // anything else legible worth keeping, including an approximate date/time period if work_date_guess is null
  "uncertain_fields": string[],  // names of fields above you're not confident about
  "raw_model_notes": string | null  // anything about the image itself worth flagging (e.g. "bottom of page is cut off")
}`;

/**
 * One-shot vision call, deliberately separate from the AI Advisor's
 * streaming tool-calling pipeline (lib/ai/advisor.ts) — this has nothing to
 * do with a conversation, needs no tools, and a wrong coupling here would
 * risk destabilizing the advisor loop for an unrelated feature. Never
 * writes anything; the caller is responsible for showing this to the owner
 * for review and correction before any of it becomes a real record.
 */
export async function extractWorkSheetInfo(imageBase64: string, mediaType: string): Promise<ExtractionResult> {
  if (!isIntegrationConfigured("aiProvider")) {
    return { ok: false, message: "No AI provider is connected — add AI_PROVIDER_API_KEY to enable work-sheet extraction." };
  }

  let response: Response;
  try {
    response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": integrationEnv.aiProvider.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: process.env.AI_PROVIDER_MODEL || DEFAULT_MODEL,
        max_tokens: 1024,
        system: EXTRACTION_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
              { type: "text", text: "Extract the work sheet information as specified." },
            ],
          },
        ],
      }),
    });
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Failed to reach the AI provider." };
  }

  if (!response.ok) {
    const body = await response.text();
    return { ok: false, message: `AI provider returned an error (${response.status}): ${body.slice(0, 300)}` };
  }

  const json = (await response.json()) as { content?: { type: string; text?: string }[] };
  const textBlock = (json.content ?? []).find((b) => b.type === "text");
  if (!textBlock?.text) return { ok: false, message: "The AI provider returned an empty response." };

  let parsed: unknown;
  try {
    // The model is instructed to return JSON only, but strip a code fence
    // defensively in case it wraps the response in one anyway.
    const cleaned = textBlock.text.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    parsed = JSON.parse(cleaned);
  } catch {
    return { ok: false, message: "Couldn't parse the extraction result — the model didn't return valid JSON." };
  }

  return { ok: true, data: normalizeExtraction(parsed) };
}

function normalizeExtraction(raw: unknown): WorkSheetExtraction {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown): string | null => (typeof v === "string" && v.trim().length > 0 ? v.trim() : null);
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const strArray = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const confidence = r.date_confidence === "exact" || r.date_confidence === "approximate" ? r.date_confidence : "unknown";

  return {
    legible: r.legible === true,
    work_date_guess: confidence === "exact" ? str(r.work_date_guess) : null,
    date_confidence: confidence,
    customer_name_guess: str(r.customer_name_guess),
    property_address_guess: str(r.property_address_guess),
    service_description: str(r.service_description),
    employees_mentioned: strArray(r.employees_mentioned),
    hours_worked_guess: num(r.hours_worked_guess),
    price_guess: num(r.price_guess),
    notes: str(r.notes),
    uncertain_fields: strArray(r.uncertain_fields),
    raw_model_notes: str(r.raw_model_notes),
  };
}
