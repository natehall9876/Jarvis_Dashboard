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
    return {
      data: null,
      error: err instanceof Error ? err.message : "Unknown error while loading data.",
    };
  }
}
