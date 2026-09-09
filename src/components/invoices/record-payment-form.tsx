import { Button } from "@/components/ui/button";
import { Field, TextInput, Select, Textarea, FormError } from "@/components/ui/form-fields";

export function RecordPaymentForm({
  action,
  balance,
  error,
}: {
  action: (formData: FormData) => void;
  balance: number;
  error?: string;
}) {
  return (
    <form action={action} className="space-y-4">
      <FormError message={error} />

      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount" htmlFor="amount" required hint={`Balance due: $${balance.toFixed(2)}`}>
          <TextInput id="amount" name="amount" type="number" step="0.01" min="0.01" defaultValue={balance.toFixed(2)} required />
        </Field>
        <Field label="Payment Date" htmlFor="payment_date">
          <TextInput id="payment_date" name="payment_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
        </Field>
      </div>

      <Field label="Method" htmlFor="payment_method">
        <Select id="payment_method" name="payment_method" defaultValue="cash">
          <option value="cash">Cash</option>
          <option value="check">Check</option>
          <option value="credit_card">Credit Card</option>
          <option value="ach">ACH / Bank Transfer</option>
          <option value="other">Other</option>
        </Select>
      </Field>

      <Field label="External Reference" htmlFor="external_reference" hint="Check number, transaction ID, etc.">
        <TextInput id="external_reference" name="external_reference" />
      </Field>

      <Field label="Notes" htmlFor="notes">
        <Textarea id="notes" name="notes" rows={2} />
      </Field>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit">Record Payment</Button>
      </div>
    </form>
  );
}
