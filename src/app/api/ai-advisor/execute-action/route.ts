import { NextResponse } from "next/server";
import { isProposedAction } from "@/lib/ai/action-types";
import { executeProposedAction } from "@/lib/ai/actions/execute";

/**
 * The ONLY endpoint that can turn a Jarvis-proposed change into a real
 * write. The model never calls this — it's hit exclusively by the owner
 * clicking Confirm in the UI, with the exact ProposedAction object Jarvis
 * returned. Every field is re-validated here (see lib/ai/actions/execute.ts)
 * before anything touches the database; nothing about the client's request
 * is trusted beyond "which allowlisted action, on which record, with which
 * proposed values" — the same shape the owner saw on screen.
 */
export async function POST(request: Request) {
  let action: unknown;
  try {
    const body = await request.json();
    action = body?.action;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!isProposedAction(action)) {
    return NextResponse.json({ error: "Invalid or unrecognized action payload." }, { status: 400 });
  }

  const result = await executeProposedAction(action);

  if (!result.ok) {
    const status =
      result.reason === "auth"
        ? 401
        : result.reason === "already_processed" || result.reason === "stale"
          ? 409
          : result.reason === "not_found"
            ? 404
            : result.reason === "invalid"
              ? 400
              : 500;
    return NextResponse.json({ error: result.message, reason: result.reason }, { status });
  }

  return NextResponse.json({ message: result.message, result: result.result, references: result.references });
}
