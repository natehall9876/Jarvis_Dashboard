/**
 * Pure matching logic for the one-time "link existing Zapier-imported
 * records to their Homeworks IDs" workflow. No I/O, no Supabase, no
 * Homeworks calls — everything here is a deterministic function of its
 * inputs so it can be unit-tested exhaustively and so the preview and the
 * confirm step provably run the identical logic.
 *
 * Safety rules encoded here (not left to the UI):
 *  - A customer is only ever linked on an exact 10-digit phone match against
 *    exactly one existing client. Names are display-only, never a match key.
 *  - Zero matches is "new customer" (linking never creates anything);
 *    several matches is "ambiguous" (never guessed).
 *  - Fills only ever go into blank Jarvis fields. A non-blank Jarvis value
 *    is never replaced, and a blank Homeworks value never replaces anything.
 *  - Properties are only compared under an already-matched client, and only
 *    an exact normalized street match (with agreeing zip/city when both
 *    sides have one) counts.
 */

export type HwPropertyInput = {
  id: string;
  name: string | null;
  address: { street1: string | null; city: string | null; state: string | null; zip: string | null } | null;
};

export type HwCustomerInput = {
  id: string;
  /** typeof the id as the API returned it (Homeworks sends numbers) — diagnostic only. */
  rawIdType?: string;
  /** Homeworks' human-facing Customer.number — never the canonical ID. */
  number?: string;
  fullName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  cell: string;
  properties: HwPropertyInput[];
};

export type JarvisClientInput = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  homeworks_id: string | null;
  data_source: string;
};

export type JarvisPropertyInput = {
  id: string;
  client_id: string | null;
  property_name: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  homeworks_id: string | null;
};

/**
 * Homeworks IDs arrive as JSON numbers; Jarvis stores homeworks_id as text.
 * Every ID comparison in this module goes through here so 1994294 and
 * "1994294" are the same ID (the exact mismatch found in the live data).
 */
export function idOf(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

/** Final 10 digits of a valid US number: 10 digits, or 11 starting with 1. Anything else is not comparable. */
export function normalizePhone10(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = input.replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return null;
}

const STREET_WORDS: Record<string, string> = {
  street: "st",
  st: "st",
  road: "rd",
  rd: "rd",
  avenue: "ave",
  av: "ave",
  ave: "ave",
  drive: "dr",
  dr: "dr",
  lane: "ln",
  ln: "ln",
  court: "ct",
  ct: "ct",
  circle: "cir",
  cir: "cir",
  boulevard: "blvd",
  blvd: "blvd",
  highway: "hwy",
  hwy: "hwy",
  place: "pl",
  pl: "pl",
  terrace: "ter",
  ter: "ter",
  parkway: "pkwy",
  pkwy: "pkwy",
  trail: "trl",
  trl: "trl",
  north: "n",
  south: "s",
  east: "e",
  west: "w",
  northeast: "ne",
  northwest: "nw",
  southeast: "se",
  southwest: "sw",
};

/**
 * Lowercase, drop punctuation, collapse whitespace, and standardize common
 * suffix/directional words. The first token (the house number) is never
 * rewritten. Unit designators are deliberately left in, so "12 Oak St Apt 2"
 * and "12 Oak St" do NOT match — a missed match is held for review, a false
 * match would be a wrong link.
 */
export function normalizeStreet(input: string | null | undefined): string {
  if (!input) return "";
  const tokens = input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  return tokens.map((t, i) => (i === 0 ? t : (STREET_WORDS[t] ?? t))).join(" ");
}

function normalizeCity(input: string | null | undefined): string {
  return (input ?? "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean).join(" ");
}

function zip5(input: string | null | undefined): string {
  const digits = (input ?? "").replace(/\D/g, "");
  return digits.length >= 5 ? digits.slice(0, 5) : "";
}

function blank(v: string | null | undefined): boolean {
  return v == null || v.trim() === "";
}

export function addressesMatchStrongly(
  hw: { street1: string | null; city: string | null; zip: string | null },
  jarvis: { street: string | null; city: string | null; zip: string | null },
): boolean {
  const a = normalizeStreet(hw.street1);
  const b = normalizeStreet(jarvis.street);
  if (!a || !b || a !== b) return false;
  const za = zip5(hw.zip);
  const zb = zip5(jarvis.zip);
  if (za && zb) return za === zb;
  const ca = normalizeCity(hw.city);
  const cb = normalizeCity(jarvis.city);
  if (ca && cb) return ca === cb;
  return true;
}

export type FieldFill = { field: string; value: string };
export type FieldDiff = { field: string; jarvis: string; homeworks: string };

export type PropertyLinkStatus = "safe_link" | "already_linked" | "new_property" | "ambiguous" | "manual_review";
export type CustomerLinkStatus = "safe_link" | "already_linked" | "new_customer" | "ambiguous" | "manual_review";

export type PropertyPlanRow = {
  hwId: string;
  label: string;
  status: PropertyLinkStatus;
  reason: string;
  property?: { id: string; label: string };
  candidates?: { id: string; label: string }[];
  fills: FieldFill[];
  untouched: FieldDiff[];
};

export type IdClassification = "same_id" | "verified_legacy_mapping" | "likely_wrong_stored_type" | "unresolved_conflict" | "no_stored_id";

export type IdDiagnosticRow = {
  hwName: string;
  phoneLast4: string | null;
  clientId: string;
  clientName: string;
  matchedBy: "id" | "phone";
  storedId: string | null;
  liveId: string;
  liveIdRawType: string;
  customerNumber: string | null;
  livePropertyIds: string[];
  jarvisProperties: { id: string; homeworksId: string | null }[];
  classification: IdClassification;
  explanation: string;
};

export type IdConflict = { storedId: string; liveId: string; classification: IdClassification; explanation: string };

export type CustomerPlanRow = {
  hwId: string;
  idConflict?: IdConflict;
  hwName: string;
  status: CustomerLinkStatus;
  reason: string;
  matchedPhone?: string;
  client?: { id: string; name: string; phone: string | null; homeworksId: string | null; dataSource: string };
  candidates?: { id: string; name: string }[];
  fills: FieldFill[];
  untouched: FieldDiff[];
  dataSourceChange: { from: string; to: string } | null;
  properties: PropertyPlanRow[];
};

export type LinkPlan = {
  customers: CustomerPlanRow[];
  idDiagnostics: IdDiagnosticRow[];
  counts: {
    safeCustomerLinks: number;
    safePropertyLinks: number;
    newCustomers: number;
    newProperties: number;
    alreadyLinkedCustomers: number;
    alreadyLinkedProperties: number;
    manualReview: number;
    ambiguous: number;
  };
};

function clientName(c: JarvisClientInput): string {
  return [c.first_name, c.last_name].filter((x) => !blank(x)).join(" ") || c.company_name || "(unnamed)";
}

function propertyLabel(p: { street: string | null; city: string | null; property_name: string | null }): string {
  return [p.street, p.city].filter((x) => !blank(x)).join(", ") || p.property_name || "(no address)";
}

function hwName(c: HwCustomerInput): string {
  return c.fullName || `${c.firstName} ${c.lastName}`.trim() || "(no name)";
}

/**
 * Explains a stored Jarvis homeworks_id that is NOT the live canonical ID.
 * Only ever classifies — the caller never overwrites a conflicting non-blank
 * ID on the strength of this (or of a phone match).
 */
export function classifyStoredId(stored: string, hw: HwCustomerInput, all: HwCustomerInput[]): { classification: IdClassification; explanation: string } {
  const live = idOf(hw.id);
  if (!stored) return { classification: "no_stored_id", explanation: "Jarvis has no Homeworks ID stored for this client." };
  if (stored === live) return { classification: "same_id", explanation: "Stored ID equals the live canonical customer ID (compared as text; the API sends it as a number)." };
  const number = idOf(hw.number);
  if (number && stored === number) {
    return { classification: "verified_legacy_mapping", explanation: "Stored ID equals this customer's Homeworks customer number (Customer.number), not its canonical ID." };
  }
  if (hw.properties.some((p) => idOf(p.id) === stored)) {
    return { classification: "likely_wrong_stored_type", explanation: "Stored ID equals one of this customer's own property IDs — a property ID was saved as the customer ID." };
  }
  const other = all.find((c) => c !== hw && idOf(c.id) === stored);
  if (other) {
    return { classification: "unresolved_conflict", explanation: `Stored ID is the canonical ID of a DIFFERENT Homeworks customer (${hwName(other)}).` };
  }
  if (all.some((c) => c.properties.some((p) => idOf(p.id) === stored))) {
    return { classification: "unresolved_conflict", explanation: "Stored ID equals a property ID that belongs to a different Homeworks customer." };
  }
  return { classification: "unresolved_conflict", explanation: "Stored ID matches no live customer ID, customer number, or property ID." };
}

function planClientFills(client: JarvisClientInput, hw: HwCustomerInput): { fills: FieldFill[]; untouched: FieldDiff[] } {
  const fills: FieldFill[] = [];
  const untouched: FieldDiff[] = [];
  const check = (field: string, jarvis: string | null, incoming: string, same: (a: string, b: string) => boolean) => {
    const inc = incoming.trim();
    if (!inc) return;
    if (blank(jarvis)) fills.push({ field, value: inc });
    else if (!same(jarvis as string, inc)) untouched.push({ field, jarvis: jarvis as string, homeworks: inc });
  };
  const ci = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  check("first_name", client.first_name, hw.firstName, ci);
  check("last_name", client.last_name, hw.lastName, ci);
  check("email", client.email, hw.email, ci);
  check("phone", client.phone, hw.phone || hw.cell, (a, b) => normalizePhone10(a) !== null && normalizePhone10(a) === normalizePhone10(b));
  return { fills, untouched };
}

function planPropertyFills(existing: JarvisPropertyInput, hw: HwPropertyInput): { fills: FieldFill[]; untouched: FieldDiff[] } {
  const fills: FieldFill[] = [];
  const untouched: FieldDiff[] = [];
  const check = (field: string, jarvis: string | null, incoming: string | null | undefined) => {
    const inc = (incoming ?? "").trim();
    if (!inc) return;
    if (blank(jarvis)) fills.push({ field, value: inc });
    else if ((jarvis as string).trim().toLowerCase() !== inc.toLowerCase()) untouched.push({ field, jarvis: jarvis as string, homeworks: inc });
  };
  // street is intentionally compared in normalized form elsewhere; a differing
  // spelling of an already-matched street is reported, never rewritten.
  if (!blank(existing.street) && normalizeStreet(existing.street) === normalizeStreet(hw.address?.street1)) {
    // same address, possibly different spelling — nothing to report.
  } else {
    check("street", existing.street, hw.address?.street1);
  }
  check("city", existing.city, hw.address?.city);
  check("state", existing.state, hw.address?.state);
  check("zip", existing.zip, hw.address?.zip);
  check("property_name", existing.property_name, hw.name);
  return { fills, untouched };
}

function planProperties(
  hwCustomer: HwCustomerInput,
  client: JarvisClientInput,
  allProperties: JarvisPropertyInput[],
): PropertyPlanRow[] {
  const owned = allProperties.filter((p) => p.client_id === client.id);
  const rows: PropertyPlanRow[] = hwCustomer.properties.map((hp) => {
    const label = [hp.address?.street1, hp.address?.city].filter((x) => !blank(x)).join(", ") || hp.name || "(no address)";
    const base = { hwId: idOf(hp.id), label, fills: [] as FieldFill[], untouched: [] as FieldDiff[] };

    const linkedAnywhere = allProperties.find((p) => !blank(p.homeworks_id) && idOf(p.homeworks_id) === idOf(hp.id));
    if (linkedAnywhere) {
      if (linkedAnywhere.client_id !== client.id) {
        return {
          ...base,
          status: "manual_review",
          reason: "This Homeworks property ID is already saved on a property that belongs to a different Jarvis client.",
          property: { id: linkedAnywhere.id, label: propertyLabel(linkedAnywhere) },
        };
      }
      return {
        ...base,
        status: "already_linked",
        reason: "Already linked by Homeworks property ID.",
        property: { id: linkedAnywhere.id, label: propertyLabel(linkedAnywhere) },
      };
    }

    if (blank(hp.address?.street1)) {
      return { ...base, status: "manual_review", reason: "Homeworks property has no street address to match on." };
    }

    const matches = owned.filter((p) => addressesMatchStrongly({ street1: hp.address?.street1 ?? null, city: hp.address?.city ?? null, zip: hp.address?.zip ?? null }, p));
    if (matches.length === 0) {
      return { ...base, status: "new_property", reason: "No property under the matched client has this street address. Linking never creates properties." };
    }
    if (matches.length > 1) {
      return {
        ...base,
        status: "ambiguous",
        reason: `${matches.length} properties under the matched client share this address.`,
        candidates: matches.map((p) => ({ id: p.id, label: propertyLabel(p) })),
      };
    }
    const match = matches[0];
    if (!blank(match.homeworks_id)) {
      return {
        ...base,
        status: "manual_review",
        reason: `The matching Jarvis property is already linked to a different Homeworks property (${match.homeworks_id}).`,
        property: { id: match.id, label: propertyLabel(match) },
      };
    }
    const { fills, untouched } = planPropertyFills(match, hp);
    return {
      ...base,
      status: "safe_link",
      reason: "Exact normalized street address match under the already-matched client.",
      property: { id: match.id, label: propertyLabel(match) },
      fills,
      untouched,
    };
  });

  // Two Homeworks properties claiming the same Jarvis property is never safe.
  const claims = new Map<string, number>();
  for (const r of rows) if (r.status === "safe_link" && r.property) claims.set(r.property.id, (claims.get(r.property.id) ?? 0) + 1);
  return rows.map((r) =>
    r.status === "safe_link" && r.property && (claims.get(r.property.id) ?? 0) > 1
      ? { ...r, status: "ambiguous" as const, reason: "More than one Homeworks property matches this same Jarvis property.", fills: [], untouched: [] }
      : r,
  );
}

export function planLinks(hwCustomers: HwCustomerInput[], clients: JarvisClientInput[], properties: JarvisPropertyInput[]): LinkPlan {
  const clientByHwId = new Map<string, JarvisClientInput>();
  for (const c of clients) if (!blank(c.homeworks_id)) clientByHwId.set(idOf(c.homeworks_id), c);

  // Demo/seed clients are never a link target.
  const phoneIndex = new Map<string, JarvisClientInput[]>();
  for (const c of clients) {
    if (c.data_source === "demo") continue;
    const p = normalizePhone10(c.phone);
    if (!p) continue;
    phoneIndex.set(p, [...(phoneIndex.get(p) ?? []), c]);
  }

  const diagnostics: IdDiagnosticRow[] = [];
  const diagnose = (hw: HwCustomerInput, client: JarvisClientInput, matchedBy: "id" | "phone") => {
    const stored = blank(client.homeworks_id) ? null : idOf(client.homeworks_id);
    const { classification, explanation } = classifyStoredId(stored ?? "", hw, hwCustomers);
    const digits = normalizePhone10(client.phone) ?? normalizePhone10(hw.phone) ?? normalizePhone10(hw.cell);
    diagnostics.push({
      hwName: hwName(hw),
      phoneLast4: digits ? digits.slice(-4) : null,
      clientId: client.id,
      clientName: clientName(client),
      matchedBy,
      storedId: stored,
      liveId: idOf(hw.id),
      liveIdRawType: hw.rawIdType ?? typeof hw.id,
      customerNumber: blank(hw.number) ? null : idOf(hw.number),
      livePropertyIds: hw.properties.map((p) => idOf(p.id)),
      jarvisProperties: properties.filter((p) => p.client_id === client.id).map((p) => ({ id: p.id, homeworksId: blank(p.homeworks_id) ? null : idOf(p.homeworks_id) })),
      classification,
      explanation,
    });
    return { classification, explanation };
  };

  let rows: CustomerPlanRow[] = hwCustomers.map((hw) => {
    const base = { hwId: idOf(hw.id), hwName: hwName(hw), fills: [] as FieldFill[], untouched: [] as FieldDiff[], dataSourceChange: null, properties: [] as PropertyPlanRow[] };

    const linked = clientByHwId.get(idOf(hw.id));
    if (linked) {
      diagnose(hw, linked, "id");
      return {
        ...base,
        status: "already_linked" as const,
        reason: "Already linked by Homeworks customer ID — treated as an update, not a duplicate.",
        client: { id: linked.id, name: clientName(linked), phone: linked.phone, homeworksId: linked.homeworks_id, dataSource: linked.data_source },
        properties: planProperties(hw, linked, properties),
      };
    }

    const phones = [...new Set([normalizePhone10(hw.phone), normalizePhone10(hw.cell)].filter((p): p is string => p !== null))];
    if (phones.length === 0) {
      return { ...base, status: "manual_review" as const, reason: "Homeworks customer has no valid 10-digit phone number, and names are never used to match." };
    }

    const matched = new Map<string, JarvisClientInput>();
    for (const p of phones) for (const c of phoneIndex.get(p) ?? []) matched.set(c.id, c);

    if (matched.size === 0) {
      return { ...base, status: "new_customer" as const, reason: `No Jarvis client has phone ${phones.join(" / ")}. Linking never creates customers.` };
    }
    if (matched.size > 1) {
      return {
        ...base,
        status: "ambiguous" as const,
        reason: `${matched.size} Jarvis clients share phone ${phones.join(" / ")} — not guessing.`,
        matchedPhone: phones[0],
        candidates: [...matched.values()].map((c) => ({ id: c.id, name: clientName(c) })),
      };
    }

    const client = [...matched.values()][0];
    const clientInfo = { id: client.id, name: clientName(client), phone: client.phone, homeworksId: client.homeworks_id, dataSource: client.data_source };
    const matchedPhone = phones.find((p) => normalizePhone10(client.phone) === p) ?? phones[0];
    const { classification, explanation } = diagnose(hw, client, "phone");
    if (!blank(client.homeworks_id)) {
      // An exact phone match is NOT permission to overwrite a conflicting non-blank ID.
      const storedId = idOf(client.homeworks_id);
      return {
        ...base,
        status: "manual_review" as const,
        reason: `Jarvis stores Homeworks ID "${storedId}"; the live Homeworks customer ID is "${idOf(hw.id)}". ${explanation}`,
        matchedPhone,
        client: clientInfo,
        idConflict: { storedId, liveId: idOf(hw.id), classification, explanation },
      };
    }

    const { fills, untouched } = planClientFills(client, hw);
    const nameAgrees = clientName(client).toLowerCase() === hwName(hw).toLowerCase();
    return {
      ...base,
      status: "safe_link" as const,
      reason: `Exact 10-digit phone match (${matchedPhone}); exactly one Jarvis client has it. Name ${nameAgrees ? "also agrees" : `differs ("${clientName(client)}" vs "${hwName(hw)}") — verify before confirming`}.`,
      matchedPhone,
      client: clientInfo,
      fills,
      untouched,
      dataSourceChange: client.data_source === "unverified" ? { from: "unverified", to: "homeworks_sync" } : null,
    };
  });

  // Two Homeworks customers claiming the same Jarvis client is never safe.
  const claims = new Map<string, number>();
  for (const r of rows) if (r.status === "safe_link" && r.client) claims.set(r.client.id, (claims.get(r.client.id) ?? 0) + 1);
  rows = rows.map((r) =>
    r.status === "safe_link" && r.client && (claims.get(r.client.id) ?? 0) > 1
      ? { ...r, status: "manual_review" as const, reason: "More than one Homeworks customer matches this same Jarvis client.", fills: [], untouched: [], dataSourceChange: null }
      : r,
  );

  // Properties are only compared under a client that is (or is about to be) safely linked.
  const byId = new Map(clients.map((c) => [c.id, c]));
  rows = rows.map((r) => {
    if (r.status !== "safe_link" || !r.client) return r;
    const client = byId.get(r.client.id);
    const hw = hwCustomers.find((h) => idOf(h.id) === r.hwId);
    if (!client || !hw) return r;
    return { ...r, properties: planProperties(hw, client, properties) };
  });

  const props = rows.flatMap((r) => r.properties);
  return {
    customers: rows,
    idDiagnostics: diagnostics,
    counts: {
      safeCustomerLinks: rows.filter((r) => r.status === "safe_link").length,
      safePropertyLinks: props.filter((p) => p.status === "safe_link").length,
      newCustomers: rows.filter((r) => r.status === "new_customer").length,
      newProperties: props.filter((p) => p.status === "new_property").length,
      alreadyLinkedCustomers: rows.filter((r) => r.status === "already_linked").length,
      alreadyLinkedProperties: props.filter((p) => p.status === "already_linked").length,
      manualReview: rows.filter((r) => r.status === "manual_review").length + props.filter((p) => p.status === "manual_review").length,
      ambiguous: rows.filter((r) => r.status === "ambiguous").length + props.filter((p) => p.status === "ambiguous").length,
    },
  };
}

/** The exact column set written to an existing client on a confirmed link. Only blank fields are filled; homeworks_id is set. */
export function clientLinkUpdate(row: CustomerPlanRow): Record<string, string> {
  const update: Record<string, string> = { homeworks_id: idOf(row.hwId) };
  for (const f of row.fills) update[f.field] = f.value;
  if (row.dataSourceChange) update.data_source = row.dataSourceChange.to;
  return update;
}

export function propertyLinkUpdate(row: PropertyPlanRow): Record<string, string> {
  const update: Record<string, string> = { homeworks_id: idOf(row.hwId) };
  for (const f of row.fills) update[f.field] = f.value;
  return update;
}
