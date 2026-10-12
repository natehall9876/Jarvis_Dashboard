/** Track only entries visited inside this Jarvis document, never browser-global
 * history.length (which includes other websites). Preserve Next's own state. */
const KEY = "__jarvisNavigationV1";
type Entry = { href: string; depth: number };
function entry(state: unknown, url: URL): Entry | null {
  const value = state && typeof state === "object" ? (state as Record<string, unknown>)[KEY] : null;
  if (!value || typeof value !== "object") return null;
  const candidate = value as Entry;
  return candidate.href === url.href && Number.isSafeInteger(candidate.depth) && candidate.depth >= 0 ? candidate : null;
}
export function canGoBackInJarvis(state: unknown, url: URL): boolean {
  return (entry(state, url)?.depth ?? 0) > 0;
}
export function trackNavigationHistory(history: History, currentUrl: () => URL, notify: () => void): () => void {
  const push = history.pushState, replace = history.replaceState;
  const withEntry = (data: unknown, url: URL, depth: number) => ({
    ...(data && typeof data === "object" ? data : {}),
    [KEY]: { href: url.href, depth },
  });
  const initial = currentUrl();
  replace.call(history, withEntry(history.state, initial, entry(history.state, initial)?.depth ?? 0), "", initial.href);
  const pushed: History["pushState"] = function(data, unused, url) {
    const current = currentUrl(), next = new URL(url ?? current.href, current);
    const depth = next.origin === current.origin ? (entry(history.state, current)?.depth ?? 0) + 1 : 0;
    push.call(history, withEntry(data, next, depth), unused, url);
    notify();
  };
  const replaced: History["replaceState"] = function(data, unused, url) {
    const current = currentUrl(), next = new URL(url ?? current.href, current);
    const depth = next.origin === current.origin ? entry(history.state, current)?.depth ?? 0 : 0;
    replace.call(history, withEntry(data, next, depth), unused, url);
    notify();
  };
  history.pushState = pushed;
  history.replaceState = replaced;
  notify();
  return () => {
    if (history.pushState === pushed) history.pushState = push;
    if (history.replaceState === replaced) history.replaceState = replace;
  };
}
const SECTIONS = new Set(["jobs", "clients", "properties", "invoices", "quotes", "routes", "equipment", "employees", "settings"]);
export function navigationFallback(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  return !pathname.startsWith("//") && parts.length > 1 && SECTIONS.has(parts[0]) ? "/" + parts[0] : "/";
}
