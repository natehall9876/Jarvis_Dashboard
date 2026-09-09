import Link from "next/link";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { DataStateGate } from "@/components/ui/states";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Modal } from "@/components/ui/modal";
import { ExpenseForm } from "@/components/expenses/expense-form";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import { getExpenses, type ExpenseWithRelations } from "@/lib/data/expenses";
import { getJobOptions, getEquipmentOptions } from "@/lib/data/options";
import { createExpense, updateExpense, deleteExpense } from "@/lib/actions/expenses";

export const dynamic = "force-dynamic";

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; edit?: string; error?: string }>;
}) {
  const { new: isNew, edit: editId, error: formError } = await searchParams;
  const showForm = isNew || editId;
  const [{ data: expenses, error }, jobs, equipment] = await Promise.all([
    getExpenses(),
    showForm ? getJobOptions() : Promise.resolve({ data: [] }),
    showForm ? getEquipmentOptions() : Promise.resolve({ data: [] }),
  ]);

  const editingExpense = editId ? (expenses ?? []).find((e) => e.id === editId) : undefined;
  const updateExpenseWithId = editId ? updateExpense.bind(null, editId) : undefined;

  const columns: Column<ExpenseWithRelations>[] = [
    { key: "date", header: "Date", render: (e) => formatDateOnly(e.expense_date) },
    { key: "vendor", header: "Vendor", render: (e) => e.vendor },
    { key: "category", header: "Category", render: (e) => <Badge>{e.category}</Badge> },
    { key: "description", header: "Description", render: (e) => e.description ?? "—" },
    {
      key: "job",
      header: "Related Job",
      render: (e) => (e.job ? <Link href={`/jobs/${e.job.id}`} className="text-[var(--color-accent)] hover:underline">{formatDateOnly(e.job.scheduled_date)}</Link> : "—"),
    },
    {
      key: "equipment",
      header: "Related Equipment",
      render: (e) => (e.equipment ? <Link href={`/equipment/${e.equipment.id}`} className="text-[var(--color-accent)] hover:underline">{e.equipment.name}</Link> : "—"),
    },
    { key: "amount", header: "Amount", align: "right", render: (e) => formatCurrency(e.amount) },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (e) => (
        <div className="flex items-center justify-end gap-1">
          <Link href={`/expenses?edit=${e.id}`} className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text-primary)]" aria-label="Edit">
            <Pencil className="h-3.5 w-3.5" />
          </Link>
          <form action={deleteExpense.bind(null, e.id)}>
            <ConfirmSubmit confirmMessage={`Delete this ${formatCurrency(e.amount)} expense from ${e.vendor}?`} className="!p-1">
              <Trash2 className="h-3.5 w-3.5" />
            </ConfirmSubmit>
          </form>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expenses"
        description="Vendor spend tied back to jobs and equipment."
        action={
          <Link href="/expenses?new=1">
            <Button>
              <Plus className="h-4 w-4" />
              Add Expense
            </Button>
          </Link>
        }
      />
      <Card>
        <DataStateGate error={error} isEmpty={!!expenses && expenses.length === 0} emptyTitle="No expenses yet">
          {expenses ? <DataTable columns={columns} rows={expenses} getRowKey={(e) => e.id} /> : null}
        </DataStateGate>
      </Card>

      {isNew ? (
        <Modal title="Add Expense" closeHref="/expenses">
          <ExpenseForm action={createExpense} jobs={jobs.data ?? []} equipment={equipment.data ?? []} error={formError} />
        </Modal>
      ) : null}

      {editId && editingExpense && updateExpenseWithId ? (
        <Modal title="Edit Expense" closeHref="/expenses">
          <ExpenseForm action={updateExpenseWithId} expense={editingExpense} jobs={jobs.data ?? []} equipment={equipment.data ?? []} error={formError} />
        </Modal>
      ) : null}
    </div>
  );
}
