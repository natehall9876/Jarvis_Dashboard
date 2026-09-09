import { Button } from "@/components/ui/button";
import { Field, TextInput, Select, Textarea, FormError } from "@/components/ui/form-fields";
import type { Equipment } from "@/types/domain";

export function EquipmentForm({
  action,
  equipment,
  error,
}: {
  action: (formData: FormData) => void;
  equipment?: Equipment;
  error?: string;
}) {
  return (
    <form action={action} className="space-y-4">
      <FormError message={error} />

      <Field label="Name" htmlFor="name" required>
        <TextInput id="name" name="name" defaultValue={equipment?.name ?? ""} placeholder="Zero-Turn Mower #3" required />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Category" htmlFor="category">
          <TextInput id="category" name="category" defaultValue={equipment?.category ?? ""} placeholder="mower" />
        </Field>
        <Field label="Status" htmlFor="status">
          <Select id="status" name="status" defaultValue={equipment?.status ?? "active"}>
            <option value="active">Active</option>
            <option value="maintenance">In Maintenance</option>
            <option value="out_of_service">Out of Service</option>
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Manufacturer" htmlFor="manufacturer">
          <TextInput id="manufacturer" name="manufacturer" defaultValue={equipment?.manufacturer ?? ""} />
        </Field>
        <Field label="Model" htmlFor="model">
          <TextInput id="model" name="model" defaultValue={equipment?.model ?? ""} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Serial Number" htmlFor="serial_number">
          <TextInput id="serial_number" name="serial_number" defaultValue={equipment?.serial_number ?? ""} />
        </Field>
        <Field label="Current Hours" htmlFor="current_hours">
          <TextInput id="current_hours" name="current_hours" type="number" step="0.1" defaultValue={equipment?.current_hours ?? ""} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Purchase Date" htmlFor="purchase_date">
          <TextInput id="purchase_date" name="purchase_date" type="date" defaultValue={equipment?.purchase_date ?? ""} />
        </Field>
        <Field label="Purchase Price" htmlFor="purchase_price">
          <TextInput id="purchase_price" name="purchase_price" type="number" step="0.01" defaultValue={equipment?.purchase_price ?? ""} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Maintenance Due Date" htmlFor="maintenance_due_date">
          <TextInput id="maintenance_due_date" name="maintenance_due_date" type="date" defaultValue={equipment?.maintenance_due_date ?? ""} />
        </Field>
        <Field label="Maintenance Due (Hours)" htmlFor="maintenance_due_hours">
          <TextInput id="maintenance_due_hours" name="maintenance_due_hours" type="number" step="0.1" defaultValue={equipment?.maintenance_due_hours ?? ""} />
        </Field>
      </div>

      <Field label="Notes" htmlFor="notes">
        <Textarea id="notes" name="notes" rows={2} defaultValue={equipment?.notes ?? ""} />
      </Field>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit">{equipment ? "Save Changes" : "Add Equipment"}</Button>
      </div>
    </form>
  );
}
