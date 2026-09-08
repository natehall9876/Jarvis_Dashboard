/** Formatting helpers shared across the dashboard. */

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const currencyFormatterPrecise = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

export function formatCurrency(value: number | null | undefined, precise = false): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return (precise ? currencyFormatterPrecise : currencyFormatter).format(value);
}

export function formatNumber(value: number | null | undefined, fractionDigits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function formatPercent(value: number | null | undefined, fractionDigits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${formatNumber(value, fractionDigits)}%`;
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const shortDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return dateFormatter.format(date);
}

export function formatShortDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return shortDateFormatter.format(date);
}

export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return timeFormatter.format(date);
}

export function formatHours(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${formatNumber(value, 1)} hr`;
}

/** Days between a due date and now — positive means overdue. */
export function daysOverdue(dueDate: string | null | undefined): number {
  if (!dueDate) return 0;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return 0;
  const now = new Date();
  const diffMs = now.setHours(0, 0, 0, 0) - due.setHours(0, 0, 0, 0);
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

/** Formats a Postgres `time` column (e.g. "08:00:00") without going through Date parsing. */
export function formatTimeString(value: string | null | undefined): string {
  if (!value) return "—";
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return value;
  const hour24 = Number(match[1]);
  const minute = match[2];
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${minute} ${period}`;
}

/** clients.first_name/last_name -> "First Last", or null if both are blank. */
export function clientPersonName(client: { first_name?: string | null; last_name?: string | null } | null | undefined): string | null {
  if (!client) return null;
  const name = [client.first_name, client.last_name].filter(Boolean).join(" ");
  return name || null;
}

/** clients.first_name/last_name/company_name -> a single display name, never blank. */
export function clientDisplayName(client: {
  first_name?: string | null;
  last_name?: string | null;
  company_name?: string | null;
} | null | undefined): string {
  if (!client) return "Unknown client";
  if (client.company_name) return client.company_name;
  const name = [client.first_name, client.last_name].filter(Boolean).join(" ");
  return name || "Unnamed client";
}

/** properties.street/city/state/zip -> a single-line address. */
export function propertyAddress(property: {
  property_name?: string | null;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
} | null | undefined): string {
  if (!property) return "Unknown property";
  const line = [property.street, [property.city, property.state].filter(Boolean).join(", "), property.zip]
    .filter(Boolean)
    .join(", ");
  return line || property.property_name || "Unknown property";
}
