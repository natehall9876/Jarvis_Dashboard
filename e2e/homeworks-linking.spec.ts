import { test, expect } from "@playwright/test";
import {
  addressesMatchStrongly,
  clientLinkUpdate,
  normalizePhone10,
  normalizeStreet,
  planLinks,
  propertyLinkUpdate,
  type HwCustomerInput,
  type JarvisClientInput,
  type JarvisPropertyInput,
} from "../src/lib/integrations/homeworks-linking";
import { presentFields } from "../src/lib/integrations/homeworks-sync";

// Pure-logic tests: no browser, no network, no database.

function hw(over: Partial<HwCustomerInput> = {}): HwCustomerInput {
  return { id: "hw-1", fullName: "Pat Smith", firstName: "Pat", lastName: "Smith", email: "", phone: "(401) 555-1234", cell: "", properties: [], ...over };
}
function client(over: Partial<JarvisClientInput> = {}): JarvisClientInput {
  return { id: "c-1", first_name: "Pat", last_name: "Smith", company_name: null, email: null, phone: "401-555-1234", homeworks_id: null, data_source: "unverified", ...over };
}
function prop(over: Partial<JarvisPropertyInput> = {}): JarvisPropertyInput {
  return { id: "p-1", client_id: "c-1", property_name: null, street: "12 Oak Street", city: "Smithfield", state: "RI", zip: "02917", homeworks_id: null, ...over };
}
const hwProp = (over: Partial<{ id: string; street1: string | null; city: string | null; zip: string | null }> = {}) => ({
  id: over.id ?? "hp-1",
  name: null,
  address: { street1: over.street1 === undefined ? "12 Oak St." : over.street1, city: over.city === undefined ? "Smithfield" : over.city, state: "RI", zip: over.zip === undefined ? "02917" : over.zip },
});

test.describe("phone normalization", () => {
  test("keeps the final valid 10 digits", () => {
    expect(normalizePhone10("(401) 555-1234")).toBe("4015551234");
    expect(normalizePhone10("+1 401-555-1234")).toBe("4015551234");
    expect(normalizePhone10("1.401.555.1234")).toBe("4015551234");
    expect(normalizePhone10("401 555 1234 ")).toBe("4015551234");
  });
  test("rejects numbers that are not a valid 10 digits", () => {
    expect(normalizePhone10("555-1234")).toBeNull();
    expect(normalizePhone10("24015551234")).toBeNull();
    expect(normalizePhone10("")).toBeNull();
    expect(normalizePhone10(null)).toBeNull();
  });
});

test.describe("customer matching", () => {
  test("exactly one phone match is a safe link that only fills blanks", () => {
    const plan = planLinks([hw({ email: "pat@example.com" })], [client()], []);
    const row = plan.customers[0];
    expect(row.status).toBe("safe_link");
    expect(row.client?.id).toBe("c-1");
    expect(row.fills).toEqual([{ field: "email", value: "pat@example.com" }]);
    expect(clientLinkUpdate(row)).toEqual({ homeworks_id: "hw-1", email: "pat@example.com", data_source: "homeworks_sync" });
  });

  test("zero phone matches is a new customer, never a link", () => {
    const plan = planLinks([hw()], [client({ phone: "401-555-9999" })], []);
    expect(plan.customers[0].status).toBe("new_customer");
    expect(plan.counts.safeCustomerLinks).toBe(0);
  });

  test("the same name with a different phone is never matched", () => {
    const plan = planLinks([hw({ phone: "(401) 555-0000" })], [client({ phone: "401-555-1234" })], []);
    expect(plan.customers[0].status).toBe("new_customer");
  });

  test("multiple clients with the same phone is ambiguous, not guessed", () => {
    const plan = planLinks([hw()], [client({ id: "c-1" }), client({ id: "c-2" })], []);
    expect(plan.customers[0].status).toBe("ambiguous");
    expect(plan.customers[0].candidates).toHaveLength(2);
    expect(plan.counts.ambiguous).toBe(1);
  });

  test("a customer with no valid phone goes to manual review", () => {
    const plan = planLinks([hw({ phone: "", cell: "12345" })], [client()], []);
    expect(plan.customers[0].status).toBe("manual_review");
  });

  test("matches on the cell number when the main phone has no match", () => {
    const plan = planLinks([hw({ phone: "", cell: "401.555.1234" })], [client()], []);
    expect(plan.customers[0].status).toBe("safe_link");
  });

  test("a client already linked to a different Homeworks ID is manual review", () => {
    const plan = planLinks([hw()], [client({ homeworks_id: "other-id" })], []);
    expect(plan.customers[0].status).toBe("manual_review");
  });

  test("two Homeworks customers claiming one Jarvis client are both held", () => {
    const plan = planLinks([hw({ id: "hw-1" }), hw({ id: "hw-2", fullName: "Sam Smith", firstName: "Sam" })], [client()], []);
    expect(plan.customers.map((c) => c.status)).toEqual(["manual_review", "manual_review"]);
  });

  test("demo clients are never link targets", () => {
    const plan = planLinks([hw()], [client({ data_source: "demo" })], []);
    expect(plan.customers[0].status).toBe("new_customer");
  });

  test("a client already linked by homeworks_id is an update, not a duplicate", () => {
    const plan = planLinks([hw()], [client({ homeworks_id: "hw-1" })], []);
    expect(plan.customers[0].status).toBe("already_linked");
    expect(plan.counts.alreadyLinkedCustomers).toBe(1);
    expect(plan.counts.safeCustomerLinks).toBe(0);
  });

  test("owner_verified data_source is preserved, only unverified is upgraded", () => {
    const verified = planLinks([hw()], [client({ data_source: "owner_verified" })], []).customers[0];
    expect(verified.dataSourceChange).toBeNull();
    expect(clientLinkUpdate(verified)).not.toHaveProperty("data_source");
  });
});

test.describe("property matching", () => {
  test("normalizes case, punctuation, and street suffixes", () => {
    expect(normalizeStreet("  12 OAK Street. ")).toBe("12 oak st");
    expect(normalizeStreet("12 Oak St")).toBe("12 oak st");
    expect(normalizeStreet("45 North Main Avenue")).toBe("45 n main ave");
    expect(normalizeStreet("7 Lane Rd")).toBe("7 ln rd");
  });

  test("an exact address under the matched client is a safe property link", () => {
    const plan = planLinks([hw({ properties: [hwProp()] })], [client()], [prop()]);
    const p = plan.customers[0].properties[0];
    expect(p.status).toBe("safe_link");
    expect(p.property?.id).toBe("p-1");
    expect(propertyLinkUpdate(p)).toEqual({ homeworks_id: "hp-1" });
  });

  test("a different zip, or an added unit number, is not a match", () => {
    expect(addressesMatchStrongly({ street1: "12 Oak St", city: "Smithfield", zip: "02828" }, { street: "12 Oak Street", city: "Smithfield", zip: "02917" })).toBe(false);
    expect(addressesMatchStrongly({ street1: "12 Oak St Apt 2", city: null, zip: null }, { street: "12 Oak St", city: null, zip: null })).toBe(false);
  });

  test("never links to a similar address owned by a different client", () => {
    const plan = planLinks([hw({ properties: [hwProp()] })], [client(), client({ id: "c-2", phone: "401-555-7777" })], [prop({ client_id: "c-2" })]);
    expect(plan.customers[0].properties[0].status).toBe("new_property");
  });

  test("two identical addresses under the client are ambiguous", () => {
    const plan = planLinks([hw({ properties: [hwProp()] })], [client()], [prop({ id: "p-1" }), prop({ id: "p-2" })]);
    expect(plan.customers[0].properties[0].status).toBe("ambiguous");
  });

  test("a matching Jarvis property already linked to another Homeworks property is manual review", () => {
    const plan = planLinks([hw({ properties: [hwProp()] })], [client()], [prop({ homeworks_id: "hp-other" })]);
    expect(plan.customers[0].properties[0].status).toBe("manual_review");
  });

  test("two Homeworks properties matching one Jarvis property are both ambiguous", () => {
    const plan = planLinks([hw({ properties: [hwProp({ id: "hp-1" }), hwProp({ id: "hp-2" })] })], [client()], [prop()]);
    expect(plan.customers[0].properties.map((p) => p.status)).toEqual(["ambiguous", "ambiguous"]);
  });

  test("properties are not compared for an unmatched or ambiguous customer", () => {
    const plan = planLinks([hw({ properties: [hwProp()] })], [client({ id: "c-1" }), client({ id: "c-2" })], [prop()]);
    expect(plan.customers[0].properties).toHaveLength(0);
  });
});

test.describe("blank-overwrite protection", () => {
  test("blank Homeworks values never produce a change, and non-blank Jarvis values are never replaced", () => {
    const plan = planLinks(
      [hw({ email: "", firstName: "Patricia", lastName: "" })],
      [client({ email: "keep@example.com", first_name: "Pat", last_name: "Smith" })],
      [],
    );
    const row = plan.customers[0];
    expect(row.fills).toEqual([]);
    expect(row.untouched).toEqual([{ field: "first_name", jarvis: "Pat", homeworks: "Patricia" }]);
    expect(clientLinkUpdate(row)).toEqual({ homeworks_id: "hw-1", data_source: "homeworks_sync" });
  });

  test("presentFields omits blank/undefined values instead of nulling them", () => {
    expect(presentFields({ a: "x", b: "", c: "  ", d: undefined, e: null })).toEqual({ a: "x" });
  });
});

test.describe("idempotency", () => {
  test("applying the plan and re-planning yields no further safe links", () => {
    const hwCustomers = [hw({ email: "pat@example.com", properties: [hwProp()] })];
    let clients = [client()];
    let props = [prop()];

    const first = planLinks(hwCustomers, clients, props);
    expect(first.counts.safeCustomerLinks).toBe(1);
    expect(first.counts.safePropertyLinks).toBe(1);

    clients = clients.map((c) => (c.id === "c-1" ? { ...c, ...clientLinkUpdate(first.customers[0]) } : c));
    props = props.map((p) => (p.id === "p-1" ? { ...p, ...propertyLinkUpdate(first.customers[0].properties[0]) } : p));

    const second = planLinks(hwCustomers, clients, props);
    expect(second.counts.safeCustomerLinks).toBe(0);
    expect(second.counts.safePropertyLinks).toBe(0);
    expect(second.counts.alreadyLinkedCustomers).toBe(1);
    expect(second.counts.alreadyLinkedProperties).toBe(1);
    expect(clients).toHaveLength(1);
    expect(props).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Regression: the real identifier shapes found in the live Homeworks payload
// (Customer.id / Property.id / Event.id are JSON NUMBERS) vs the Jarvis
// clients.homeworks_id TEXT values written by the Zapier webhook.
// ---------------------------------------------------------------------------
import { idString, normalizeCustomer, normalizeJob } from "../src/lib/integrations/homeworks-normalize";
import type { HomeworksCustomerSample, HomeworksUpcomingJob } from "../src/lib/integrations/homeworks-api";

const asWire = <T>(v: unknown) => v as T; // the API really returns numbers where the TS types say string

const liveCustomers = [
  { id: 1994294, number: "2", fullName: "Nick Hall", firstName: "Nick", lastName: "Hall", email: "", phone: "4016017264", cell: "4016017264", properties: [] },
  { id: 1994377, number: "", fullName: "Alicia Rathbun", firstName: "Alicia", lastName: "Rathbun", email: "", phone: "", cell: "401-632-7677", properties: [{ id: 1866486, name: "", address: { street1: "1 Test Rd", city: "Smithfield", state: "RI", zip: "02917" } }] },
  { id: 1994378, number: "", fullName: "Ron Gengron", firstName: "Ron", lastName: "Gengron", email: "", phone: "", cell: "401-744-8163", properties: [{ id: 1866487, name: "", address: null }, { id: 2714344, name: "", address: null }] },
  { id: 1994379, number: "", fullName: "Ronnie", firstName: "Ronnie", lastName: "", email: "", phone: "", cell: "401-559-7346", properties: [{ id: 1866488, name: "", address: null }] },
  { id: 1994381, number: "", fullName: "Rob Elliot", firstName: "Rob", lastName: "Elliot", email: "", phone: "", cell: "401-215-3422", properties: [{ id: 1866490, name: "", address: null }] },
].map((c) => normalizeCustomer(asWire<HomeworksCustomerSample>(c)));

const storedClients: JarvisClientInput[] = [
  { id: "u-nick", first_name: "Nick", last_name: "Hall", company_name: null, email: null, phone: "(401) 601-7264", homeworks_id: "1994294", data_source: "homeworks_sync" },
  { id: "u-alicia", first_name: "Alicia", last_name: "Rathbun", company_name: null, email: null, phone: "401-632-7677", homeworks_id: "1994377", data_source: "homeworks_sync" },
  { id: "u-ron", first_name: "Ron", last_name: "Gengron", company_name: null, email: null, phone: "4017448163", homeworks_id: "1994378", data_source: "homeworks_sync" },
  { id: "u-ronnie", first_name: "Ronnie", last_name: null, company_name: null, email: null, phone: "401-559-7346", homeworks_id: "1994379", data_source: "homeworks_sync" },
  { id: "u-rob", first_name: "Rob", last_name: "Elliot", company_name: null, email: null, phone: "401-215-3422", homeworks_id: "1994381", data_source: "homeworks_sync" },
];

test.describe("real identifier shapes (numeric Homeworks IDs vs text Jarvis IDs)", () => {
  test("the adapter turns numeric API IDs into strings and records the raw type", () => {
    expect(idString(1994294)).toBe("1994294");
    expect(liveCustomers[0].id).toBe("1994294");
    expect(liveCustomers[0].rawIdType).toBe("number");
    expect(liveCustomers[2].properties.map((p) => p.id)).toEqual(["1866487", "2714344"]);
  });

  test("the unnormalized numeric ID is exactly what broke strict comparison", () => {
    expect(new Set(["1994294"]).has(1994294 as unknown as string)).toBe(false);
    expect(new Set(["1994294"]).has(idString(1994294))).toBe(true);
  });

  test("all five real customers are recognized as already linked, not manual review", () => {
    const plan = planLinks(liveCustomers, storedClients, []);
    expect(plan.customers.map((c) => c.status)).toEqual(Array(5).fill("already_linked"));
    expect(plan.customers.filter((c) => c.status === "manual_review")).toHaveLength(0);
    expect(plan.counts.safeCustomerLinks).toBe(0);
    expect(plan.idDiagnostics.map((d) => d.classification)).toEqual(Array(5).fill("same_id"));
    expect(plan.idDiagnostics[0]).toMatchObject({ storedId: "1994294", liveId: "1994294", liveIdRawType: "number", customerNumber: "2", phoneLast4: "7264" });
  });

  test("planLinks is safe even if a raw numeric ID slips through un-normalized", () => {
    const raw = asWire<HwCustomerInput[]>([{ ...liveCustomers[0], id: 1994294 }]);
    expect(planLinks(raw, storedClients, []).customers[0].status).toBe("already_linked");
  });

  test("numeric live property IDs match text-stored Zapier property IDs", () => {
    const props: JarvisPropertyInput[] = [
      { id: "p-a", client_id: "u-alicia", property_name: null, street: "1 Test Road", city: "Smithfield", state: "RI", zip: "02917", homeworks_id: "1866486" },
    ];
    const plan = planLinks(liveCustomers, storedClients, props);
    const alicia = plan.customers.find((c) => c.hwName === "Alicia Rathbun")!;
    expect(alicia.properties[0].status).toBe("already_linked");
  });

  test("upcoming-job property IDs are strings, so the 'property synced' Set lookup works", () => {
    const job = normalizeJob(
      asWire<HomeworksUpcomingJob>({ id: 555, title: "Mow", status: "OPEN", startDate: "2026-09-21", hasTime: false, startTime: null, total: "40", recurringEventId: 77, customer: { id: 1994377, fullName: "Alicia Rathbun" }, property: { id: 1866486, name: "", address: null } }),
    );
    expect(job.property?.id).toBe("1866486");
    expect(job.recurringEventId).toBe("77");
    expect(new Set(["1866486"]).has(job.property!.id)).toBe(true);
  });

  test("a genuinely different stored ID is never overwritten: manual review shows both IDs and why", () => {
    const conflicting = storedClients.map((c) => (c.id === "u-nick" ? { ...c, homeworks_id: "9999999" } : c));
    const row = planLinks(liveCustomers, conflicting, []).customers[0];
    expect(row.status).toBe("manual_review");
    expect(row.reason).toContain("9999999");
    expect(row.reason).toContain("1994294");
    expect(row.idConflict).toMatchObject({ storedId: "9999999", liveId: "1994294", classification: "unresolved_conflict" });
    expect(row.fills).toEqual([]);
  });

  test("classifies a stored customer NUMBER as a legacy mapping, but still does not overwrite it", () => {
    const legacy = storedClients.map((c) => (c.id === "u-nick" ? { ...c, homeworks_id: "2" } : c));
    const plan = planLinks(liveCustomers, legacy, []);
    expect(plan.customers[0].status).toBe("manual_review");
    expect(plan.customers[0].idConflict?.classification).toBe("verified_legacy_mapping");
  });

  test("classifies a stored PROPERTY ID as the wrong stored type, but still does not overwrite it", () => {
    const wrong = storedClients.map((c) => (c.id === "u-alicia" ? { ...c, homeworks_id: "1866486" } : c));
    const plan = planLinks(liveCustomers, wrong, []);
    const alicia = plan.customers.find((c) => c.hwName === "Alicia Rathbun")!;
    expect(alicia.status).toBe("manual_review");
    expect(alicia.idConflict?.classification).toBe("likely_wrong_stored_type");
  });

  test("a stored ID that is another Homeworks customer's canonical ID is an unresolved conflict", () => {
    const swapped = storedClients.map((c) => (c.id === "u-ron" ? { ...c, homeworks_id: "1994379" } : c));
    const plan = planLinks(liveCustomers, swapped, []);
    const ron = plan.customers.find((c) => c.hwName === "Ron Gengron")!;
    expect(ron.status).toBe("manual_review");
    expect(ron.idConflict?.classification).toBe("unresolved_conflict");
    expect(ron.idConflict?.explanation).toContain("Ronnie");
  });
});
