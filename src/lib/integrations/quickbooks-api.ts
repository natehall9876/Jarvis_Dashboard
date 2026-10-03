import { isISODate } from "@/lib/integrations/homeworks-dates";
import { fetchApiJson, invalidApiResponse, isRecord, type ApiFailure } from "@/lib/integrations/api-response";
import { getValidAccessToken } from "@/lib/integrations/quickbooks-connection";
import { QUICKBOOKS_API_BASE } from "@/lib/integrations/quickbooks-oauth";

type ApiResult<T> = { ok: true; data: T } | { ok: false; message: string; reason?: "not_connected" | ApiFailure["reason"] };

async function callApi<T>(path: string | ((realmId: string) => string), searchParams?: Record<string, string>): Promise<ApiResult<T>> {
  const token = await getValidAccessToken();
  if (!token.ok) return { ok: false, message: token.message, reason: token.reason === "not_connected" || token.reason === "reauth_required" ? token.reason : "error" };

  const url = new URL(`${QUICKBOOKS_API_BASE}/${token.realmId}/${typeof path === "function" ? path(token.realmId) : path}`);
  url.searchParams.set("minorversion", "70");
  for (const [k, v] of Object.entries(searchParams ?? {})) url.searchParams.set(k, v);

  return fetchApiJson<T>("QuickBooks", url.toString(), { headers: { accept: "application/json", authorization: `Bearer ${token.accessToken}` } });
}

export type QuickBooksCompanyInfo = { CompanyName: string; LegalName?: string; Country?: string };

/** Read-only. The cheapest possible real call — proves the token and realm actually work, without touching any financial data. */
export async function getCompanyInfo(): Promise<ApiResult<QuickBooksCompanyInfo>> {
  const result = await callApi<{ CompanyInfo: QuickBooksCompanyInfo }>((realmId) => `companyinfo/${realmId}`);
  if (!result.ok) return result;
  if (!isRecord(result.data.CompanyInfo) || typeof result.data.CompanyInfo.CompanyName !== "string") return invalidApiResponse("QuickBooks");
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
  if (!isRecord(result.data.QueryResponse)) return invalidApiResponse("QuickBooks");
  const rows = (result.data.QueryResponse[entity] as T[] | undefined) ?? [];
  if (!Array.isArray(rows) || !rows.every(row => isRecord(row) && typeof row.Id === "string" && row.Id.length > 0)) return invalidApiResponse("QuickBooks");
  if (entity !== "Customer" && !rows.every(row => {
    const value = row as Record<string, unknown>;
    return typeof value.TotalAmt === "number" && Number.isFinite(value.TotalAmt)
      && (entity !== "Invoice" || (typeof value.Balance === "number" && Number.isFinite(value.Balance)))
      && typeof value.TxnDate === "string" && isISODate(value.TxnDate)
      && (value.DueDate === undefined || (typeof value.DueDate === "string" && isISODate(value.DueDate)));
  })) return invalidApiResponse("QuickBooks");
  return { ok: true, data: rows };
}

const PAGE_SIZE = 200;
const MAX_PAGES = 20;

/** Read-only, paginated. Never called from anywhere that could write — this module has no update/create/delete function at all. */
export async function getAllCustomers(): Promise<ApiResult<{ customers: QuickBooksCustomer[]; pages: number }>> {
  const all = new Map<string, QuickBooksCustomer>();
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await query<QuickBooksCustomer>("Customer", page * PAGE_SIZE + 1, PAGE_SIZE);
    if (!result.ok) return result;
    for (const row of result.data) all.set(row.Id, row);
    if (result.data.length < PAGE_SIZE) return { ok: true, data: { customers: [...all.values()], pages: page + 1 } };
  }
  return { ok: false, message: `Stopped after ${MAX_PAGES} pages without reaching the end.`, reason: "error" };
}

export async function getAllInvoices(): Promise<ApiResult<{ invoices: QuickBooksInvoice[]; pages: number }>> {
  const all = new Map<string, QuickBooksInvoice>();
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await query<QuickBooksInvoice>("Invoice", page * PAGE_SIZE + 1, PAGE_SIZE);
    if (!result.ok) return result;
    for (const row of result.data) all.set(row.Id, row);
    if (result.data.length < PAGE_SIZE) return { ok: true, data: { invoices: [...all.values()], pages: page + 1 } };
  }
  return { ok: false, message: `Stopped after ${MAX_PAGES} pages without reaching the end.`, reason: "error" };
}

export async function getAllPayments(): Promise<ApiResult<{ payments: QuickBooksPayment[]; pages: number }>> {
  const all = new Map<string, QuickBooksPayment>();
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await query<QuickBooksPayment>("Payment", page * PAGE_SIZE + 1, PAGE_SIZE);
    if (!result.ok) return result;
    for (const row of result.data) all.set(row.Id, row);
    if (result.data.length < PAGE_SIZE) return { ok: true, data: { payments: [...all.values()], pages: page + 1 } };
  }
  return { ok: false, message: `Stopped after ${MAX_PAGES} pages without reaching the end.`, reason: "error" };
}
