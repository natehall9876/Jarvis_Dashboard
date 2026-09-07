import { LoadingSkeleton } from "@/components/ui/states";

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div className="h-7 w-48 animate-pulse rounded-md bg-[var(--color-surface-2)]" />
      <LoadingSkeleton rows={6} />
    </div>
  );
}
