import { NextResponse } from "next/server";
import { askAdvisor } from "@/lib/ai/advisor";

export async function POST(request: Request) {
  let question: unknown;
  try {
    const body = await request.json();
    question = body?.question;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof question !== "string" || question.trim().length === 0) {
    return NextResponse.json({ error: "A non-empty 'question' string is required." }, { status: 400 });
  }
  if (question.length > 2000) {
    return NextResponse.json({ error: "Question is too long (max 2000 characters)." }, { status: 400 });
  }

  const result = await askAdvisor(question.trim());

  if (!result.ok) {
    const status = result.reason === "not_configured" ? 503 : 502;
    return NextResponse.json({ error: result.message, reason: result.reason }, { status });
  }

  return NextResponse.json({ answer: result.answer });
}
