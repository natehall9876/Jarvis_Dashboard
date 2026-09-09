import { Button } from "@/components/ui/button";
import { Field, TextInput, Select, Textarea, FormError } from "@/components/ui/form-fields";
import type { Invoice } from "@/types/domain";

export function InvoiceForm({
  action,
  invoice,
  clients,
  properties,
  error,
}: {
  action: (formData: FormData) => void;
  invoice?: Invoice;
  clients: { id: string; label: string }[];
  properties: { id: string; label: string }[];
  error?: string;
}) {
  return (
    <form action={action} className="space-y-4">
      <FormError message={error} />

      {!invoice ? (
        <Field label="Client" htmlFor="client_id" required>
          <Select id="client_id" name="client_id" required defaultValue="">
            <option value="" disabled>
              Select a client...
            </option>
            {clients.map((c) => (
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
          {properties.map((p) => (
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
