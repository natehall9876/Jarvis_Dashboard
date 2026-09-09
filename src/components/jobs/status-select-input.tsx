"use client";

import { Select } from "@/components/ui/form-fields";

const STATUSES = ["scheduled", "in_progress", "completed", "cancelled", "skipped"];

/** Submits its parent form immediately on change — no separate submit button needed. */
export function StatusSelectInput({ defaultValue }: { defaultValue: string }) {
  return (
    <Select
      name="status"
      defaultValue={defaultValue}
      className="w-40"
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
    >
      {STATUSES.map((s) => (
        <option key={s} value={s} className="capitalize">
          {s.replace("_", " ")}
        </option>
      ))}
    </Select>
  );
}
