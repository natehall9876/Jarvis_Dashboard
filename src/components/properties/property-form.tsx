import { Button } from "@/components/ui/button";
import { Field, TextInput, Select, Textarea, FormError } from "@/components/ui/form-fields";
import type { Property } from "@/types/domain";

export function PropertyForm({
  action,
  property,
  clients,
  defaultClientId,
  error,
}: {
  action: (formData: FormData) => void;
  property?: Property;
  clients: { id: string; label: string }[];
  defaultClientId?: string;
  error?: string;
}) {
  return (
    <form action={action} className="space-y-4">
      <FormError message={error} />

      <Field label="Client" htmlFor="client_id" required>
        <Select id="client_id" name="client_id" defaultValue={property?.client_id ?? defaultClientId ?? ""} required>
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

      <Field label="Property Nickname" htmlFor="property_name" hint="Optional — e.g. 'Common Area A' for HOA properties.">
        <TextInput id="property_name" name="property_name" defaultValue={property?.property_name ?? ""} />
      </Field>

      <Field label="Street Address" htmlFor="street" required>
        <TextInput id="street" name="street" defaultValue={property?.street ?? ""} placeholder="123 Maple St" required />
      </Field>

      <div className="grid grid-cols-3 gap-3">
        <Field label="City" htmlFor="city" className="col-span-1">
          <TextInput id="city" name="city" defaultValue={property?.city ?? ""} />
        </Field>
        <Field label="State" htmlFor="state">
          <TextInput id="state" name="state" defaultValue={property?.state ?? ""} maxLength={2} placeholder="NC" />
        </Field>
        <Field label="Zip" htmlFor="zip">
          <TextInput id="zip" name="zip" defaultValue={property?.zip ?? ""} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Latitude" htmlFor="latitude" hint="For weather & routing.">
          <TextInput id="latitude" name="latitude" type="number" step="any" defaultValue={property?.latitude ?? ""} />
        </Field>
        <Field label="Longitude" htmlFor="longitude">
          <TextInput id="longitude" name="longitude" type="number" step="any" defaultValue={property?.longitude ?? ""} />
        </Field>
      </div>

      <Field label="Access Notes" htmlFor="access_notes" hint="Gate codes, dogs, parking — anything the crew needs on-site.">
        <Textarea id="access_notes" name="access_notes" rows={2} defaultValue={property?.access_notes ?? ""} />
      </Field>

      <Field label="Service Notes" htmlFor="service_notes">
        <Textarea id="service_notes" name="service_notes" rows={2} defaultValue={property?.service_notes ?? ""} />
      </Field>

      <label className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
        <input type="checkbox" name="active" defaultChecked={property?.active ?? true} className="h-4 w-4 rounded border-[var(--color-border-strong)] bg-[var(--color-surface-2)] accent-[var(--color-accent)]" />
        Active
      </label>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit">{property ? "Save Changes" : "Add Property"}</Button>
      </div>
    </form>
  );
}
