import { Button } from "@/components/ui/button";
import { Field, TextInput, Select, Textarea, FormError } from "@/components/ui/form-fields";
import type { Client } from "@/types/domain";

export function ClientForm({
  action,
  client,
  error,
}: {
  action: (formData: FormData) => void;
  client?: Client;
  error?: string;
}) {
  return (
    <form action={action} className="space-y-4">
      <FormError message={error} />

      <div className="grid grid-cols-2 gap-3">
        <Field label="First Name" htmlFor="first_name">
          <TextInput id="first_name" name="first_name" defaultValue={client?.first_name ?? ""} placeholder="Sarah" />
        </Field>
        <Field label="Last Name" htmlFor="last_name">
          <TextInput id="last_name" name="last_name" defaultValue={client?.last_name ?? ""} placeholder="Delgado" />
        </Field>
      </div>

      <Field label="Company Name" htmlFor="company_name" hint="Leave blank for individual homeowners.">
        <TextInput id="company_name" name="company_name" defaultValue={client?.company_name ?? ""} placeholder="Greenfield HOA" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Phone" htmlFor="phone">
          <TextInput id="phone" name="phone" type="tel" defaultValue={client?.phone ?? ""} placeholder="704-555-0100" />
        </Field>
        <Field label="Email" htmlFor="email">
          <TextInput id="email" name="email" type="email" defaultValue={client?.email ?? ""} placeholder="name@example.com" />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Preferred Contact" htmlFor="preferred_contact_method">
          <Select id="preferred_contact_method" name="preferred_contact_method" defaultValue={client?.preferred_contact_method ?? "sms"}>
            <option value="sms">Text (SMS)</option>
            <option value="email">Email</option>
            <option value="phone">Phone</option>
          </Select>
        </Field>
        <Field label="Status" htmlFor="status">
          <Select id="status" name="status" defaultValue={client?.status ?? "active"}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="prospect">Prospect</option>
          </Select>
        </Field>
      </div>

      <Field label="Notes" htmlFor="notes">
        <Textarea id="notes" name="notes" rows={3} defaultValue={client?.notes ?? ""} placeholder="Gate codes, preferences, anything the crew should know..." />
      </Field>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit">{client ? "Save Changes" : "Add Client"}</Button>
      </div>
    </form>
  );
}
