import { test, expect } from "@playwright/test";
import { loadServerModule } from "./load-server-module";

const { quickBooksFailureDetails } = loadServerModule<typeof import("../src/lib/integrations/quickbooks-diagnostics")>("src/lib/integrations/quickbooks-diagnostics.ts");
test("Intuit XML permission errors preserve only code and support reference", async () => {
  const detail = await quickBooksFailureDetails(new Response('<IntuitResponse><Fault><Error code="003100"><Detail>secret-token customer@email.test</Detail></Error></Fault></IntuitResponse>', { status: 403, headers: { "content-type": "application/xml", intuit_tid: "trace-12345678" } }));
  expect(detail).toContain("Intuit code 003100");
  expect(detail).toContain("reference trace-12345678");
  expect(detail).not.toContain("secret-token");
  expect(detail).not.toContain("customer@");
});
test("Intuit JSON errors preserve safe diagnostic code", async () => {
  const detail = await quickBooksFailureDetails(Response.json({ Fault: { Error: [{ code: "ApplicationAuthorizationFailed", Detail: "private" }] } }, { status: 403 }));
  expect(detail).toContain("ApplicationAuthorizationFailed");
  expect(detail).not.toContain("private");
});
test("HTML denial is identifiable without leaking its body", async () => {
  const detail = await quickBooksFailureDetails(new Response("<html>private access denied</html>", { status: 403, headers: { "content-type": "text/html" } }));
  expect(detail).toContain("HTTP 403");
  expect(detail).toContain("HTML response");
  expect(detail).not.toContain("private");
});
test("Unexpected provider values and malformed bodies are never surfaced", async () => {
  const detail = await quickBooksFailureDetails(Response.json({ Fault: { Error: [{ code: "Bearer secret" }] } }, { status: 403, headers: { intuit_tid: "secret@example.com" } }));
  expect(detail).not.toContain("secret");
  expect(await quickBooksFailureDetails(new Response("{broken", { status: 403, headers: { "content-type": "application/json" } }))).toContain("HTTP 403");
});
