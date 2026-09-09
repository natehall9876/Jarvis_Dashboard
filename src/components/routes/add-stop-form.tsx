import { Button } from "@/components/ui/button";
import { Field, TextInput, Select, FormError } from "@/components/ui/form-fields";

export function AddStopForm({
  action,
  properties,
  error,
}: {
  action: (formData: FormData) => void;
  properties: { id: string; label: string }[];
  error?: string;
}) {
  return (
    <form action={action} className="space-y-4">
      <FormError message={error} />

      <Field label="Property" htmlFor="property_id" required>
        <Select id="property_id" name="property_id" required defaultValue="">
          <option value="" disabled>
            Select a property...
          </option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Estimated Minutes" htmlFor="estimated_minutes" hint="How long this stop typically takes.">
        <TextInput id="estimated_minutes" name="estimated_minutes" type="number" min="0" placeholder="45" />
      </Field>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit">Add Stop</Button>
      </div>
    </form>
  );
}
