/**
 * Suggested advisor questions — split into its own module with no
 * server-only imports so client components can use it without pulling
 * next/headers (via lib/ai/advisor.ts's Supabase server client) into the
 * browser bundle.
 */
export const SUGGESTED_QUESTIONS = [
  "What should I focus on today?",
  "Which jobs are most profitable?",
  "Which clients owe me money?",
  "Which quotes should I follow up on?",
  "Where am I losing production time?",
  "Which route is underperforming?",
  "Are my prices high enough?",
  "Which clients or services are least profitable?",
  "What equipment maintenance is coming due?",
  "Should I move jobs because of weather?",
  "How did we perform compared with last week?",
  "How did we handle this time of year last year?",
];
