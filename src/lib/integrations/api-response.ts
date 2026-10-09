import { quickBooksFailureDetails } from "@/lib/integrations/quickbooks-diagnostics";

export type ApiFailure = {
  ok: false;
  message: string;
  reason: "reauth_required" | "forbidden" | "throttled" | "error";
  retryable?: boolean;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Bound provider reads; never put a raw provider body or network exception in the UI. */
export async function fetchApiJson<T>(provider: string, url: string, init: RequestInit = {}): Promise<{ ok: true; data: T } | ApiFailure> {
  try {
    const response = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (!response.ok) {
      const diagnostic = provider === "QuickBooks" ? await quickBooksFailureDetails(response) : "";
      if (provider !== "QuickBooks") await response.body?.cancel();
      if (response.status === 401) return { ok: false, reason: "reauth_required", message: provider + " rejected the saved authorization. Reconnect from Settings." };
      if (response.status === 403) return { ok: false, reason: "forbidden", message: provider + " denied this read" + diagnostic + ". Check account permissions and app access." };
      if (response.status === 429) return { ok: false, reason: "throttled", retryable: true, message: provider + " is rate-limiting requests. Try again shortly." };
      return { ok: false, reason: "error", retryable: response.status >= 500, message: provider + " API returned HTTP " + response.status + ". Try again; no partial result was used." };
    }
    let value: unknown;
    try { value = await response.json(); } catch {
      return { ok: false, reason: "error", message: provider + " returned invalid JSON. No result was used." };
    }
    if (!isRecord(value)) return { ok: false, reason: "error", message: provider + " returned an invalid response. No result was used." };
    return { ok: true, data: value as T };
  } catch {
    return { ok: false, reason: "error", retryable: true, message: provider + " could not be reached or the request timed out. Try again." };
  }
}

export function invalidApiResponse(provider: string): ApiFailure {
  return { ok: false, reason: "error", message: provider + " returned incomplete or invalid data. No partial result was used." };
}
