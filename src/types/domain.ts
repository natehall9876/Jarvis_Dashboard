/**
 * Convenience aliases over the generated Database type. Import from here
 * (not from database.types.ts) throughout the app so a future schema
 * regeneration only has to keep this file's shape stable.
 */
import type { Database } from "./database.types";

type Tables = Database["public"]["Tables"];

export type Client = Tables["clients"]["Row"];
export type ClientInsert = Tables["clients"]["Insert"];
export type ClientUpdate = Tables["clients"]["Update"];

export type Property = Tables["properties"]["Row"];
export type PropertyInsert = Tables["properties"]["Insert"];

export type Service = Tables["services"]["Row"];

export type Employee = Tables["employees"]["Row"];
export type EmployeeInsert = Tables["employees"]["Insert"];

export type Route = Tables["routes"]["Row"];
export type RouteInsert = Tables["routes"]["Insert"];

export type ServiceAgreement = Tables["service_agreements"]["Row"];

export type RouteStop = Tables["route_stops"]["Row"];
export type RouteStopUpdate = Tables["route_stops"]["Update"];

export type Job = Tables["jobs"]["Row"];
export type JobInsert = Tables["jobs"]["Insert"];
export type JobUpdate = Tables["jobs"]["Update"];

export type JobEmployee = Tables["job_employees"]["Row"];
export type TimeEntry = Tables["time_entries"]["Row"];

export type Equipment = Tables["equipment"]["Row"];
export type EquipmentInsert = Tables["equipment"]["Insert"];

export type JobEquipment = Tables["job_equipment"]["Row"];
export type EquipmentMaintenance = Tables["equipment_maintenance"]["Row"];

export type Quote = Tables["quotes"]["Row"];
export type QuoteInsert = Tables["quotes"]["Insert"];
export type QuoteItem = Tables["quote_items"]["Row"];

export type Invoice = Tables["invoices"]["Row"];
export type InvoiceInsert = Tables["invoices"]["Insert"];
export type InvoiceItem = Tables["invoice_items"]["Row"];

export type Payment = Tables["payments"]["Row"];
export type PaymentInsert = Tables["payments"]["Insert"];

export type Expense = Tables["expenses"]["Row"];
export type ExpenseInsert = Tables["expenses"]["Insert"];

export type JobMaterial = Tables["job_materials"]["Row"];
export type JobPhoto = Tables["job_photos"]["Row"];

export type IntegrationMapping = Tables["integration_mappings"]["Row"];

export type {
  ClientStatus,
  ContactMethod,
  EmployeeRole,
  DayOfWeek,
  AgreementFrequency,
  JobStatus,
  EquipmentStatus,
  QuoteStatus,
  InvoiceStatus,
  PaymentMethod,
  PhotoType,
  IntegrationName,
  IntegrationEntityType,
} from "./database.types";

// ---------------------------------------------------------------------------
// Composite / joined shapes used by the data-access layer.
// These are hand-built view models, not raw table rows.
// ---------------------------------------------------------------------------

export type ClientWithBalance = Client & {
  properties_count: number;
  outstanding_balance: number;
};

export type PropertyWithClient = Property & {
  client: Pick<Client, "id" | "name" | "company_name"> | null;
};

export type JobWithRelations = Job & {
  client: Pick<Client, "id" | "name" | "company_name"> | null;
  property: Pick<Property, "id" | "address_line1" | "city" | "state"> | null;
  service: Pick<Service, "id" | "name"> | null;
  crew_lead: Pick<Employee, "id" | "first_name" | "last_name"> | null;
};

export type RouteWithStops = Route & {
  stops: (RouteStop & {
    property: PropertyWithClient | null;
  })[];
};

export type QuoteWithItems = Quote & {
  client: Pick<Client, "id" | "name" | "company_name"> | null;
  items: QuoteItem[];
};

export type InvoiceWithClient = Invoice & {
  client: Pick<Client, "id" | "name" | "company_name"> | null;
  property: Pick<Property, "id" | "address_line1"> | null;
  amount_paid: number;
  balance: number;
  days_overdue: number;
};

export type EmployeeWithStats = Employee & {
  hours_this_week: number;
  labor_cost_this_week: number;
  jobs_worked_this_week: number;
};

/** Generic result wrapper returned by every data-access function. */
export type DataResult<T> =
  | { data: T; error: null }
  | { data: null; error: string };
