import { Button } from "@/components/ui/button";
import { Field, TextInput, Select, Textarea, FormError } from "@/components/ui/form-fields";
import type { Employee } from "@/types/domain";

export function EmployeeForm({
  action,
  employee,
  error,
}: {
  action: (formData: FormData) => void;
  employee?: Employee;
  error?: string;
}) {
  return (
    <form action={action} className="space-y-4">
      <FormError message={error} />

      <div className="grid grid-cols-2 gap-3">
        <Field label="First Name" htmlFor="first_name" required>
          <TextInput id="first_name" name="first_name" defaultValue={employee?.first_name ?? ""} required />
        </Field>
        <Field label="Last Name" htmlFor="last_name">
          <TextInput id="last_name" name="last_name" defaultValue={employee?.last_name ?? ""} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Phone" htmlFor="phone">
          <TextInput id="phone" name="phone" type="tel" defaultValue={employee?.phone ?? ""} />
        </Field>
        <Field label="Email" htmlFor="email">
          <TextInput id="email" name="email" type="email" defaultValue={employee?.email ?? ""} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Role" htmlFor="role">
          <Select id="role" name="role" defaultValue={employee?.role ?? "crew_member"}>
            <option value="crew_member">Crew Member</option>
            <option value="crew_lead">Crew Lead</option>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
            <option value="owner">Owner</option>
          </Select>
        </Field>
        <Field label="Hourly Rate" htmlFor="hourly_rate">
          <TextInput id="hourly_rate" name="hourly_rate" type="number" step="0.01" min="0" defaultValue={employee?.hourly_rate ?? ""} placeholder="18.00" />
        </Field>
      </div>

      <Field label="Hire Date" htmlFor="hire_date">
        <TextInput id="hire_date" name="hire_date" type="date" defaultValue={employee?.hire_date ?? ""} />
      </Field>

      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
          <input type="checkbox" name="has_drivers_license" defaultChecked={employee?.has_drivers_license ?? false} className="h-4 w-4 rounded border-[var(--color-border-strong)] bg-[var(--color-surface-2)] accent-[var(--color-accent)]" />
          Has driver&apos;s license
        </label>
        <label className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
          <input type="checkbox" name="active" defaultChecked={employee?.active ?? true} className="h-4 w-4 rounded border-[var(--color-border-strong)] bg-[var(--color-surface-2)] accent-[var(--color-accent)]" />
          Active
        </label>
      </div>

      <Field label="Notes" htmlFor="notes">
        <Textarea id="notes" name="notes" rows={2} defaultValue={employee?.notes ?? ""} />
      </Field>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit">{employee ? "Save Changes" : "Add Employee"}</Button>
      </div>
    </form>
  );
}
