import { HomeworksManagedNotice } from "@/components/homeworks-managed-notice";
import { isHomeworksOwned, isHomeworksOptionOwned, type OwnershipOption, type HomeworksOwnershipRecord } from "@/lib/homeworks-ownership";
import { Button } from "@/components/ui/button";
import { Field, TextInput, Select, Textarea, FormError } from "@/components/ui/form-fields";
import type { Quote } from "@/types/domain";

export function QuoteForm({
  action,
  quote,
  clients,
  properties,
  managedRecord,
  error,
}: {
  action: (formData: FormData) => void;
  quote?: Quote;
  clients: OwnershipOption[];
  properties: (OwnershipOption & { clientId: string | null })[];
  managedRecord?: HomeworksOwnershipRecord | null;
  error?: string;
}) {
  const sourceRecord = isHomeworksOwned(quote) ? quote : managedRecord;
  if (quote && isHomeworksOwned(sourceRecord)) return (
    <form action={action} className="space-y-4">
      <FormError message={error} />
      <HomeworksManagedNotice record={sourceRecord}>Financial details are managed in Homeworks. These notes stay in Jarvis.</HomeworksManagedNotice>
      <Field label="Jarvis Notes" htmlFor="notes">
        <Textarea id="notes" name="notes" rows={3} defaultValue={quote.notes ?? ""} />
      </Field>
      <Button type="submit">Save Jarvis Notes</Button>
    </form>
  );
  const localClients = clients.filter((client) => !isHomeworksOwned(client));
  const localProperties = properties.filter((property) => !isHomeworksOptionOwned(property));
  if (!quote && localClients.length === 0) {
    return <HomeworksManagedNotice record={quote}>Create and manage Homeworks quotes in Homeworks.</HomeworksManagedNotice>;
  }
  return (
    <form action={action} className="space-y-4">
      <FormError message={error} />
      {localClients.length < clients.length || localProperties.length < properties.length ? <HomeworksManagedNotice>Create and manage records for Homeworks customers and properties in Homeworks.</HomeworksManagedNotice> : null}

      {!quote ? (
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

      <Field label="Property" htmlFor="property_id" hint="Optional — leave blank for a general quote.">
        <Select id="property_id" name="property_id" defaultValue={quote?.property_id ?? ""}>
          <option value="">None</option>
          {localProperties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Valid Until" htmlFor="valid_until">
        <TextInput id="valid_until" name="valid_until" type="date" defaultValue={quote?.valid_until ?? ""} />
      </Field>

      <Field label="Notes" htmlFor="notes">
        <Textarea id="notes" name="notes" rows={3} defaultValue={quote?.notes ?? ""} />
      </Field>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit">{quote ? "Save Changes" : "Create Quote"}</Button>
      </div>
    </form>
  );
}
