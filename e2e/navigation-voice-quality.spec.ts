import { test, expect } from "@playwright/test";
import { loadServerModule } from "./load-server-module";
import { selectBrowserVoice, stripForSpeech } from "../src/lib/jarvis/voice-utils";

const load = () => loadServerModule<typeof import("../src/lib/jarvis/navigation-history")>("src/lib/jarvis/navigation-history.ts");
function historyHarness() {
  let index = 0;
  const entries = [{ state: { __NA: true }, url: "https://jarvis.example/jobs/one" }];
  const history = {
    get state() { return entries[index].state; },
    pushState(state: object, _title: string, url?: string | URL | null) {
      entries.splice(++index); entries.push({ state: state as typeof entries[0]["state"], url: new URL(url ?? entries[index - 1].url, entries[index - 1].url).href });
    },
    replaceState(state: object, _title: string, url?: string | URL | null) {
      entries[index] = { state: state as typeof entries[0]["state"], url: new URL(url ?? entries[index].url, entries[index].url).href };
    },
  };
  return { history: history as History, url: () => new URL(entries[index].url), back: () => { index--; }, forward: () => { index++; } };
}
test("back never leaves Jarvis on a direct link, but follows pages and filters after navigation", () => {
  const api = load(), h = historyHarness();
  const cleanup = api.trackNavigationHistory(h.history, h.url, () => {});
  expect(api.canGoBackInJarvis(h.history.state, h.url())).toBe(false);
  h.history.pushState({ __NA: true }, "", "/schedule?date=2026-10-12");
  h.history.pushState({ __NA: true }, "", "/schedule?date=2026-10-13");
  expect(api.canGoBackInJarvis(h.history.state, h.url())).toBe(true);
  h.back(); expect(h.url().search).toBe("?date=2026-10-12");
  expect(api.canGoBackInJarvis(h.history.state, h.url())).toBe(true);
  h.back(); expect(api.canGoBackInJarvis(h.history.state, h.url())).toBe(false);
  h.forward(); expect(api.canGoBackInJarvis(h.history.state, h.url())).toBe(true);
  cleanup();
});
test("refresh and replace preserve the back boundary and Next router state", () => {
  const api = load(), h = historyHarness();
  let cleanup = api.trackNavigationHistory(h.history, h.url, () => {});
  h.history.replaceState({ __NA: true, tree: "retained" }, "", "/clients");
  expect(api.canGoBackInJarvis(h.history.state, h.url())).toBe(false);
  expect(h.history.state.tree).toBe("retained");
  h.history.pushState({ __NA: true }, "", "/clients/one");
  cleanup(); cleanup = api.trackNavigationHistory(h.history, h.url, () => {});
  expect(api.canGoBackInJarvis(h.history.state, h.url())).toBe(true);
  h.history.replaceState({ __NA: true }, "", "/clients/two");
  expect(api.canGoBackInJarvis(h.history.state, h.url())).toBe(true);
  h.back(); expect(api.canGoBackInJarvis(h.history.state, h.url())).toBe(false);
  cleanup();
});
test("direct records return to their section with an always-safe home fallback", () => {
  const { navigationFallback } = load();
  for (const section of ["jobs", "clients", "properties", "invoices", "quotes", "routes", "equipment", "employees"]) {
    expect(navigationFallback("/" + section + "/record")).toBe("/" + section);
  }
  expect(navigationFallback("/settings/homeworks-import")).toBe("/settings");
  expect(navigationFallback("/intelligence")).toBe("/");
  expect(navigationFallback("//external.example")).toBe("/");
  expect(navigationFallback("/unknown/record")).toBe("/");
});
test("natural speech quality wins over a basic British voice", () => {
  const voices = [{ name: "Daniel", lang: "en-GB" }, { name: "Alex (Enhanced)", lang: "en-US" }];
  expect(selectBrowserVoice(voices)?.name).toBe("Alex (Enhanced)");
  expect(selectBrowserVoice([...voices, { name: "Daniel (Enhanced)", lang: "en-GB" }])?.name).toBe("Daniel (Enhanced)");
});
test("speech turns markdown lists and newlines into flowing sentences without breaking numbers", () => {
  expect(stripForSpeech("**Today**\n- 9 clients\n- $1,025.50 expected\nArrive at 9:30 a.m.")).toBe("Today. 9 clients. $1,025.50 expected. Arrive at 9:30 a.m.");
});
