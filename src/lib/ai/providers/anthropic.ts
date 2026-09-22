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
    } catch (err) {
      yield {
        stopReason: "error",
        text: "",
        toolUses: [],
        rawContent: [],
        errorMessage: err instanceof Error ? err.message : "Failed to reach the AI provider.",
      };
      return;
    }

    if (!response.ok || !response.body) {
      const body = response.body ? await response.text() : "No response body.";
      yield {
        stopReason: "error",
        text: "",
        toolUses: [],
        rawContent: [],
        errorMessage: `AI provider returned an error (${response.status}): ${body.slice(0, 400)}`,
      };
      return;
    }

    const blocks = new Map<number, StreamBlockState>();
    let stopReason: AICompletionResult["stopReason"] = "end_turn";
    let streamError: string | null = null;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

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
          } else if (payload.type === "message_delta") {
            const delta = payload.delta as Record<string, unknown>;
            if (delta.stop_reason === "tool_use") stopReason = "tool_use";
            else if (delta.stop_reason === "max_tokens") stopReason = "max_tokens";
          } else if (payload.type === "error") {
            const error = payload.error as Record<string, unknown> | undefined;
            streamError = typeof error?.message === "string" ? error.message : "The AI provider returned a stream error.";
          }
        }
      }
    } catch (err) {
      yield {
        stopReason: "error",
        text: "",
        toolUses: [],
        rawContent: [],
        errorMessage: err instanceof Error ? err.message : "Lost connection to the AI provider mid-response.",
      };
      return;
    }

    if (streamError) {
      yield { stopReason: "error", text: "", toolUses: [], rawContent: [], errorMessage: streamError };
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
          input = {};
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
