import { StatusSelectInput } from "./status-select-input";

export function StatusQuickChange({
  action,
  currentStatus,
}: {
  action: (formData: FormData) => void;
  currentStatus: string;
}) {
  return (
    <form action={action}>
      <StatusSelectInput defaultValue={currentStatus} />
    </form>
  );
}
