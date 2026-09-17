"use client";

import { useEffect } from "react";

/**
 * Supabase's DEFAULT password-recovery email (the one that ships without
 * custom SMTP configured, which is what this project is on) links to
 * Supabase's own hosted verify endpoint, not directly into the app. That
 * endpoint verifies the token server-side, then bounces the browser to the
 * project's Site URL with the new session encoded as a URL **hash
 * fragment** (`#access_token=...&refresh_token=...&type=recovery`) — a
 * fragment is never sent to the server, so nothing server-side (middleware,
 * a route handler) can ever see or act on it. Only client-side JS running
 * in the browser can read `window.location.hash`.
 *
 * This component is mounted once in the root layout — so it runs on
 * whatever page the browser actually lands on (typically `/`, since that's
 * the configured Site URL) — and does exactly one thing: if that specific
 * recovery hash shape is present, it hands off to `/reset-password`,
 * preserving the hash so that page's own client-side code can pick up the
 * tokens and finish establishing the session there. On every other page
 * load (the overwhelming majority), the hash doesn't match and this is a
 * silent no-op — it does not touch normal navigation or existing sessions.
 */
export function RecoveryRedirect() {
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash || hash.length < 2) return;
    const params = new URLSearchParams(hash.slice(1));
    if (params.get("type") === "recovery" && params.get("access_token")) {
      if (window.location.pathname !== "/reset-password") {
        window.location.replace(`/reset-password${hash}`);
      }
    }
  }, []);

  return null;
}
