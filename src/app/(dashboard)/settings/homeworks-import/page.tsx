import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { HomeworksImportForm } from "@/components/settings/homeworks-import-form";

export const dynamic = "force-dynamic";

export default function HomeworksImportPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Homeworks Import"
        description="Preview and safely import Homeworks customer/property/invoice records — nothing is written until you review the preview and confirm."
      />

      <Card>
        <CardHeader
          title="How this works"
          description="Paste an export as JSON, preview it, then confirm — same review-before-write flow either way."
        />
        <CardBody className="space-y-2 text-sm text-[var(--color-text-secondary)]">
          <p>
            Paste an array of records shaped like the Homeworks sync payload — e.g.{" "}
            <code className="rounded bg-[var(--color-surface-3)] px-1 py-0.5 text-xs">
              {`{"records":[{"entity_type":"customer","homeworks_id":"123","first_name":"Jane","last_name":"Doe"}]}`}
            </code>
            . Properties and invoices need a <code className="rounded bg-[var(--color-surface-3)] px-1 py-0.5 text-xs">customer_homeworks_id</code> linking
            them to a customer record (either already synced, or earlier in the same batch).
          </p>
          <p>Click <strong>Preview</strong> first — it checks every record against the database and reports exactly what would change without writing anything. Only after reviewing that can you Confirm.</p>
        </CardBody>
      </Card>

      <HomeworksImportForm />
    </div>
  );
}
