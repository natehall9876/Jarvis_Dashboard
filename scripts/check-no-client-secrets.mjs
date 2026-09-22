#!/usr/bin/env node
// Guards the real thing "ensure secrets stay server-side" actually means:
// not just "no code review missed a mistake today" but "this stays true".
// Requires npm run build to have already produced .next/static/.
//
// Found a genuine violation once (2026-09-22): src/lib/env.ts mixed the
// public Supabase anon config together with every OAuth client secret and
// the Supabase service-role key in one flat module. Because
// src/lib/supabase/client.ts (client-reachable) imports the public half,
// Turbopack pulled the WHOLE module — including every process.env.X
// reference for the secret half — into a client chunk. The actual secret
// VALUES were never inlined (Next only build-time-inlines NEXT_PUBLIC_*
// vars), but the reference chain itself was real. Fixed by splitting into
// env.ts (public) and env.server.ts (guarded by the `server-only` package,
// which turns any recurrence of this into a build error on its own — this
// script is the second, independent layer: it checks the actual shipped
// output, not just the import graph).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const STATIC_DIR = join(process.cwd(), ".next", "static");

// Fingerprints that must NEVER appear in client-shipped JS. Provider token/
// revoke endpoints are included alongside the env var names themselves —
// even if an env var name got inlined away, the literal URL a client would
// need to actually exfiltrate a token to is an equally strong signal that
// server-only OAuth logic leaked into the bundle.
const FORBIDDEN = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "HOMEWORKS_WEBHOOK_SECRET",
  "HOMEWORKS_API_KEY",
  "ZAPIER_WEBHOOK_URL",
  "oauth.platform.intuit.com",
  "developer.api.intuit.com",
  "oauth2.googleapis.com",
  "appcenter.intuit.com/connect/oauth2",
  "accounts.google.com/o/oauth2",
];
// These are checked separately: client ids (never secret themselves) and
// client secrets both legitimately appear as plain string LABELS in the
// "not configured" instructional copy inside the QuickBooks/Google
// Calendar/Homeworks settings cards ("<code>QUICKBOOKS_CLIENT_SECRET</code>
// is missing..."), which is real, allowed client UI text — so a bare
// substring match would always "fail". Flagged only if found immediately
// adjacent to a `process.env.` read, which is what an actual leaked
// reference looks like instead.
const CONTEXTUAL = ["QUICKBOOKS_CLIENT_SECRET", "QUICKBOOKS_CLIENT_ID", "GOOGLE_CALENDAR_CLIENT_SECRET", "GOOGLE_CALENDAR_CLIENT_ID", "HOMEWORKS_OAUTH_CLIENT_ID"];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (entry.endsWith(".js")) out.push(full);
  }
  return out;
}

let files;
try {
  files = walk(STATIC_DIR);
} catch {
  console.error(`No ${STATIC_DIR} found — run "npm run build" first.`);
  process.exit(2);
}

const violations = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const needle of FORBIDDEN) {
    const idx = text.indexOf(needle);
    if (idx !== -1) violations.push({ file, needle, context: text.slice(Math.max(0, idx - 60), idx + needle.length + 20) });
  }
  for (const needle of CONTEXTUAL) {
    let from = 0;
    while (true) {
      const idx = text.indexOf(needle, from);
      if (idx === -1) break;
      const context = text.slice(Math.max(0, idx - 80), idx + needle.length + 10);
      if (context.includes("process.env") || context.includes(".env.")) {
        violations.push({ file, needle, context });
      }
      from = idx + needle.length;
    }
  }
}

if (violations.length > 0) {
  console.error(`Found ${violations.length} secret-boundary violation(s) in the client bundle:\n`);
  for (const v of violations) {
    console.error(`  ${v.file}\n    matched: ${v.needle}\n    context: ...${v.context}...\n`);
  }
  process.exit(1);
}

console.log(`Checked ${files.length} client JS files under .next/static — no server secret references found.`);
