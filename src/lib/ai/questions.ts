/**
 * Suggested advisor questions — split into its own module with no
 * server-only imports so client components can use it without pulling
 * next/headers (via lib/ai/advisor.ts's Supabase server client) into the
 * browser bundle.
 */
export const SUGGESTED_QUESTIONS = [
  "Give me my owner briefing",
  "What needs my attention?",
  "How does tomorrow look?",
  "Who owes me money?",
  "Which quotes need follow-up?",
  "Is any day this week overloaded?",
  "How is production this month?",
  "What equipment needs attention?",
  "Which jobs are most profitable?",
  "Which clients or services are least profitable?",
  "Are my prices high enough?",
  "How did we perform compared with last week?",
];

/**
 * Record-type-specific prompts, shown instead of the general list whenever
 * the advisor is opened from a detail page — mirrors the same path matching
 * `getPageContext` uses server-side, so what's suggested always matches what
 * the advisor is actually grounded in.
 */
const CONTEXTUAL_QUESTIONS: { match: RegExp; label: string; questions: string[] }[] = [
  {
    match: /^\/clients\/[^/?]+/,
    label: "this client",
    questions: [
      "Summarize this client",
      "Is this client worth the time they take?",
      "Should I follow up with them?",
      "What's their payment history like?",
    ],
  },
  {
    match: /^\/jobs\/[^/?]+/,
    label: "this job",
    questions: [
      "Was this job profitable?",
      "What should I charge for a job like this?",
      "How does this compare to similar jobs?",
      "Is this crew size right for this job?",
    ],
  },
  {
    match: /^\/invoices\/[^/?]+/,
    label: "this invoice",
    questions: [
      "Is this invoice overdue?",
      "Draft a payment reminder for this client",
      "What's this client's payment history?",
    ],
  },
  {
    match: /^\/quotes\/[^/?]+/,
    label: "this quote",
    questions: [
      "Is this quote priced right?",
      "Should I follow up on this quote?",
      "How does this compare to similar jobs we've done?",
    ],
  },
  {
    match: /^\/equipment\/[^/?]+/,
    label: "this equipment",
    questions: [
      "Is this equipment due for maintenance?",
      "What's this equipment costing us?",
      "Should we replace this soon?",
    ],
  },
  {
    match: /^\/reports/,
    label: "your reports",
    questions: [
      "What's driving our revenue this quarter?",
      "Which clients should I focus on growing?",
      "Where are we most and least efficient?",
    ],
  },
  {
    match: /^\/schedule/,
    label: "the schedule",
    questions: [
      "Is any day this week overloaded?",
      "Should I move anything off the busiest day?",
      "Which days have no crew assigned?",
    ],
  },
];

export function getContextualQuestions(pathname: string): string[] {
  const match = CONTEXTUAL_QUESTIONS.find((entry) => entry.match.test(pathname));
  return match ? match.questions : SUGGESTED_QUESTIONS;
}

/** A short "grounded in ___" label for the current page, or null on general pages (Command Center, list pages). */
export function getPageContextLabel(pathname: string): string | null {
  const match = CONTEXTUAL_QUESTIONS.find((entry) => entry.match.test(pathname));
  return match ? match.label : null;
}
