import { getClientById } from "@/lib/data/clients";
import { getJobById } from "@/lib/data/jobs";
import { getInvoiceById } from "@/lib/data/invoices";
import { getQuoteById } from "@/lib/data/quotes";
import { getEquipmentById } from "@/lib/data/equipment";
import { formatCurrency, clientDisplayName, propertyAddress } from "@/lib/format";
import type { EntityReference } from "@/lib/ai/tool-types";

export type PageContext = {
  /** Short prose summary prepended to the conversation, grounding "this client" / "this job" style questions. */
  summary: string;
  /** The exact record being viewed, if any — lets the model call a *_details tool directly instead of searching. */
  entity: EntityReference | null;
};

/**
 * Gives the advisor a short, real summary of whatever record the owner is
 * currently looking at, so "summarize this customer" or "how profitable was
 * this job?" resolve against the actual record instead of nothing. Returns
 * null for routes with no specific record (list pages, Command Center,
 * etc.) — the advisor still works there, just without page-specific context.
 */
export async function getPageContext(pathname: string): Promise<PageContext | null> {
  const match = (prefix: string) => {
    const m = pathname.match(new RegExp(`^/${prefix}/([^/?]+)`));
    return m ? m[1] : null;
  };

  const clientId = match("clients");
  if (clientId) {
    const { data } = await getClientById(clientId);
    if (!data) return null;
    const { client, outstanding_balance, jobs, quotes, invoices } = data;
    return {
      summary: `The owner is currently viewing CLIENT "${clientDisplayName(client)}" (id: ${clientId}, status: ${client.status ?? "active"}). Outstanding balance: ${formatCurrency(outstanding_balance)}. ${jobs.length} jobs, ${quotes.length} quotes, ${invoices.length} invoices on file. Notes: ${client.notes ?? "none"}.`,
      entity: { type: "client", id: clientId, label: clientDisplayName(client) },
    };
  }

  const jobId = match("jobs");
  if (jobId) {
    const { data: job } = await getJobById(jobId);
    if (!job) return null;
    const rate = job.actual_hours && job.actual_hours > 0 && job.price ? job.price / job.actual_hours : null;
    return {
      summary: `The owner is currently viewing JOB "${job.service?.name ?? "Job"}" (id: ${jobId}) for ${clientDisplayName(job.property?.client)} at ${propertyAddress(job.property)}. Status: ${job.status}. Price: ${formatCurrency(job.price)}. Budgeted hours: ${job.budgeted_hours ?? "unset"}. Actual hours: ${job.actual_hours ?? "unset"}. Production rate: ${rate !== null ? formatCurrency(rate, true) + "/hr" : "unavailable (no actual hours logged yet)"}.`,
      entity: { type: "job", id: jobId, label: job.service?.name ?? "Job" },
    };
  }

  const invoiceId = match("invoices");
  if (invoiceId) {
    const { data: invoice } = await getInvoiceById(invoiceId);
    if (!invoice) return null;
    return {
      summary: `The owner is currently viewing INVOICE #${invoice.invoice_number} (id: ${invoiceId}) for ${clientDisplayName(invoice.client)}. Status: ${invoice.display_status}. Total: ${formatCurrency(invoice.total)}. Paid: ${formatCurrency(invoice.amount_paid)}. Balance: ${formatCurrency(invoice.balance)}. Days overdue: ${invoice.days_overdue}.`,
      entity: { type: "invoice", id: invoiceId, label: `#${invoice.invoice_number}` },
    };
  }

  const quoteId = match("quotes");
  if (quoteId) {
    const { data: quote } = await getQuoteById(quoteId);
    if (!quote) return null;
    return {
      summary: `The owner is currently viewing QUOTE ${quote.quote_number} (id: ${quoteId}) for ${clientDisplayName(quote.client)}. Status: ${quote.status}. Total: ${formatCurrency(quote.total)}. Sent: ${quote.sent_at ?? "not sent"}. ${quote.items.length} line items.`,
      entity: { type: "quote", id: quoteId, label: quote.quote_number ?? "Quote" },
    };
  }

  const equipmentId = match("equipment");
  if (equipmentId) {
    const { data: equipment } = await getEquipmentById(equipmentId);
    if (!equipment) return null;
    return {
      summary: `The owner is currently viewing EQUIPMENT "${equipment.name}" (id: ${equipmentId}). Status: ${equipment.status ?? "active"}. Current hours: ${equipment.current_hours ?? "unknown"}. Maintenance due date: ${equipment.maintenance_due_date ?? "not set"}. Maintenance due hours: ${equipment.maintenance_due_hours ?? "not set"}. ${equipment.maintenance_warning ? "This equipment is flagged as needing maintenance soon." : ""}`,
      entity: { type: "equipment", id: equipmentId, label: equipment.name },
    };
  }

  if (pathname.startsWith("/reports")) {
    return { summary: "The owner is currently viewing the Reports page (trailing 90-day performance).", entity: null };
  }

  return null;
}
