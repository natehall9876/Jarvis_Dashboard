/**
 * Offset pagination with the guards a real sync needs. Homeworks' GraphQL has
 * no cursor or page metadata (events(take, skip) just returns an array), so
 * "the last page" can only be inferred: a page shorter than the requested size.
 * Never assume the first page is everything.
 */
export type PageFetch<T> = (skip: number, take: number) => Promise<{ ok: true; items: T[] } | { ok: false; message: string; retryable?: boolean }>;

export type PagedResult<T> =
  | { ok: true; items: T[]; pages: number; rawCount: number; duplicates: number; pageSize: number }
  | { ok: false; message: string; partial: { items: T[]; pages: number; rawCount: number; duplicates: number } };

export async function fetchAllPages<T extends { id: string }>(
  fetchPage: PageFetch<T>,
  options: { pageSize?: number; maxPages?: number; maxRetries?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<PagedResult<T>> {
  const pageSize = options.pageSize ?? 200;
  const maxPages = options.maxPages ?? 50;
  const maxRetries = options.maxRetries ?? 3;
  const sleep = options.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));

  const byId = new Map<string, T>();
  let pages = 0;
  let rawCount = 0;
  let duplicates = 0;
  let previousFirstId: string | null = null;

  const partial = () => ({ items: [...byId.values()], pages, rawCount, duplicates });

  for (let page = 0; page < maxPages; page++) {
    let result = await fetchPage(page * pageSize, pageSize);
    for (let attempt = 1; !result.ok && result.retryable && attempt <= maxRetries; attempt++) {
      await sleep(500 * 2 ** (attempt - 1));
      result = await fetchPage(page * pageSize, pageSize);
    }
    if (!result.ok) return { ok: false, message: `Page ${page + 1} failed: ${result.message}`, partial: partial() };

    pages++;
    rawCount += result.items.length;

    // A repeated page means the server ignored `skip` — stop instead of looping forever.
    const firstId = result.items[0]?.id ?? null;
    if (firstId !== null && firstId === previousFirstId) {
      return { ok: false, message: `Page ${page + 1} repeated the previous page — pagination is not advancing.`, partial: partial() };
    }
    previousFirstId = firstId;

    let added = 0;
    for (const item of result.items) {
      if (byId.has(item.id)) duplicates++;
      else {
        byId.set(item.id, item);
        added++;
      }
    }
    if (result.items.length < pageSize) return { ok: true, items: [...byId.values()], pages, rawCount, duplicates, pageSize };
    if (added === 0) {
      return { ok: false, message: `Page ${page + 1} returned only records already seen — pagination is not advancing.`, partial: partial() };
    }
  }
  return { ok: false, message: `Stopped after ${maxPages} pages without reaching the end — refusing to treat a partial list as complete.`, partial: partial() };
}
