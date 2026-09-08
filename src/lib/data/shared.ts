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
function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err && typeof err.message === "string") {
    return err.message;
  }
  return "Unknown error while loading data.";
}
