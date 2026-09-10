import { NextResponse } from "next/server";
import { askAdvisor, type AdvisorTurn } from "@/lib/ai/advisor";
import { getPageContext } from "@/lib/ai/page-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function isValidHistory(value: unknown): value is AdvisorTurn[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (turn) =>
      typeof turn === "object" &&
      turn !== null &&
      typeof (turn as Record<string, unknown>).question === "string" &&
      typeof (turn as Record<string, unknown>).answer === "string",
  );
}

export async function POST(request: Request) {
  // RLS already prevents an unauthenticated caller from seeing any real
  // business data through Jarvis's tools (verified live: an anon request
  // gets back empty results, and Jarvis honestly reports that rather than
  // fabricating anything) — but without this check, an unauthenticated
  // caller could still trigger a real, paid Anthropic API call for every
  // request, for zero legitimate value. proxy.ts deliberately doesn't gate
  // /api/* routes (each one owns its own auth decision), so this route has
  // to make that decision itself rather than relying on the middleware.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in to use Jarvis." }, { status: 401 });
  }

  let question: unknown;
  let path: unknown;
  let history: unknown;
  try {
    const body = await request.json();
    question = body?.question;
    path = body?.path;
    history = body?.history;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof question !== "string" || question.trim().length === 0) {
    return NextResponse.json({ error: "A non-empty 'question' string is required." }, { status: 400 });
  }
  if (question.length > 2000) {
    return NextResponse.json({ error: "Question is too long (max 2000 characters)." }, { status: 400 });
  }

  const pageContext = typeof path === "string" ? await getPageContext(path) : null;
  const conversationHistory = isValidHistory(history) ? history : [];
  const result = await askAdvisor(question.trim(), pageContext, conversationHistory);

  if (!result.ok) {
    const status = result.reason === "not_configured" ? 503 : 502;
    return NextResponse.json({ error: result.message, reason: result.reason }, { status });
  }

  return NextResponse.json({
    answer: result.answer,
    references: result.references,
    toolsUsed: result.toolsUsed,
    proposedAction: result.proposedAction,
  });
}
