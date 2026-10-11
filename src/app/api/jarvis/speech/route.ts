import { createSupabaseServerClient } from "@/lib/supabase/server";

export const maxDuration = 60;
const VOICES = new Set(["alloy", "ash", "ballad", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer", "verse", "marin", "cedar"]);
const INSTRUCTIONS = "Use a natural, contemporary British English accent. Be composed, warm and quietly attentive, with understated dry wit only where the supplied words warrant it. Speak clearly at a conversational pace, with brief natural pauses. No theatrical delivery, no impression of an actor or fictional character. Read only the supplied text; do not add words.";
const NO_STORE = { "cache-control": "private, no-store" };

/** Paid speech follows the same active app_members owner rule as integrations. */
async function speechAccess(): Promise<Response | null> {
  try {
    const client = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) return Response.json({ error: "Sign in to use Jarvis speech." }, { status: 401, headers: NO_STORE });
    const { data, error } = await client.from("app_members").select("role, active").eq("user_id", user.id).maybeSingle();
    if (error || !data || data.role !== "owner" || data.active !== true) {
      return Response.json({ error: "An active Jarvis owner account is required to use speech." }, { status: 403, headers: NO_STORE });
    }
    return null;
  } catch {
    return Response.json({ error: "Speech access could not be verified. Sign in and retry." }, { status: 401, headers: NO_STORE });
  }
}

/** Capability discovery never makes a paid provider request or reveals a key. */
export async function GET() {
  const denied = await speechAccess();
  if (denied) return denied;
  const configured = Boolean(process.env.OPENAI_API_KEY?.trim());
  const requestedVoice = process.env.JARVIS_SPEECH_VOICE ?? "cedar";
  return Response.json({ engine: configured ? "neural" : "browser", voice: configured ? (VOICES.has(requestedVoice) ? requestedVoice : "cedar") : null, reason: configured ? null : "not_configured" }, { headers: NO_STORE });
}

export async function POST(request: Request) {
  const denied = await speechAccess();
  if (denied) return denied;
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Speech requests must originate from Jarvis." }, { status: 403, headers: NO_STORE });
  let text: unknown;
  try { text = (await request.json())?.text; }
  catch { return Response.json({ error: "Invalid speech request." }, { status: 400, headers: NO_STORE }); }
  if (typeof text !== "string" || !text.trim() || text.length > 4096) return Response.json({ error: "Speech text must contain 1–4096 characters." }, { status: 400, headers: NO_STORE });
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return Response.json({ error: "Neural speech is not configured. Device speech is available instead.", reason: "not_configured" }, { status: 503, headers: NO_STORE });
  const requestedVoice = process.env.JARVIS_SPEECH_VOICE ?? "cedar";
  const abort = new AbortController();
  const disconnected = () => abort.abort();
  request.signal.addEventListener("abort", disconnected, { once: true });
  const deadline = setTimeout(() => abort.abort(), 55_000);
  const cleanup = () => { clearTimeout(deadline); request.signal.removeEventListener("abort", disconnected); };
  if (request.signal.aborted) abort.abort();
  try {
    const upstream = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST", signal: abort.signal,
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ model: "gpt-4o-mini-tts", voice: VOICES.has(requestedVoice) ? requestedVoice : "cedar", input: text.trim(), instructions: INSTRUCTIONS, response_format: "pcm", stream_format: "audio" }),
    });
    if (!upstream.ok || !upstream.body) {
      await upstream.body?.cancel(); cleanup();
      return Response.json({ error: upstream.status === 429 ? "Neural speech is busy. Retry shortly." : "Neural speech could not be generated. Read the reply or retry.", reason: "upstream_error" }, { status: upstream.status === 429 ? 429 : 502, headers: NO_STORE });
    }
    const reader = upstream.body.getReader();
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) { cleanup(); controller.close(); }
          else controller.enqueue(value);
        } catch { cleanup(); abort.abort(); controller.error(new Error("Speech stream interrupted.")); }
      },
      async cancel() { abort.abort(); cleanup(); await reader.cancel().catch(() => {}); },
    });
    return new Response(stream, { headers: { ...NO_STORE, "content-type": "audio/pcm", "x-audio-sample-rate": "24000", "x-content-type-options": "nosniff" } });
  } catch {
    cleanup();
    return Response.json({ error: request.signal.aborted ? "Speech cancelled." : "Neural speech could not connect. Read the reply or retry.", reason: request.signal.aborted ? "cancelled" : "upstream_error" }, { status: request.signal.aborted ? 499 : 502, headers: NO_STORE });
  }
}
