export type Row = { id: number; [key: string]: unknown };
export type Stream = { key: string; entity: string; filterType: string; fields: string; where: Record<string, unknown>; incremental: boolean };
export type Cursor = { after: number; since: string | null; startedAt: string; full: boolean };
const PAGE_SIZE = 100;
export async function fetchSourcePage(stream: Stream, cursor: Cursor, token: string, request: typeof fetch = fetch): Promise<Row[]> {
  const where = { ...stream.where, id: { gt: cursor.after }, ...(stream.incremental && cursor.since ? { updatedAt: { gte: cursor.since } } : {}) };
  for (let attempt = 0; attempt < 3; attempt++) {
    let response: Response;
    try {
      response = await request("https://api.home.works/graphql", {
        method: "POST", cache: "no-store", signal: AbortSignal.timeout(20_000),
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ query: `query AutomaticSync($where: ${stream.filterType}!, $take: SafeInt!) { ${stream.entity}(where: $where, orderBy: [{id: asc}], take: $take) { ${stream.fields} } }`, variables: { where, take: PAGE_SIZE } }),
      });
    } catch {
      if (attempt === 2) throw new Error(`Homeworks ${stream.key}: network timeout; checkpoint preserved`);
      await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt)); continue;
    }
    if ((response.status === 429 || response.status >= 500) && attempt < 2) {
      const delay = Math.min(5000, Math.max(500 * 2 ** attempt, Number(response.headers.get("retry-after") ?? 0) * 1000));
      await new Promise(resolve => setTimeout(resolve, delay)); continue;
    }
    if (!response.ok) throw new Error(`Homeworks ${stream.key}: HTTP ${response.status}${response.status === 401 ? "; authorization must be checked" : ""}`);
    const json = await response.json();
    if (json.errors?.length) throw new Error(`Homeworks ${stream.key}: GraphQL rejected the query; no partial data applied`);
    const rows: Row[] = json.data?.[stream.entity];
    if (!Array.isArray(rows)) throw new Error(`Homeworks ${stream.key}: invalid response`);
    let previous = cursor.after;
    for (const row of rows) {
      if (!row || !Number.isSafeInteger(row.id) || row.id <= previous) throw new Error(`Homeworks ${stream.key}: duplicate or out-of-order IDs`);
      previous = row.id;
      for (const field of ["lineItems", "users"]) if (Array.isArray(row[field]) && row[field].length >= 1000) throw new Error(`Homeworks ${stream.key}: nested ${field} reached API page limit`);
    }
    return rows;
  }
  throw new Error("Homeworks retry budget exhausted");
}
export async function processStream(options: { stream: Stream; cursor: Cursor; token: string; request?: typeof fetch; apply: (rows: Row[], after: number) => Promise<void>; complete: () => Promise<void>; shouldContinue: () => boolean }): Promise<boolean> {
  const cursor = { ...options.cursor };
  while (options.shouldContinue()) {
    const rows = await fetchSourcePage(options.stream, cursor, options.token, options.request);
    if (rows.length) { const after = rows[rows.length - 1].id; await options.apply(rows, after); cursor.after = after; }
    if (rows.length < PAGE_SIZE) { await options.complete(); return true; }
  }
  return false;
}
