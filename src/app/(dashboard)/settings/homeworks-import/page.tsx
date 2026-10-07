import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { HomeworksImportForm } from "@/components/settings/homeworks-import-form";

export const dynamic = "force-dynamic";

export default function HomeworksImportPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Homeworks Synchronization" description="Homeworks records are synchronized automatically." />
      <HomeworksImportForm />
      <Link href="/homeworks" className="text-sm text-[var(--color-accent)] hover:underline">View Homeworks records and sync status</Link>
    </div>
  );
}
