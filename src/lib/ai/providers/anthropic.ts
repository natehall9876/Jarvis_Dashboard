import { integrationEnv, isIntegrationConfigured } from "@/lib/env.server";
import type {
  AICompletionResult,
  AIContentBlock,
  AIMessage,
  AIProvider,
  AIStreamDelta,
  AIToolUseBlock,
  ToolDefinition,
} from "@/lib/ai/provider";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-sonnet-5";

function failure(errorMessage: string): AICompletionResult {
  return { stopReason: "error", text: "", toolUses: [], rawContent: [], errorMessage };
}

function providerError(status?: number, type?: unknown): string {
  if (status === 401 || type === "authentication_error") {
    return "Jarvis's AI key is invalid or expired. Replace the AI key to restore Ask Jarvis. You can use notes and scheduling directly.";
  }
  if (status === 403 || type === "permission_error") {
    return "Jarvis's AI key does not have permission for this request. Check its access settings.";
  }
  if (status === 429 || type === "rate_limit_error") {
    return "Jarvis's AI request limit was reached. Wait a moment, then retry.";
  }
  return "The AI service could not complete this response. Please retry.";
}

/**
 * In-flight accumulation for one streamed content block — text is built up
 * from `text_delta` chunks directly; tool_use input arrives as fragments of
 * a JSON string (`input_json_delta`) that only parses once complete, so it's
 * buffered as a string and parsed at `content_block_stop`. Extended-thinking
 * blocks (this model can return these even without `thinking` explicitly
 * requested) need the same treatment as text — `thinking_delta` chunks build
 * the thinking text, and a trailing `signature_delta` carries a verification
 * signature that must round-trip byte-for-byte when the block is echoed back
 * as part of the next request, or Anthropic rejects the whole turn with
 * "each thinking block must contain thinking".
 */
type StreamBlockState =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; jsonBuffer: string }
  | { type: "thinking"; thinking: string; signature: string }
  | { type: "opaque"; block: Record<string, unknown> };

/**
 * Talks to Anthropic's Messages API directly over fetch (no SDK dependency —
 * this is a small, stable JSON contract and staying on raw fetch keeps every
 * provider adapter symmetric: each one is "shape our types into this
 * vendor's JSON and back," not "learn this vendor's client library").
 *
 * API key is read from process.env only, used only in this server module,
 * and never touches a response body or client bundle.
 */
export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";

  isConfigured(): boolean {
    return isIntegrationConfigured("aiProvider");
  }

  async *stream(params: {
    system: string;
    messages: AIMessage[];
    tools: ToolDefinition[];
    maxTokens?: number;
    toolChoice?: "auto" | "none";
    signal?: AbortSignal;
  }): AsyncGenerator<AIStreamDelta | AICompletionResult> {
    if (!this.isConfigured()) {
      yield {
        stopReason: "error",
        text: "",
        toolUses: [],
        rawContent: [],
        errorMessage: "Anthropic provider is not configured (AI_PROVIDER_API_KEY missing).",
      };
      return;
    }

    let response: Response;
    try {
      response = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        cache: "no-store",
        signal: params.signal ? AbortSignal.any([params.signal, AbortSignal.timeout(45_000)]) : AbortSignal.timeout(45_000),
        headers: {
          "content-type": "application/json",
          "x-api-key": integrationEnv.aiProvider.apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: process.env.AI_PROVIDER_MODEL || DEFAULT_MODEL,
          max_tokens: params.maxTokens ?? 1536,
          stream: true,
          // A single ephemeral breakpoint on the (large, per-request-static)
          // system prompt caches it — and everything before it, i.e. the
          // tools array too — across this request's own tool-call
          // iterations and across the owner's next question shortly after,
          // instead of Anthropic reprocessing ~40 tool schemas plus the full
          // instruction block from scratch on every single turn.
          system: [{ type: "text", text: params.system, cache_control: { type: "ephemeral" } }],
          tools: params.tools.length > 0 ? params.tools : undefined,
          tool_choice: params.toolChoice === "none" ? { type: "none" } : undefined,
          messages: params.messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
    } catch {
      yield failure("Jarvis could not reach its AI service in time. Please retry.");
      return;
    }

    if (!response.ok || !response.body) {
      // Never echo third-party response bodies, which can contain request details.
      await response.body?.cancel().catch(() => undefined);
      yield failure(providerError(response.status));
      return;
    }

    const blocks = new Map<number, StreamBlockState>();
    let stopReason: AICompletionResult["stopReason"] = "end_turn";
    let streamError: string | null = null;
    let messageComplete = false;
    let receivedStopReason = false;
    const openBlocks = new Set<number>();

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (!messageComplete && !streamError) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, "\n");

        // SSE frames are separated by a blank line; each frame may carry
        // multiple `field: value` lines but this API only ever sends one
        // `event:` and one `data:` per frame.
        let boundary: number;
        while ((boundary = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const dataLine = frame.split("\n").find((line) => line.startsWith("data:"));
          if (!dataLine) continue;
          const payload = JSON.parse(dataLine.slice(5).trim()) as Record<string, unknown>;

          if (payload.type === "content_block_start") {
            const index = payload.index as number;
            openBlocks.add(index);
            const block = payload.content_block as Record<string, unknown>;
            if (block.type === "text") {
              blocks.set(index, { type: "text", text: "" });
            } else if (block.type === "tool_use") {
              blocks.set(index, { type: "tool_use", id: block.id as string, name: block.name as string, jsonBuffer: "" });
            } else if (block.type === "thinking") {
              blocks.set(index, { type: "thinking", thinking: "", signature: "" });
            } else {
              blocks.set(index, { type: "opaque", block });
            }
          } else if (payload.type === "content_block_delta") {
            const index = payload.index as number;
            const delta = payload.delta as Record<string, unknown>;
            const state = blocks.get(index);
            if (!state) continue;
            if (delta.type === "text_delta" && state.type === "text") {
              const chunk = delta.text as string;
              state.text += chunk;
              yield { type: "text_delta", text: chunk };
            } else if (delta.type === "input_json_delta" && state.type === "tool_use") {
              state.jsonBuffer += delta.partial_json as string;
            } else if (delta.type === "thinking_delta" && state.type === "thinking") {
              state.thinking += delta.thinking as string;
            } else if (delta.type === "signature_delta" && state.type === "thinking") {
              state.signature += delta.signature as string;
            }
          } else if (payload.type === "content_block_stop") {
            openBlocks.delete(payload.index as number);
          } else if (payload.type === "message_delta") {
            const delta = payload.delta as Record<string, unknown>;
            if (typeof delta.stop_reason === "string") receivedStopReason = true;
            if (delta.stop_reason === "tool_use") stopReason = "tool_use";
            else if (delta.stop_reason === "max_tokens") stopReason = "max_tokens";
          } else if (payload.type === "message_stop") {
            messageComplete = true;
            break;
          } else if (payload.type === "error") {
            const error = payload.error as Record<string, unknown> | undefined;
            streamError = providerError(undefined, error?.type);
            break;
          }
        }
      }
    } catch {
      yield failure("Jarvis lost the AI response before it finished. Please retry.");
      return;
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }

    if (streamError) {
      yield failure(streamError);
      return;
    }
    if (!messageComplete || !receivedStopReason || openBlocks.size > 0) {
      yield failure("The AI response was interrupted. No command from this incomplete response was run. Please retry.");
      return;
    }

    const ordered = Array.from(blocks.entries()).sort(([a], [b]) => a - b);
    const rawContent: AIContentBlock[] = [];
    const toolUses: AIToolUseBlock[] = [];
    let text = "";

    for (const [, state] of ordered) {
      if (state.type === "text") {
        rawContent.push({ type: "text", text: state.text });
        text += state.text;
      } else if (state.type === "tool_use") {
        let input: unknown = {};
        try {
          input = state.jsonBuffer.trim() ? JSON.parse(state.jsonBuffer) : {};
        } catch {
          yield failure("The AI returned an incomplete command. Nothing from this response was run. Please retry.");
          return;
        }
        if (!input || typeof input !== "object" || Array.isArray(input)) {
          yield failure("The AI returned an invalid command. Nothing from this response was run. Please retry.");
          return;
        }
        rawContent.push({ type: "tool_use", id: state.id, name: state.name, input });
        toolUses.push({ type: "tool_use", id: state.id, name: state.name, input });
      } else if (state.type === "thinking") {
        rawContent.push({ type: "thinking", thinking: state.thinking, signature: state.signature });
      } else {
        rawContent.push(state.block as AIContentBlock);
      }
    }

    yield { stopReason, text: text.trim(), toolUses, rawContent };
  }
}
