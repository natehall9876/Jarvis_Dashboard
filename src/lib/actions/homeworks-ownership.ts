import { isHomeworksOwned } from "@/lib/homeworks-ownership";
import type { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type Table = "clients" | "properties" | "jobs" | "invoices" | "quotes" | "employees";
type Row<T extends Table> = Database["public"]["Tables"][T]["Row"];

export const HOMEWORKS_MANAGED_MESSAGE = "This record is managed in Homeworks. Update it there so the change persists.";

/** RLS-scoped ownership reads fail closed; this module exposes no Server Action. */
export async function getOwnershipRecord<T extends Table>(db: Client, table: T, id: string): Promise<Row<T>> {
  if (!id) throw new Error("A record ID is required to verify ownership.");
  const { data, error } = await db.from(table as Table).select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Record not found; nothing was saved.");
  return data as unknown as Row<T>;
}

export async function isRecordHomeworksOwned(db: Client, table: Table, record: object): Promise<boolean> {
  if (isHomeworksOwned(record)) return true;
  const row = record as Record<string, unknown>;
  if (table === "properties" || table === "invoices" || table === "quotes") {
    if (typeof row.client_id !== "string" || !row.client_id) throw new Error("Cannot verify the record's client ownership.");
    if (isHomeworksOwned(await getOwnershipRecord(db, "clients", row.client_id))) return true;
  }
  if (table === "jobs" || ((table === "invoices" || table === "quotes") && row.property_id != null)) {
    if (typeof row.property_id !== "string" || !row.property_id) throw new Error("Cannot verify the record's property ownership.");
    return isRecordHomeworksOwned(db, "properties", await getOwnershipRecord(db, "properties", row.property_id));
  }
  return false;
}

export async function requireLocalRecord<T extends Table>(db: Client, table: T, id: string): Promise<Row<T>> {
  const record = await getOwnershipRecord(db, table, id);
  if (await isRecordHomeworksOwned(db, table, record)) throw new Error(HOMEWORKS_MANAGED_MESSAGE);
  return record;
}

export async function requireLocalFinancialParents(db: Client, clientId: string, propertyId: string | null): Promise<void> {
  await requireLocalRecord(db, "clients", clientId);
  if (propertyId) {
    const property = await requireLocalRecord(db, "properties", propertyId);
    if (property.client_id !== clientId) throw new Error("The property does not belong to this client.");
  }
}

/** Source identity/projection fields cannot be supplied to a local creation form. */
export function rejectOwnershipFields(input: FormData | object): void {
  const keys = input instanceof FormData ? Array.from(input.keys()) : Object.keys(input);
  if (keys.some(key => key.startsWith("homeworks_") || key === "data_source")) throw new Error(HOMEWORKS_MANAGED_MESSAGE);
}

export function submittedFields<T extends object>(form: FormData, fields: T): Partial<T> {
  return Object.fromEntries(Object.entries(fields).filter(([key]) => form.has(key))) as Partial<T>;
}

export function requireNativeChanges(current: object, fields: object, allowed: readonly string[]): void {
  const before = current as Record<string, unknown>;
  for (const [key, value] of Object.entries(fields)) {
    if (!allowed.includes(key) && value !== before[key]) throw new Error(`${key.replaceAll("_", " ")} is managed in Homeworks. Update it there.`);
  }
}
