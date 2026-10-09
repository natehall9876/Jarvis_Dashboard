/** Only allow-listed support metadata leaves the provider boundary. Never return response text. */
export async function quickBooksFailureDetails(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
  const format = contentType.includes("json") ? "JSON" : contentType.includes("xml") ? "XML" : contentType.includes("html") ? "HTML" : "other";
  const rawTrace = response.headers.get("intuit_tid");
  const trace = rawTrace && /^[a-zA-Z0-9-]{8,128}$/.test(rawTrace) ? rawTrace : null;
  const text = await response.text().catch(() => "");
  let code: unknown = null;
  if (format === "JSON") {
    try {
      const body = JSON.parse(text);
      code = body?.Fault?.Error?.[0]?.code ?? body?.fault?.error?.[0]?.code ?? body?.error;
    } catch { /* A broken provider body must not break the recovery UI. */ }
  } else if (format === "XML") {
    code = text.match(/<(?:\w+:)?Error\b[^>]*\bcode=["']([^"']{1,64})["']/i)?.[1];
  }
  const safeCode = typeof code === "string" && (/^\d{2,6}$/.test(code) || code === "ApplicationAuthorizationFailed") ? code : null;
  // No URL, realm, customer data, token, or arbitrary provider text is logged.
  console.warn("[QuickBooks read failed]", JSON.stringify({ status: response.status, format, code: safeCode, intuitTid: trace }));
  return ` (HTTP ${response.status}${safeCode ? `; Intuit code ${safeCode}` : ""}${trace ? `; reference ${trace}` : ""}; ${format} response)`;
}
