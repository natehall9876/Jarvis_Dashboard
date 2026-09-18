import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

/**
 * Renders the model's raw markdown text (bold, lists, headings, GFM
 * tables) as actual formatted HTML instead of the literal asterisks/pipes/
 * hashes showing up as plain text, which is what a bare
 * `whitespace-pre-wrap` paragraph did before this. Every element gets an
 * explicit className tied to the app's existing design tokens rather than
 * relying on a Tailwind typography plugin — precise control, no new
 * Tailwind config surface to get wrong.
 */
const components: Components = {
  p: ({ children }) => <p className="mb-2 text-sm leading-relaxed text-[var(--color-text-secondary)] last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-[var(--color-text-primary)]">{children}</strong>,
  em: ({ children }) => <em className="text-[var(--color-text-secondary)]">{children}</em>,
  ul: ({ children }) => <ul className="mb-2 ml-4 list-disc space-y-1 text-sm text-[var(--color-text-secondary)] last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 ml-4 list-decimal space-y-1 text-sm text-[var(--color-text-secondary)] last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="pl-1">{children}</li>,
  h1: ({ children }) => <h1 className="mb-1.5 mt-3 text-sm font-semibold text-[var(--color-text-primary)] first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-1.5 mt-3 text-sm font-semibold text-[var(--color-text-primary)] first:mt-0">{children}</h2>,
  h3: ({ children }) => (
    <h3 className="mb-1 mt-2.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)] first:mt-0">{children}</h3>
  ),
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-[var(--color-accent)] underline underline-offset-2 hover:opacity-80">
      {children}
    </a>
  ),
  code: ({ children }) => <code className="rounded bg-[var(--color-surface-3)] px-1 py-0.5 font-mono text-xs text-[var(--color-text-primary)]">{children}</code>,
  hr: () => <hr className="my-3 border-[var(--color-border)]" />,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-[var(--color-accent)]/40 pl-3 text-sm text-[var(--color-text-secondary)]">{children}</blockquote>
  ),
  table: ({ children }) => (
    <div className="mb-2 overflow-x-auto rounded-md border border-[var(--color-border)] last:mb-0">
      <table className="w-full text-left text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-[var(--color-surface-2)] text-[var(--color-text-muted)]">{children}</thead>,
  th: ({ children }) => <th className="border-b border-[var(--color-border)] px-2.5 py-1.5 font-medium">{children}</th>,
  td: ({ children }) => <td className="border-b border-[var(--color-border)] px-2.5 py-1.5 text-[var(--color-text-secondary)] last:border-b-0">{children}</td>,
  tr: ({ children }) => <tr className="last:[&>td]:border-b-0">{children}</tr>,
};

export function MarkdownMessage({ text }: { text: string }) {
  return (
    <div className="min-w-0">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
