/**
 * Provider-agnostic types for the Jarvis AI layer. A concrete provider (see
 * `providers/anthropic.ts`) implements `AIProvider` against one vendor's
 * API; everything above this file (the agent loop in `advisor.ts`, the tool
 * registry) talks only to this interface, so adding a second provider later
 * means writing one new file, not touching the reasoning loop.
 *
 * Deliberately modeled after Anthropic's Messages API tool-use shape (content
 * blocks, tool_use/tool_result) since that's the richest common shape and the
 * first provider we support — an OpenAI-style adapter would translate into
 * and out of this shape rather than the reasoning loop learning two dialects.
 */

export type AIRole = "user" | "assistant";

export type AITextBlock = { type: "text"; text: string };
export type AIToolUseBlock = { type: "tool_use"; id: string; name: string; input: unknown };
export type AIToolResultBlock = {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
};

/**
 * Anthropic can return block types beyond text/tool_use (e.g. extended-
 * thinking blocks), which must still be echoed back verbatim on the next
 * request even though the advisor loop never reads their contents.
 */
export type AIOpaqueBlock = { type: string; [key: string]: unknown };

export type AIContentBlock = AITextBlock | AIToolUseBlock | AIToolResultBlock | AIOpaqueBlock;

export type AIMessage = {
  role: AIRole;
  content: string | AIContentBlock[];
};

/** JSON Schema subset sufficient for tool parameter definitions. */
export type ToolInputSchema = {
  type: "object";
  properties: Record<string, { type: string; description?: string; enum?: string[] }>;
  required?: string[];
};

export type ToolDefinition = {
  name: string;
  description: string;
  input_schema: ToolInputSchema;
};

export type AIStopReason = "end_turn" | "tool_use" | "max_tokens" | "error";

export type AICompletionResult = {
  stopReason: AIStopReason;
  /** Plain text the model produced this turn (may be empty on a pure tool_use turn). */
  text: string;
  /** Tool calls the model wants executed before it can continue. */
  toolUses: { id: string; name: string; input: unknown }[];
  /** The full content block list, needed verbatim to echo back as the assistant turn on the next request. */
  rawContent: AIContentBlock[];
  /** Present when stopReason is "error". */
  errorMessage?: string;
};

export interface AIProvider {
  readonly name: string;
  isConfigured(): boolean;
  complete(params: {
    system: string;
    messages: AIMessage[];
    tools: ToolDefinition[];
    maxTokens?: number;
  }): Promise<AICompletionResult>;
}
