import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { DataStateGate } from "@/components/ui/states";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/format";
import { getExpenses, type ExpenseWithRelations } from "@/lib/data/expenses";

export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  const { data: expenses, error } = await getExpenses();

  const columns: Column<ExpenseWithRelations>[] = [
    { key: "date", header: "Date", render: (e) => formatDate(e.expense_date) },
    { key: "vendor", header: "Vendor", render: (e) => e.vendor },
    { key: "category", header: "Category", render: (e) => <Badge>{e.category}</Badge> },
    { key: "description", header: "Description", render: (e) => e.description ?? "—" },
    {
      key: "job",
      header: "Related Job",
      render: (e) => (e.job ? <Link href={`/jobs/${e.job.id}`} className="text-[var(--color-accent)] hover:underline">{formatDate(e.job.scheduled_date)}</Link> : "—"),
    },
    {
      key: "equipment",
      header: "Related Equipment",
      render: (e) => (e.equipment ? <Link href={`/equipment/${e.equipment.id}`} className="text-[var(--color-accent)] hover:underline">{e.equipment.name}</Link> : "—"),
    },
    { key: "amount", header: "Amount", align: "right", render: (e) => formatCurrency(e.amount) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Expenses" description="Vendor spend tied back to jobs and equipment." />
      <Card>
        <DataStateGate error={error} isEmpty={!!expenses && expenses.length === 0} emptyTitle="No expenses yet">
          {expenses ? <DataTable columns={columns} rows={expenses} getRowKey={(e) => e.id} /> : null}
        </DataStateGate>
      </Card>
    </div>
  );
}
