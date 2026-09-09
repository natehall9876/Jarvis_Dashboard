import { Search } from "lucide-react";

/** Plain GET form search — works without client JS, reads back via searchParams. */
export function SearchForm({
  placeholder = "Search...",
  defaultValue,
  paramName = "q",
}: {
  placeholder?: string;
  defaultValue?: string;
  paramName?: string;
}) {
  return (
    <form className="relative w-full max-w-xs">
      <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
      <input
        type="text"
        name={paramName}
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] py-1.5 pl-9 pr-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none"
      />
    </form>
  );
}
