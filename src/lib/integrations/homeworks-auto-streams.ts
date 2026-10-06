import type { Stream } from "./homeworks-auto-core";
// Verified against the live Homeworks GraphQL schema, 2026-10-06.
// Each deletion/archive partition is explicit: provider defaults hide these rows.
const address = "address { street1 street2 city state zip }";
const definitions = {
  customers: { filterType: "CustomerFilter", incremental: true, fields: `id number firstName lastName fullName email phone cell status description isDeleted createdAt updatedAt ${address}` },
  properties: { filterType: "PropertyFilter", incremental: false, fields: `id customerId name notes isActive deletedStatus updatedAt ${address}` },
  items: { filterType: "ItemFilter", incremental: false, fields: "id name description price budgetedHours type unit isDeleted" },
  users: { filterType: "UserFilter", incremental: false, fields: "id firstName lastName email phone cell role status isDeleted" },
  events: { filterType: "EventFilter", incremental: true, fields: "id propertyId customerId title description status type startDate endDate hasTime startTime total budgetedHours closedAt isDeleted createdAt updatedAt recurringEventId crewId crew { id name } users(take:1000) { id firstName lastName } dispatchNotes { message author date } lineItems(take:1000) { id itemId name description price quantity total budgetedHours }" },
  estimates: { filterType: "EstimateFilter", incremental: true, fields: "id customerId number date title status notes internalNotes subtotal tax total paidAmount isArchived isDeleted createdAt updatedAt acceptedAt lineItems { id itemId propertyId name description quantity price subtotal subtotalWithTax budgetedHours sortOrder isRecommended }" },
  invoices: { filterType: "InvoiceFilter", incremental: true, fields: "id customerId propertyId number date dueDate title status notes internalNotes subtotal tax total paidAmount isArchived deletedState createdAt updatedAt sentAt lineItems(take:1000) { id itemId propertyId eventId name description quantity price subtotal subtotalWithTax }" },
  payments: { filterType: "PaymentFilter", incremental: true, fields: "id customerId invoiceId date totalAmount invoiceAmount creditAmount paidAmount methodDisplayName notes isRefund refundedAt createdAt updatedAt" },
} as const;
function stream(entity: keyof typeof definitions, suffix: string, where: Record<string, unknown>): Stream { return { key: `${entity}_${suffix}`, entity, where, ...definitions[entity] }; }
export const HOMEWORKS_STREAMS: Stream[] = [
  ...[false, true].map(isDeleted => stream("customers", String(isDeleted), { isDeleted })),
  stream("properties", "all", {}),
  ...[false, true].map(isDeleted => stream("items", String(isDeleted), { isDeleted })),
  ...[false, true].map(isDeleted => stream("users", String(isDeleted), { isDeleted })),
  ...[false, true].map(isDeleted => stream("events", String(isDeleted), { isDeleted })),
  ...[false, true].flatMap(isDeleted => [false, true].map(isArchived => stream("estimates", `${isDeleted}_${isArchived}`, { isDeleted, isArchived }))),
  ...["ACTIVE", "DELETED", "CASCADE_DELETED"].flatMap(deleted => [false, true].map(isArchived => stream("invoices", `${deleted}_${isArchived}`, { deletedState: { equals: deleted }, isArchived }))),
  ...[false, true].map(isDeleted => stream("payments", String(isDeleted), { isDeleted })),
];
