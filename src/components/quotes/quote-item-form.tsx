import { Button } from "@/components/ui/button";
import { Field, TextInput, Select, FormError } from "@/components/ui/form-fields";

export function QuoteItemForm({
  action,
  services,
  error,
}: {
  action: (formData: FormData) => void;
  services: { id: string; name: string; default_price: number | null; default_budgeted_hours: number | null }[];
  error?: string;
}) {
  return (
    <form action={action} className="space-y-4">
      <FormError message={error} />

      <Field label="Service" htmlFor="service_id" hint="Optional — used for revenue-by-service reporting.">
        <Select id="service_id" name="service_id" defaultValue="">
          <option value="">None</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Description" htmlFor="description" required>
        <TextInput id="description" name="description" required placeholder="Weekly mowing" />
      </Field>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Quantity" htmlFor="quantity" required>
          <TextInput id="quantity" name="quantity" type="number" step="1" min="1" defaultValue={1} required />
        </Field>
        <Field label="Unit Price" htmlFor="unit_price" required>
          <TextInput id="unit_price" name="unit_price" type="number" step="0.01" min="0" required />
        </Field>
        <Field label="Budgeted Hours" htmlFor="budgeted_hours">
          <TextInput id="budgeted_hours" name="budgeted_hours" type="number" step="0.1" min="0" />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
        <input type="checkbox" name="is_optional" className="h-4 w-4 rounded border-[var(--color-border-strong)] bg-[var(--color-surface-2)] accent-[var(--color-accent)]" />
        Optional add-on (not included in the total shown to the client by default)
      </label>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit">Add Line Item</Button>
      </div>
    </form>
  );
}
