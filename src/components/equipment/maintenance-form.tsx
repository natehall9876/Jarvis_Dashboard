import { Button } from "@/components/ui/button";
import { Field, TextInput, Textarea, FormError } from "@/components/ui/form-fields";

export function MaintenanceForm({
  action,
  currentHours,
  error,
}: {
  action: (formData: FormData) => void;
  currentHours: number | null;
  error?: string;
}) {
  return (
    <form action={action} className="space-y-4">
      <FormError message={error} />

      <div className="grid grid-cols-2 gap-3">
        <Field label="Service Date" htmlFor="maintenance_date" required>
          <TextInput id="maintenance_date" name="maintenance_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
        </Field>
        <Field label="Hours at Service" htmlFor="equipment_hours">
          <TextInput id="equipment_hours" name="equipment_hours" type="number" step="0.1" defaultValue={currentHours ?? ""} />
        </Field>
      </div>

      <Field label="Service Type" htmlFor="maintenance_type" required>
        <TextInput id="maintenance_type" name="maintenance_type" placeholder="Oil change, blade sharpening, belt repair..." required />
      </Field>

      <Field label="Description" htmlFor="description">
        <Textarea id="description" name="description" rows={2} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Parts Cost" htmlFor="parts_cost">
          <TextInput id="parts_cost" name="parts_cost" type="number" step="0.01" defaultValue={0} />
        </Field>
        <Field label="Labor Cost" htmlFor="labor_cost">
          <TextInput id="labor_cost" name="labor_cost" type="number" step="0.01" defaultValue={0} />
        </Field>
      </div>

      <Field label="Vendor" htmlFor="vendor">
        <TextInput id="vendor" name="vendor" placeholder="Shop Internal" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Next Service Date" htmlFor="next_service_date" hint="Optional — updates the equipment's due date.">
          <TextInput id="next_service_date" name="next_service_date" type="date" />
        </Field>
        <Field label="Next Service (Hours)" htmlFor="next_service_hours">
          <TextInput id="next_service_hours" name="next_service_hours" type="number" step="0.1" />
        </Field>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit">Log Maintenance</Button>
      </div>
    </form>
  );
}
