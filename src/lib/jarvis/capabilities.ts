/**
 * The honest capability map behind the agent network. Every entry states what
 * is actually connected TODAY and what evidence supports that. A node is only
 * "connected" if data flows AND a Jarvis tool can read it; anything else is
 * partial, awaiting credentials, or planned — never presented as operational.
 */
export type CapabilityStatus = "connected" | "partial" | "awaiting_credentials" | "planned";

export type Capability = {
  id: string;
  label: string;
  href: string | null;
  status: CapabilityStatus;
  /** What is real right now, in one sentence. */
  detail: string;
};

export const CAPABILITIES: Capability[] = [
  { id: "schedule", label: "Schedule", href: "/schedule", status: "connected", detail: "Homeworks jobs sync by event ID; Monday 9/21 reconciled 10 of 10. Jarvis reads the schedule by voice." },
  { id: "customers", label: "Customers", href: "/clients", status: "connected", detail: "25 Homeworks customers linked by ID. Jarvis can search and summarize clients." },
  { id: "properties", label: "Properties", href: "/properties", status: "connected", detail: "Properties linked to Homeworks property IDs. Jarvis can search and inspect them." },
  { id: "jobs", label: "Jobs", href: "/jobs", status: "connected", detail: "Jobs sync from Homeworks; Jarvis can read jobs and propose confirmed changes." },
  { id: "routes", label: "Routes", href: "/routes", status: "partial", detail: "Route records and stop order exist and Jarvis can read them. No travel-time or optimization provider is connected." },
  { id: "estimates", label: "Estimates", href: "/quotes", status: "partial", detail: "Quotes are tracked in Jarvis and readable by Jarvis; they are not synced from Homeworks estimates." },
  { id: "finances", label: "Finances", href: "/invoices", status: "partial", detail: "Jarvis invoices and expenses are readable. QuickBooks is not connected and Homeworks invoices are not synced." },
  { id: "employees", label: "Employees", href: "/employees", status: "partial", detail: "Employee records and job assignment exist. Homeworks crew assignments are not mapped." },
  { id: "equipment", label: "Equipment", href: "/equipment", status: "connected", detail: "Equipment and maintenance records exist and Jarvis can read them." },
  { id: "weather", label: "Weather", href: "/", status: "connected", detail: "Live National Weather Service forecast on the Command Center." },
  { id: "marketing", label: "Marketing", href: null, status: "planned", detail: "No marketing or lead data source exists yet." },
  { id: "tasks", label: "Tasks", href: null, status: "planned", detail: "No task or reminder store exists yet, so Jarvis cannot save reminders." },
];

export const STATUS_LABEL: Record<CapabilityStatus, string> = {
  connected: "Connected",
  partial: "Partial",
  awaiting_credentials: "Needs credentials",
  planned: "Planned",
};

export function capabilityById(id: string): Capability | undefined {
  return CAPABILITIES.find((c) => c.id === id);
}
