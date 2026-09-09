import { Button } from "@/components/ui/button";
import { Field, TextInput, Select, Textarea, FormError } from "@/components/ui/form-fields";
import type { Quote } from "@/types/domain";

export function QuoteForm({
  action,
  quote,
  clients,
  properties,
  error,
}: {
  action: (formData: FormData) => void;
  quote?: Quote;
  clients: { id: string; label: string }[];
  properties: { id: string; label: string; clientId: string | null }[];
  error?: string;
}) {
  return (
    <form action={action} className="space-y-4">
      <FormError message={error} />

      {!quote ? (
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

      <Field label="Property" htmlFor="property_id" hint="Optional — leave blank for a general quote.">
        <Select id="property_id" name="property_id" defaultValue={quote?.property_id ?? ""}>
          <option value="">None</option>
          {properties.map((p) => (
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
