import { Button } from "@/components/ui/button";
import { Field, TextInput, Select, Textarea, FormError } from "@/components/ui/form-fields";
import type { Route } from "@/types/domain";

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

export function RouteForm({
  action,
  route,
  error,
}: {
  action: (formData: FormData) => void;
  route?: Route;
  error?: string;
}) {
  return (
    <form action={action} className="space-y-4">
      <FormError message={error} />

      <Field label="Route Name" htmlFor="name" required>
        <TextInput id="name" name="name" defaultValue={route?.name ?? ""} placeholder="Monday Route" required />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Day" htmlFor="route_day">
          <Select id="route_day" name="route_day" defaultValue={route?.route_day ?? "monday"}>
            {DAYS.map((day) => (
              <option key={day} value={day} className="capitalize">
                {day.charAt(0).toUpperCase() + day.slice(1)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Start Location" htmlFor="start_location">
          <TextInput id="start_location" name="start_location" defaultValue={route?.start_location ?? ""} placeholder="Shop" />
        </Field>
      </div>

      <Field label="Notes" htmlFor="notes">
        <Textarea id="notes" name="notes" rows={2} defaultValue={route?.notes ?? ""} />
      </Field>

      <label className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
        <input type="checkbox" name="active" defaultChecked={route?.active ?? true} className="h-4 w-4 rounded border-[var(--color-border-strong)] bg-[var(--color-surface-2)] accent-[var(--color-accent)]" />
        Active
      </label>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit">{route ? "Save Changes" : "Create Route"}</Button>
      </div>
    </form>
  );
}
