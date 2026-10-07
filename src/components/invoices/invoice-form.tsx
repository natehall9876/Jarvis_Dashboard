import { HomeworksManagedNotice } from "@/components/homeworks-managed-notice";
import { isHomeworksOwned, isHomeworksOptionOwned, type OwnershipOption, type HomeworksOwnershipRecord } from "@/lib/homeworks-ownership";
import { Button } from "@/components/ui/button";
import { Field, TextInput, Select, Textarea, FormError } from "@/components/ui/form-fields";
import type { Invoice } from "@/types/domain";

export function InvoiceForm({
  action,
  invoice,
  clients,
  properties,
  managedRecord,
  error,
}: {
  action: (formData: FormData) => void;
  invoice?: Invoice;
  clients: OwnershipOption[];
  properties: OwnershipOption[];
  managedRecord?: HomeworksOwnershipRecord | null;
  error?: string;
}) {
  const sourceRecord = isHomeworksOwned(invoice) ? invoice : managedRecord;
  if (invoice && isHomeworksOwned(sourceRecord)) return (
    <form action={action} className="space-y-4">
      <FormError message={error} />
      <HomeworksManagedNotice record={sourceRecord}>Financial details are managed in Homeworks. These notes stay in Jarvis.</HomeworksManagedNotice>
      <Field label="Jarvis Notes" htmlFor="notes">
        <Textarea id="notes" name="notes" rows={3} defaultValue={invoice.notes ?? ""} />
      </Field>
      <Button type="submit">Save Jarvis Notes</Button>
    </form>
  );
  const localClients = clients.filter((client) => !isHomeworksOwned(client));
  const localProperties = properties.filter((property) => !isHomeworksOptionOwned(property));
  if (!invoice && localClients.length === 0) {
    return <HomeworksManagedNotice record={invoice}>Create and manage Homeworks invoices in Homeworks.</HomeworksManagedNotice>;
  }
  return (
    <form action={action} className="space-y-4">
      <FormError message={error} />
      {localClients.length < clients.length || localProperties.length < properties.length ? <HomeworksManagedNotice>Create and manage records for Homeworks customers and properties in Homeworks.</HomeworksManagedNotice> : null}

      {!invoice ? (
        <Field label="Client" htmlFor="client_id" required>
          <Select id="client_id" name="client_id" required defaultValue="">
            <option value="" disabled>
              Select a client...
            </option>
            {localClients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      <Field label="Property" htmlFor="property_id" hint="Optional.">
        <Select id="property_id" name="property_id" defaultValue={invoice?.property_id ?? ""}>
          <option value="">None</option>
          {localProperties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Due Date" htmlFor="due_date">
        <TextInput id="due_date" name="due_date" type="date" defaultValue={invoice?.due_date ?? ""} />
      </Field>

      <Field label="Notes" htmlFor="notes">
        <Textarea id="notes" name="notes" rows={3} defaultValue={invoice?.notes ?? ""} />
      </Field>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit">{invoice ? "Save Changes" : "Create Invoice"}</Button>
      </div>
    </form>
  );
}
