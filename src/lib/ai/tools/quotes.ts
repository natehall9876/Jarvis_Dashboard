import { getQuotes, getQuoteById } from "@/lib/data/quotes";
import { clientDisplayName } from "@/lib/format";
import { unwrap, type ToolSpec } from "@/lib/ai/tool-types";
import type { QuoteStatus } from "@/types/domain";

const QUOTE_STATUSES: QuoteStatus[] = ["draft", "sent", "accepted", "declined"];

export const quoteTools: ToolSpec[] = [
  {
    name: "get_quotes",
    description:
      "List quotes, optionally filtered by status (draft/sent/accepted/declined). Each result includes the client, total, and how long ago it was sent — use for open-quote follow-up and quote-aging questions.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: QUOTE_STATUSES, description: "Optional status filter." },
      },
    },
    execute: async (input) => {
      const result = await getQuotes();
      return unwrap(result, (quotes) => {
        const status = typeof input.status === "string" ? input.status : undefined;
        const filtered = status ? quotes.filter((q) => q.status === status) : quotes;
        return {
          data: filtered.map((q) => ({
            id: q.id,
            quote_number: q.quote_number,
            client: clientDisplayName(q.client),
            status: q.status,
            total: q.total,
            created_at: q.created_at,
            sent_at: q.sent_at,
            accepted_at: q.accepted_at,
            declined_at: q.declined_at,
            valid_until: q.valid_until,
            line_item_count: q.items.length,
          })),
          references: filtered.map((q) => ({ type: "quote" as const, id: q.id, label: q.quote_number ?? "Quote" })),
        };
      });
    },
  },
  {
    name: "get_quote_details",
    description: "Full detail for one quote: every line item (including optional add-ons), total, and its status history.",
    input_schema: {
      type: "object",
      properties: { quote_id: { type: "string", description: "The quote's UUID." } },
      required: ["quote_id"],
    },
    execute: async (input) => {
      const result = await getQuoteById(String(input.quote_id));
      return unwrap(result, (quote) => ({
        data: {
          id: quote.id,
          quote_number: quote.quote_number,
          client: clientDisplayName(quote.client),
          status: quote.status,
          total: quote.total,
          created_at: quote.created_at,
          sent_at: quote.sent_at,
          accepted_at: quote.accepted_at,
          declined_at: quote.declined_at,
          valid_until: quote.valid_until,
          notes: quote.notes,
          items: quote.items.map((it) => ({
            description: it.description,
            quantity: it.quantity,
            unit_price: it.unit_price,
            total: it.total,
            is_optional: it.is_optional,
            budgeted_hours: it.budgeted_hours,
          })),
        },
        references: quote.client
          ? [
              { type: "quote" as const, id: quote.id, label: quote.quote_number ?? "Quote" },
              { type: "client" as const, id: quote.client.id, label: clientDisplayName(quote.client) },
            ]
          : [{ type: "quote" as const, id: quote.id, label: quote.quote_number ?? "Quote" }],
      }));
    },
  },
];
