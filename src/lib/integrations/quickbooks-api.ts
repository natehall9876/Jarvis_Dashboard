import { getValidAccessToken } from "@/lib/integrations/quickbooks-connection";
import { QUICKBOOKS_API_BASE } from "@/lib/integrations/quickbooks-oauth";

type ApiResult<T> = { ok: true; data: T } | { ok: false; message: string; reason?: "not_connected" | "reauth_required" | "throttled" | "error" };

async function callApi<T>(path: string, searchParams?: Record<string, string>): Promise<ApiResult<T>> {
  const token = await getValidAccessToken();
  if (!token.ok) return { ok: false, message: token.message, reason: token.reason === "not_connected" || token.reason === "reauth_required" ? token.reason : "error" };

  const url = new URL(`${QUICKBOOKS_API_BASE}/${token.realmId}/${path}`);
  url.searchParams.set("minorversion", "70");
  for (const [k, v] of Object.entries(searchParams ?? {})) url.searchParams.set(k, v);

  let response: Response;
  try {
    response = await fetch(url.toString(), { headers: { accept: "application/json", authorization: `Bearer ${token.accessToken}` } });
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Failed to reach QuickBooks.", reason: "error" };
  }
  if (response.status === 429) return { ok: false, message: "QuickBooks is rate-limiting requests — try again shortly.", reason: "throttled" };
  if (!response.ok) {
    const text = await response.text();
    return { ok: false, message: `QuickBooks API returned ${response.status}: ${text.slice(0, 300)}`, reason: "error" };
  }
  return { ok: true, data: (await response.json()) as T };
}

export type QuickBooksCompanyInfo = { CompanyName: string; LegalName?: string; Country?: string };

/** Read-only. The cheapest possible real call — proves the token and realm actually work, without touching any financial data. */
export async function getCompanyInfo(): Promise<ApiResult<QuickBooksCompanyInfo>> {
  const token = await getValidAccessToken();
  if (!token.ok) return { ok: false, message: token.message, reason: token.reason === "not_connected" || token.reason === "reauth_required" ? token.reason : "error" };
  const result = await callApi<{ CompanyInfo: QuickBooksCompanyInfo }>(`companyinfo/${token.realmId}`);
  if (!result.ok) return result;
  return { ok: true, data: result.data.CompanyInfo };
}

export type QuickBooksCustomer = { Id: string; DisplayName: string; PrimaryEmailAddr?: { Address: string }; PrimaryPhone?: { FreeFormNumber: string }; Balance?: number };
export type QuickBooksInvoice = { Id: string; DocNumber?: string; TotalAmt: number; Balance: number; DueDate?: string; TxnDate: string; CustomerRef: { value: string; name?: string } };
export type QuickBooksPayment = { Id: string; TotalAmt: number; TxnDate: string; CustomerRef: { value: string; name?: string } };

/**
 * QuickBooks' query language (a SQL-like subset) is the standard way to read
 * lists. `startPosition`/`maxResults` are QBO's own pagination — QBO caps
 * maxResults at 1000 and starts positions at 1, not 0.
 */
async function query<T>(entity: "Customer" | "Invoice" | "Payment", startPosition: number, maxResults: number): Promise<ApiResult<T[]>> {
  const q = `select * from ${entity} startposition ${startPosition} maxresults ${maxResults}`;
  const result = await callApi<{ QueryResponse: Record<string, T[] | number | undefined> }>("query", { query: q });
  if (!result.ok) return result;
  const rows = (result.data.QueryResponse[entity] as T[] | undefined) ?? [];
  return { ok: true, data: rows };
}

const PAGE_SIZE = 200;
const MAX_PAGES = 20;

/** Read-only, paginated. Never called from anywhere that could write — this module has no update/create/delete function at all. */
export async function getAllCustomers(): Promise<ApiResult<{ customers: QuickBooksCustomer[]; pages: number }>> {
  const all: QuickBooksCustomer[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await query<QuickBooksCustomer>("Customer", page * PAGE_SIZE + 1, PAGE_SIZE);
    if (!result.ok) return result;
    all.push(...result.data);
    if (result.data.length < PAGE_SIZE) return { ok: true, data: { customers: all, pages: page + 1 } };
  }
  return { ok: false, message: `Stopped after ${MAX_PAGES} pages without reaching the end.`, reason: "error" };
}

export async function getAllInvoices(): Promise<ApiResult<{ invoices: QuickBooksInvoice[]; pages: number }>> {
  const all: QuickBooksInvoice[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await query<QuickBooksInvoice>("Invoice", page * PAGE_SIZE + 1, PAGE_SIZE);
    if (!result.ok) return result;
    all.push(...result.data);
    if (result.data.length < PAGE_SIZE) return { ok: true, data: { invoices: all, pages: page + 1 } };
  }
  return { ok: false, message: `Stopped after ${MAX_PAGES} pages without reaching the end.`, reason: "error" };
}

export async function getAllPayments(): Promise<ApiResult<{ payments: QuickBooksPayment[]; pages: number }>> {
  const all: QuickBooksPayment[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await query<QuickBooksPayment>("Payment", page * PAGE_SIZE + 1, PAGE_SIZE);
    if (!result.ok) return result;
    all.push(...result.data);
    if (result.data.length < PAGE_SIZE) return { ok: true, data: { payments: all, pages: page + 1 } };
  }
  return { ok: false, message: `Stopped after ${MAX_PAGES} pages without reaching the end.`, reason: "error" };
}
