import { isSupabaseConfigured } from "@/lib/env";
import type { DataResult } from "@/types/domain";

export const NOT_CONFIGURED_ERROR =
  "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to .env.local.";

/**
 * Wraps a data-access call so every function in lib/data returns a
 * consistent DataResult instead of throwing — pages can then render a
 * dedicated "not configured" / error / empty state instead of crashing.
 */
export async function withDataResult<T>(
  fn: () => Promise<T>,
): Promise<DataResult<T>> {
  if (!isSupabaseConfigured()) {
    return { data: null, error: NOT_CONFIGURED_ERROR };
  }
  try {
    const data = await fn();
    return { data, error: null };
  } catch (err) {
    const message = extractErrorMessage(err);
    console.error("[jarvis:data]", message, err);
    return { data: null, error: message };
  }
}

/**
 * Supabase/PostgREST errors are plain objects with a `message` field, not
 * instances of the native Error class — `err instanceof Error` misses them
 * and silently swallows the real reason (missing relationship, RLS denial,
 * bad column name, etc.) behind a generic message.
 */
export function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err && typeof err.message === "string") {
    return err.message;
  }
  return "Unknown error while loading data.";
}

/**
 * True for a Postgres error caused by a value that isn't a real UUID (a
 * mistyped or truncated URL, most often). This and "no matching row" — which
 * maybeSingle() already returns as a clean `{data: null}` rather than
 * throwing — are the two ways a detail-page id that doesn't resolve to a
 * real record shows up. Both must read as an ordinary "not found," never a
 * raw database error surfaced to the owner.
 */
export function isMalformedIdError(message: string): boolean {
  return message.toLowerCase().includes("invalid input syntax");
}

/**
 * Runs a `.maybeSingle()` detail query and collapses "no such id" (however
 * it manifests — genuinely absent, or a malformed id Postgres rejects
 * outright) into a clean `null`, while still throwing a real error for
 * anything else. Every `getXById` in this app's data layer should route its
 * primary lookup through this instead of `.single()`, which throws a raw
 * "JSON object requested, multiple (or no) rows returned" for the entirely
 * ordinary case of a stale link or deleted record — a defect first found and
 * fixed in getJobById (2026-09-22), then applied here everywhere else the
 * same `.single()` pattern existed.
 */
export async function getOrNotFound<T>(
  query: PromiseLike<{ data: T | null; error: { message: string } | null }>,
): Promise<T | null> {
  const { data, error } = await query;
  if (error) {
    if (isMalformedIdError(error.message)) return null;
    throw error;
  }
  return data;
}
