/** Never forward a raw token endpoint body into logs, URLs, or the UI. */
export function tokenEndpointError(provider: string, status: number, body: string): string {
  const code = /\b(invalid_grant|invalid_client|invalid_request|unauthorized_client|unsupported_grant_type|invalid_scope|access_denied|temporarily_unavailable|server_error)\b/.exec(body)?.[1];
  return `${provider} token endpoint returned ${status}${code ? ": " + code : ""}.`;
}

export async function readTokenResponse<T>(response: Response, provider: string, options: { requireRefresh: boolean; requireRefreshExpiry?: boolean }): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  let data: unknown;
  try { data = await response.json(); } catch {
    return { ok: false, message: `${provider} returned an invalid token response.` };
  }
  const value = data as Record<string, unknown> | null;
  const nonempty = (v: unknown) => typeof v === "string" && v.trim().length > 0;
  const validExpiry = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v > 0 && Number.isFinite(new Date(Date.now() + v * 1000).getTime());
  if (!value || typeof value !== "object" || !nonempty(value.access_token) || !validExpiry(value.expires_in)
    || (options.requireRefresh && !nonempty(value.refresh_token))
    || (options.requireRefreshExpiry && !validExpiry(value.x_refresh_token_expires_in))) {
    return { ok: false, message: `${provider} returned an incomplete token response; the connection was not saved.` };
  }
  return { ok: true, data: value as T };
}

/** OAuth invalid_grant requires consent again; configuration/temporary failures do not. */
export async function readTokenError(response: Response, provider: string): Promise<{ ok: false; message: string; reauthRequired: boolean }> {
  let body = "";
  try { body = await response.text(); } catch { /* An interrupted error body is still a failed request. */ }
  let reauthRequired = false;
  try {
    const error = JSON.parse(body) as { error?: unknown };
    reauthRequired = error.error === "invalid_grant";
  } catch { /* No structured OAuth error code. */ }
  return { ok: false, message: tokenEndpointError(provider, response.status, body), reauthRequired };
}
