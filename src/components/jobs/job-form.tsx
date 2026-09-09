import { Button } from "@/components/ui/button";
import { Field, TextInput, Select, Textarea, FormError } from "@/components/ui/form-fields";
import type { JobDetail } from "@/lib/data/jobs";

export function JobForm({
  action,
  job,
  properties,
  services,
  routes,
  employees,
  defaultDate,
  error,
}: {
  action: (formData: FormData) => void;
  job?: JobDetail;
  properties: { id: string; label: string }[];
  services: { id: string; name: string; default_price: number | null; default_budgeted_hours: number | null }[];
  routes: { id: string; name: string }[];
  employees: { id: string; label: string }[];
  defaultDate?: string;
  error?: string;
}) {
  const assignedIds = new Set((job?.crew ?? []).map((c) => c.id));

  return (
    <form action={action} className="space-y-4">
      <FormError message={error} />

      <Field label="Property" htmlFor="property_id" required>
        <Select id="property_id" name="property_id" required defaultValue={job?.property_id ?? ""}>
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

      <div className="grid grid-cols-2 gap-3">
        <Field label="Service" htmlFor="service_id">
          <Select id="service_id" name="service_id" defaultValue={job?.service_id ?? ""}>
            <option value="">None</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Route" htmlFor="route_id">
          <Select id="route_id" name="route_id" defaultValue={job?.route_id ?? ""}>
            <option value="">Unassigned</option>
            {routes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Scheduled Date" htmlFor="scheduled_date" required>
          <TextInput id="scheduled_date" name="scheduled_date" type="date" defaultValue={job?.scheduled_date ?? defaultDate ?? ""} required />
        </Field>
        <Field label="Start Time" htmlFor="scheduled_start_time">
          <TextInput id="scheduled_start_time" name="scheduled_start_time" type="time" defaultValue={job?.scheduled_start_time?.slice(0, 5) ?? ""} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Status" htmlFor="status">
          <Select id="status" name="status" defaultValue={job?.status ?? "scheduled"}>
            <option value="scheduled">Scheduled</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="skipped">Skipped</option>
          </Select>
        </Field>
        <Field label="Price" htmlFor="price" required>
          <TextInput id="price" name="price" type="number" step="0.01" min="0" defaultValue={job?.price ?? ""} required />
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Budgeted Hours" htmlFor="budgeted_hours">
          <TextInput id="budgeted_hours" name="budgeted_hours" type="number" step="0.1" min="0" defaultValue={job?.budgeted_hours ?? ""} />
        </Field>
        <Field label="Actual Hours" htmlFor="actual_hours">
          <TextInput id="actual_hours" name="actual_hours" type="number" step="0.1" min="0" defaultValue={job?.actual_hours ?? ""} />
        </Field>
        <Field label="Crew Size" htmlFor="crew_size">
          <TextInput id="crew_size" name="crew_size" type="number" step="1" min="0" defaultValue={job?.crew_size ?? ""} />
        </Field>
      </div>

      <Field label="Assign Crew" htmlFor="employee_ids">
        <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] p-2">
          {employees.length === 0 ? (
            <p className="px-1 py-1 text-xs text-[var(--color-text-muted)]">No active employees yet.</p>
          ) : (
            employees.map((e) => (
              <label key={e.id} className="flex items-center gap-2 rounded px-1 py-1 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-3)]">
                <input
                  type="checkbox"
                  name="employee_ids"
                  value={e.id}
                  defaultChecked={assignedIds.has(e.id)}
                  className="h-4 w-4 rounded border-[var(--color-border-strong)] bg-[var(--color-surface-1)] accent-[var(--color-accent)]"
                />
                {e.label}
              </label>
            ))
          )}
        </div>
      </Field>

      <Field label="Notes" htmlFor="notes">
        <Textarea id="notes" name="notes" rows={2} defaultValue={job?.notes ?? ""} />
      </Field>

      <Field label="Completion Notes" htmlFor="completion_notes">
        <Textarea id="completion_notes" name="completion_notes" rows={2} defaultValue={job?.completion_notes ?? ""} />
      </Field>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit">{job ? "Save Changes" : "Create Job"}</Button>
      </div>
    </form>
  );
}
