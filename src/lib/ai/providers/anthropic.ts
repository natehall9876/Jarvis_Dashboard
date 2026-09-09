import { integrationEnv, isIntegrationConfigured } from "@/lib/env";
import type {
  AICompletionResult,
  AIContentBlock,
  AIMessage,
  AIProvider,
  AIToolUseBlock,
  ToolDefinition,
} from "@/lib/ai/provider";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-sonnet-5";

type AnthropicResponseBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: string; [key: string]: unknown };

type AnthropicResponse = {
  content?: AnthropicResponseBlock[];
  stop_reason?: string;
};

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

  async complete(params: {
    system: string;
    messages: AIMessage[];
    tools: ToolDefinition[];
    maxTokens?: number;
  }): Promise<AICompletionResult> {
    if (!this.isConfigured()) {
      return {
        stopReason: "error",
        text: "",
        toolUses: [],
        rawContent: [],
        errorMessage: "Anthropic provider is not configured (AI_PROVIDER_API_KEY missing).",
      };
    }

    try {
      const response = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": integrationEnv.aiProvider.apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: process.env.AI_PROVIDER_MODEL || DEFAULT_MODEL,
          max_tokens: params.maxTokens ?? 1536,
          system: params.system,
          tools: params.tools.length > 0 ? params.tools : undefined,
          messages: params.messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        return {
          stopReason: "error",
          text: "",
          toolUses: [],
          rawContent: [],
          errorMessage: `AI provider returned an error (${response.status}): ${body.slice(0, 400)}`,
        };
      }

      const json = (await response.json()) as AnthropicResponse;
      const blocks = json.content ?? [];

      // Text and tool_use are reconstructed explicitly; any other block type
      // (e.g. extended-thinking) is passed through verbatim so it can still
      // be echoed back on the next request without being misread as tool_use.
      const rawContent: AIContentBlock[] = blocks.map((b) => {
        if (b.type === "text") return { type: "text", text: (b as { text: string }).text };
        if (b.type === "tool_use") {
          const tb = b as { id: string; name: string; input: unknown };
          return { type: "tool_use", id: tb.id, name: tb.name, input: tb.input };
        }
        return b;
      });
      const text = blocks
        .filter((b): b is { type: "text"; text: string } => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      const toolUses: AIToolUseBlock[] = blocks
        .filter((b): b is { type: "tool_use"; id: string; name: string; input: unknown } => b.type === "tool_use")
        .map((b) => ({ type: "tool_use", id: b.id, name: b.name, input: b.input }));

      const stopReason =
        json.stop_reason === "tool_use"
          ? "tool_use"
          : json.stop_reason === "max_tokens"
            ? "max_tokens"
            : "end_turn";

      return {
        stopReason,
        text,
        toolUses: toolUses.map(({ id, name, input }) => ({ id, name, input })),
        rawContent,
      };
    } catch (err) {
      return {
        stopReason: "error",
        text: "",
        toolUses: [],
        rawContent: [],
        errorMessage: err instanceof Error ? err.message : "Failed to reach the AI provider.",
      };
    }
  }
}
