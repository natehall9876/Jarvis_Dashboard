import Link from 'next/link';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { StatTile } from '@/components/ui/stat-tile';
import { getOperationalInvoices } from '@/lib/data/operations';
import { formatCurrency, clientDisplayName } from '@/lib/format';
import { todayInZone } from '@/lib/integrations/homeworks-dates';
export async function OperationalReceivables(){
  const result=await getOperationalInvoices(); const today=todayInZone();
  const invoices=result.data?.filter(i=>i.total>i.amount_paid);
  const overdue=invoices?.filter(i=>i.due_date&&i.due_date<today);
  const total=(rows:NonNullable<typeof invoices>)=>rows.reduce((n,i)=>n+Math.max(0,i.total-i.amount_paid),0);
  return <Card><CardHeader title="Receivables · Homeworks / Jarvis" description="Operational invoice balances. These are not QuickBooks balances and are never added to them." action={<Link href="/invoices" className="text-sm underline">All invoices</Link>}/><CardBody>
    {result.error?<p role="alert" className="text-amber-300">Receivables unavailable: {result.error}</p>:<><div className="grid grid-cols-2 gap-3"><StatTile label="Outstanding invoices" value={formatCurrency(total(invoices!))} sublabel={`${invoices!.length} invoices · drafts and voids excluded`}/><StatTile label="Past due" value={formatCurrency(total(overdue!))} sublabel={`${overdue!.length} overdue invoices`}/></div>
    <ul className="mt-3 divide-y divide-[var(--color-border)]">{invoices!.sort((a,b)=>(a.due_date??'9999').localeCompare(b.due_date??'9999')).slice(0,5).map(i=><li key={i.id}><Link href={'/invoices/'+i.id} className="flex min-h-11 flex-wrap justify-between gap-2 py-3 text-sm"><span>{clientDisplayName(i.client)} · #{i.invoice_number}<span className="block text-[var(--color-text-muted)]">{i.homeworks_id?'Homeworks':'Jarvis'} · {i.due_date?'Due '+i.due_date:'No due date'}</span></span><strong>{formatCurrency(i.total-i.amount_paid)}</strong></Link></li>)}</ul></>}
  </CardBody></Card>;
}
