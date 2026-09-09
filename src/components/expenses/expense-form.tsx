import { Button } from "@/components/ui/button";
import { Field, TextInput, Select, Textarea, FormError } from "@/components/ui/form-fields";
import type { Expense } from "@/types/domain";

const CATEGORIES = ["fuel", "materials", "equipment_repair", "insurance", "labor", "office", "other"];

export function ExpenseForm({
  action,
  expense,
  jobs,
  equipment,
  error,
}: {
  action: (formData: FormData) => void;
  expense?: Expense;
  jobs: { id: string; label: string }[];
  equipment: { id: string; name: string }[];
  error?: string;
}) {
  return (
    <form action={action} className="space-y-4">
      <FormError message={error} />

      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" htmlFor="expense_date" required>
          <TextInput id="expense_date" name="expense_date" type="date" defaultValue={expense?.expense_date ?? new Date().toISOString().slice(0, 10)} required />
        </Field>
        <Field label="Amount" htmlFor="amount" required>
          <TextInput id="amount" name="amount" type="number" step="0.01" min="0" defaultValue={expense?.amount ?? ""} required />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Vendor" htmlFor="vendor" required>
          <TextInput id="vendor" name="vendor" defaultValue={expense?.vendor ?? ""} required />
        </Field>
        <Field label="Category" htmlFor="category" required>
          <Select id="category" name="category" defaultValue={expense?.category ?? "fuel"} required>
            {CATEGORIES.map((c) => (
              <option key={c} value={c} className="capitalize">
                {c.replace("_", " ")}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Description" htmlFor="description">
        <Textarea id="description" name="description" rows={2} defaultValue={expense?.description ?? ""} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Related Job" htmlFor="job_id" hint="Optional.">
          <Select id="job_id" name="job_id" defaultValue={expense?.job_id ?? ""}>
            <option value="">None</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Related Equipment" htmlFor="equipment_id" hint="Optional.">
          <Select id="equipment_id" name="equipment_id" defaultValue={expense?.equipment_id ?? ""}>
            <option value="">None</option>
            {equipment.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit">{expense ? "Save Changes" : "Add Expense"}</Button>
      </div>
    </form>
  );
}
