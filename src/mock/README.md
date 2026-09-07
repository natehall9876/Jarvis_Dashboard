# Mock / dev data

Everything in this directory is **fake data for local UI development only**.
Nothing here is imported by any page, layout, or data-access function — the
app always renders real Supabase data (or a "not configured" / empty state
when there isn't any).

If you want to preview a fully populated dashboard before connecting real
data, import from these files inside a scratch component or Storybook-style
sandbox — never inside `src/lib/data/*` or any `page.tsx`.
