import { test, expect } from "@playwright/test";
import * as React from "react";
import { createElement, type ComponentType, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadServerModule } from "./load-server-module";

const noop = async () => {};
const native = { homeworks_id: null, homeworks_status: null, homeworks_deleted: false, homeworks_notes: null };
const source = { ...native, homeworks_id: "hw-test-source" };
const localOption = { id: "local", label: "Local property", clientId: "local-client", ...native };
const sourceOption = { id: "source", label: "Source property", clientId: "source-client", ...source };
const inheritedOption = { id: "inherited", label: "Source client property", clientId: "source-client", ...native, client: source };
const options = [localOption, sourceOption, inheritedOption];

type PageModule = { default: (props: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) => Promise<ReactElement> };

function renderForm(file: string, name: string, props: Record<string, unknown>) {
  const loaded = loadServerModule<Record<string, ComponentType<Record<string, unknown>>>>(file);
  return renderToStaticMarkup(createElement(loaded[name], { action: noop, ...props }));
}

function baseMocks() {
  return {
    "next/navigation": { notFound: () => { throw new Error("not found"); }, useRouter: () => ({ refresh: noop }) },
    "@/lib/data/options": { getClientOptions: async () => ({ data: options }), getPropertyOptions: async () => ({ data: options }), getServiceOptions: async () => ({ data: [] }) },
    "@/lib/data/activity-log": { getActivityForEntity: async () => ({ data: [] }) },
    "@/lib/data/client-photos": { getClientPhotos: async () => ({ data: [] }) },
    "@/lib/supabase/storage": { getJobPhotoUrls: async () => ({ urls: new Map(), error: null }) },
    "@/components/photos/photo-upload-form": { PhotoUploadForm: () => null },
    "@/components/photos/photo-grid": { PhotoGrid: () => null },
    "@/lib/actions/employees": { updateEmployee: noop, archiveEmployee: noop },
    "@/lib/actions/clients": { updateClient: noop, archiveClient: noop },
    "@/lib/actions/properties": { updateProperty: noop, archiveProperty: noop },
    "@/lib/actions/quotes": Object.fromEntries(["updateQuote", "sendQuote", "acceptQuote", "declineQuote", "deleteDraftQuote", "convertQuoteToInvoice", "convertQuoteToJob", "addQuoteItem", "removeQuoteItem"].map((name) => [name, noop])),
    "@/lib/actions/invoices": Object.fromEntries(["updateInvoice", "sendInvoice", "deleteDraftInvoice", "voidInvoice", "addInvoiceItem", "removeInvoiceItem", "recordPayment"].map((name) => [name, noop])),
  };
}

async function renderPage(kind: string, data: Record<string, unknown>, search: Record<string, string> = {}, overrides: Record<string, unknown> = {}) {
  const method = `get${kind[0].toUpperCase()}${kind.slice(1)}ById`;
  const page = loadServerModule<PageModule>(`src/app/(dashboard)/${kind === "property" ? "properties" : `${kind}s`}/[id]/page.tsx`, {
    ...baseMocks(),
    [`@/lib/data/${kind === "property" ? "properties" : `${kind}s`}`]: { [method]: async () => ({ data, error: null }), getEmployeeRecentJobs: async () => ({ data: [] }) },
    ...overrides,
  });
  return renderToStaticMarkup(await page.default({ params: Promise.resolve({ id: "fixture" }), searchParams: Promise.resolve(search) }));
}

const clientData = (markers: Record<string, unknown>) => ({
  client: { id: "fixture", first_name: "Fixture", last_name: "Customer", status: "active", notes: "Native note", ...native, ...markers },
  properties: [], jobs: [], quotes: [], invoices: [], outstanding_balance: 0, balance_verified: false,
});
const propertyData = (markers: Record<string, unknown>, client: unknown = null) => ({
  property: { id: "fixture", street: "Synthetic address", active: true, access_notes: "Native access", service_notes: "Native service note", ...native, ...markers },
  client, route: null, agreements: [], jobs: [], quotes: [], invoices: [], photos: [],
});
const financialData = (markers: Record<string, unknown>) => ({
  id: "fixture", client_id: "client", property_id: null, quote_number: "Q-1", invoice_number: "I-1", status: "draft", display_status: "draft",
  notes: "Native financial note", created_at: "2026-10-01T00:00:00Z", total: 10, amount_paid: 0, balance: 10, days_overdue: 0,
  client: null, property: null, payments: [], items: [{ id: "item", description: "Synthetic service", quantity: 1, unit_price: 10, total: 10 }],
  ...native, ...markers,
});

for (const markers of [source, { data_source: "homeworks_sync" }, { homeworks_status: "ACTIVE" }, { homeworks_deleted: true }]) {
  test(`source customer hides identity/archive and retains native notes: ${JSON.stringify(markers)}`, async () => {
    const html = await renderPage("client", clientData(markers), { edit: "1" });
    expect(html).toContain("Managed in Homeworks");
    expect(html).toContain("Homeworks source ID:");
    expect(html).toContain('name="notes"');
    expect(html).not.toContain('name="first_name"');
    expect(html).not.toContain('name="phone"');
    expect(html).not.toContain(">Archive<");
    expect(html).not.toContain("+ Add property");
  });
}

test("source property edits only native notes, including inherited client ownership", async () => {
  for (const data of [propertyData(source), propertyData(native, source)]) {
    const html = await renderPage("property", data, { edit: "1" });
    expect(html).toContain("Managed in Homeworks");
    expect(html).toContain('name="access_notes"');
    expect(html).toContain('name="service_notes"');
    expect(html).not.toContain('name="street"');
    expect(html).not.toContain('name="client_id"');
    expect(html).not.toContain(">Archive<");
  }
});

test("native customer and property controls remain available", async () => {
  expect(await renderPage("client", clientData(native), { edit: "1" })).toContain('name="first_name"');
  const html = await renderPage("property", propertyData(native), { edit: "1" });
  expect(html).toContain('name="street"');
  expect(html).toContain("Archive");
});

for (const kind of ["quote", "invoice"]) {
  test(`${kind} source and inherited records expose only native notes through edit query strings`, async () => {
    for (const markers of [source, { homeworks_status: "OPEN" }, { homeworks_deleted: true }, { client: source }, { property: source }]) {
      for (const status of ["draft", "sent", "accepted"]) {
        const html = await renderPage(kind, financialData({ ...markers, status }), { edit: "1", addItem: "1", pay: "1" });
        expect(html).toContain("Managed in Homeworks");
        expect(html).toContain("Homeworks source ID:");
        expect(html).toContain("Edit Jarvis notes");
        expect(html).toContain("Save Jarvis Notes");
        expect(html).toContain('name="notes"');
        expect(html).toContain("Native financial note</textarea>");
        const fields = [...html.matchAll(/<(?:input|select|textarea)\b[^>]*\bname="([^"]+)"/g)].map((match) => match[1]);
        expect(fields).toEqual(["notes"]);
        expect(html.match(/<form\b/g)).toHaveLength(1);
        expect(html).not.toContain('aria-label="Remove line item"');
        expect(html).not.toContain("?pay=1");
        expect(html).toContain("?edit=1");
        expect(html).not.toContain("?addItem=1");
      }
    }
  });
  test(`native ${kind} keeps editing and line-item controls`, async () => {
    const html = await renderPage(kind, financialData(native), { edit: "1", addItem: "1" });
    expect(html).toContain('aria-label="Remove line item"');
    expect(html).toContain(`?edit=1`);
    expect(html).toContain('name="description"');
    expect(html).toContain('name="notes"');
    expect(html).toContain(kind === "quote" ? 'name="valid_until"' : 'name="due_date"');
  });
  test(`${kind} creation excludes source customers and properties`, () => {
    const html = renderForm(`src/components/${kind}s/${kind}-form.tsx`, `${kind[0].toUpperCase()}${kind.slice(1)}Form`, { clients: [localOption, sourceOption], properties: options });
    expect(html).toContain('<option value="local"');
    expect(html).not.toContain('<option value="source"');
    expect(html).not.toContain('<option value="inherited"');
  });
}

test("job creation excludes source properties but route preferences retain them", () => {
  const html = renderForm("src/components/jobs/job-form.tsx", "JobForm", { properties: options, services: [], routes: [], employees: [] });
  expect(html).toContain('<option value="local"');
  expect(html).not.toContain('<option value="source"');
  expect(html).not.toContain('<option value="inherited"');
  const route = renderForm("src/components/routes/add-stop-form.tsx", "AddStopForm", { properties: options });
  expect(route).toContain('<option value="source"');
  expect(route).toContain('<option value="inherited"');
});

test("source-only creation and source customer property deep links offer no local submit", () => {
  for (const [file, name, props] of [
    ["jobs/job-form", "JobForm", { properties: [sourceOption], services: [], routes: [], employees: [] }],
    ["quotes/quote-form", "QuoteForm", { clients: [sourceOption], properties: [sourceOption] }],
    ["invoices/invoice-form", "InvoiceForm", { clients: [sourceOption], properties: [sourceOption] }],
    ["properties/property-form", "PropertyForm", { clients: options, defaultClientId: "source" }],
  ] as const) {
    const html = renderForm(`src/components/${file}.tsx`, name, props);
    expect(html).toContain("Managed in Homeworks");
    expect(html).not.toContain("<form");
  }
});

test("source job form preserves date write-through and native notes/hours while source fields are disabled", () => {
  for (const markers of [source, { ...source, homeworks_status: "OPEN" }, { ...source, homeworks_deleted: true }]) {
    const html = renderForm("src/components/jobs/job-form.tsx", "JobForm", { job: { ...markers, crew: [], property_id: "source", status: "scheduled" }, properties: options, services: [], routes: [], employees: [] });
    for (const name of ["scheduled_date", "scheduled_start_time", "notes", "completion_notes", "actual_hours"]) {
      const input = html.match(new RegExp(`<[^>]+(?:id|name)="${name}"[^>]*>`))?.[0];
      expect(input, name).toBeTruthy();
      expect(input, name).not.toContain('disabled=""');
    }
    for (const name of ["property_id", "service_id", "route_id", "price", "budgeted_hours", "crew_size"]) {
      expect(html.match(new RegExp(`<[^>]+id="${name}"[^>]*>`))?.[0], name).toContain('disabled=""');
    }
    expect(html).toContain("save to Homeworks first");
  }
});

function completedPhotoUploader() {
  return loadServerModule<typeof import("../src/components/photos/photo-upload-form")>("src/components/photos/photo-upload-form.tsx", {
    react: {
      ...React,
      useState: (initial: unknown) => React.useState(
        initial && typeof initial === "object" && "kind" in initial && initial.kind === "idle"
          ? { kind: "done", photoId: "synthetic-upload" }
          : initial,
      ),
    },
    "next/navigation": { useRouter: () => ({ refresh: noop }) },
    "@/lib/actions/photos": { prepareJobPhotoUpload: noop, finalizeJobPhotoUpload: noop },
    "@/lib/supabase/client": { createSupabaseBrowserClient: () => { throw new Error("No real clients in fixture"); } },
    "@/components/photos/work-sheet-extraction-panel": { WorkSheetExtractionPanel: () => createElement("button", null, "Create worksheet job") },
  });
}

test("completed photo upload retains photos and offers worksheet jobs only for native properties", () => {
  const loaded = completedPhotoUploader();
  const html = renderToStaticMarkup(createElement(loaded.PhotoUploadForm, { propertyId: "source", managedRecord: source }));
  expect(html).toContain('aria-label="Choose a photo"');
  expect(html).toContain("Create jobs for this property in Homeworks");
  expect(html).not.toContain("Create worksheet job");
  const localHtml = renderToStaticMarkup(createElement(loaded.PhotoUploadForm, { propertyId: "native" }));
  expect(localHtml).toContain("Create worksheet job");
});

test("retired import panels cannot offer local source mutation buttons", () => {
  for (const [file, name] of [["import-form", "HomeworksImportForm"], ["link-panel", "HomeworksLinkPanel"], ["enrich-panel", "HomeworksEnrichPanel"], ["historical-panel", "HomeworksHistoricalPanel"]]) {
    const html = renderForm(`src/components/settings/homeworks-${file}.tsx`, name, { onLinked: noop });
    expect(html).toContain("Managed in Homeworks");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<form");
  }
});


test("source employee retains editable staffing details without source identity or archive", async () => {
  for (const markers of [source, { homeworks_status: "ACTIVE" }, { homeworks_deleted: true }]) {
    const html = await renderPage("employee", { id: "fixture", first_name: "Synthetic", active: true, ...native, ...markers }, { edit: "1" });
    expect(html).toContain("Managed in Homeworks");
    expect(html).toContain("Homeworks source ID:");
    expect(html).toContain("Save Staffing Details");
    for (const name of ["notes", "hourly_rate", "role", "has_drivers_license", "hire_date"]) {
      const control = html.match(new RegExp(`<[^>]+name="${name}"[^>]*>`))?.[0];
      expect(control, name).toBeTruthy();
      expect(control, name).not.toContain('disabled=""');
    }
    for (const name of ["first_name", "last_name", "phone", "email", "active"]) expect(html).not.toContain(`name="${name}"`);
    expect(html).not.toContain(">Archive<");
    expect(html).toContain('type="hidden" name="has_drivers_license" value="false"');
  }
});

test("native employee keeps identity and archive controls", async () => {
  const html = await renderPage("employee", { id: "fixture", first_name: "Native", active: true, ...native }, { edit: "1" });
  expect(html).toContain('name="first_name"');
  expect(html).toContain('name="active"');
  expect(html).toContain(">Archive<");
});


test("property page passes ownership into completed photo uploads for source properties and source customers", async () => {
  const uploader = completedPhotoUploader();
  for (const data of [propertyData(source), propertyData(native, source), propertyData(native, { data_source: "homeworks_sync" })]) {
    const html = await renderPage("property", data, {}, { "@/components/photos/photo-upload-form": uploader });
    expect(html).toContain('aria-label="Choose a photo"');
    expect(html).toContain("Create jobs for this property in Homeworks");
    expect(html).not.toContain("Create worksheet job");
  }
  const nativeHtml = await renderPage("property", propertyData(native), {}, { "@/components/photos/photo-upload-form": uploader });
  expect(nativeHtml).toContain("Create worksheet job");
});

test("inherited source jobs show native-only edits without a linked source visit", () => {
  for (const property of [sourceOption, inheritedOption]) {
    const html = renderForm("src/components/jobs/job-form.tsx", "JobForm", {
      job: { ...native, crew: [], property_id: property.id, property, status: "scheduled" },
      properties: options, services: [], routes: [], employees: [],
    });
    expect(html).toContain("Managed in Homeworks");
    expect(html).toContain("no linked Homeworks visit");
    for (const name of ["scheduled_date", "scheduled_start_time", "property_id", "service_id", "route_id", "price", "budgeted_hours", "crew_size"]) {
      expect(html.match(new RegExp(`<[^>]+id="${name}"[^>]*>`))?.[0], name).toContain('disabled=""');
    }
    for (const name of ["notes", "completion_notes", "actual_hours"]) {
      expect(html.match(new RegExp(`<[^>]+(?:id|name)="${name}"[^>]*>`))?.[0], name).not.toContain('disabled=""');
    }
  }
});


test("job detail has one status control for linked visits and none for unlinked source jobs", () => {
  const loaded = loadServerModule<Record<string, ComponentType<Record<string, unknown>>>>("src/components/jobs/job-detail-view.tsx", {
    ...baseMocks(),
    "@/lib/data/jobs": { jobProductionRate: () => null },
    "@/components/jobs/job-notes": { JobNotes: () => null },
  });
  for (const [jobMarkers, property, expectedControls] of [
    [source, localOption, 1],
    [native, sourceOption, 0],
    [native, inheritedOption, 0],
    [{ ...native, homeworks_status: "OPEN" }, localOption, 0],
    [native, localOption, 2],
  ] as const) {
    const html = renderToStaticMarkup(createElement(loaded.JobDetailView, {
      id: "fixture", job: { ...jobMarkers, property_id: property.id, property, status: "scheduled", crew: [], equipment: [], materials: [], photos: [], sectionErrors: {} },
      photoUrls: new Map(), photoUrlsError: null, activity: [], jobNotes: { data: [], needsMigration: false, error: null },
      isEditing: true, properties: options, services: [], routes: [], employees: [], updateJobAction: noop, changeStatusAction: noop,
    }));
    const statusControls = (html.match(/<select[^>]*name="status"[^>]*>/g) ?? []).filter((control) => !control.includes('disabled=""'));
    expect(statusControls).toHaveLength(expectedControls);
    for (const name of ["notes", "completion_notes", "actual_hours"]) {
      expect(html.match(new RegExp(`<[^>]+(?:id|name)="${name}"[^>]*>`))?.[0], name).not.toContain('disabled=""');
    }
  }
});
