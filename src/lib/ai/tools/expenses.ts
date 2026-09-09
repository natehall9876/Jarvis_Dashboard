import { getExpenses } from "@/lib/data/expenses";
import { unwrap, type ToolSpec } from "@/lib/ai/tool-types";

export const expenseTools: ToolSpec[] = [
  {
    name: "get_expenses",
    description:
      "List business expenses (fuel, equipment repair, materials, insurance, etc.), optionally restricted to a date range. Each includes vendor, category, amount, and — when relevant — the job or equipment it's tied to.",
    input_schema: {
      type: "object",
      properties: {
        from: { type: "string", description: "Optional start date, ISO YYYY-MM-DD, inclusive." },
        to: { type: "string", description: "Optional end date, ISO YYYY-MM-DD, inclusive." },
      },
    },
    execute: async (input) => {
      const result = await getExpenses();
      return unwrap(result, (expenses) => {
        const from = typeof input.from === "string" ? input.from : null;
        const to = typeof input.to === "string" ? input.to : null;
        const filtered = expenses.filter((e) => {
          if (!e.expense_date) return true;
          if (from && e.expense_date < from) return false;
          if (to && e.expense_date > to) return false;
          return true;
        });
        return {
          data: {
            count: filtered.length,
            total: filtered.reduce((sum, e) => sum + e.amount, 0),
            expenses: filtered.map((e) => ({
              date: e.expense_date,
              vendor: e.vendor,
              category: e.category,
              amount: e.amount,
              description: e.description,
              job_id: e.job?.id ?? null,
              equipment: e.equipment?.name ?? null,
            })),
          },
        };
      });
    },
  },
];
