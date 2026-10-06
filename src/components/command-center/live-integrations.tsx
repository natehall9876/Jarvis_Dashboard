import Link from 'next/link';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { StatTile } from '@/components/ui/stat-tile';
import { getAllInvoices, getAllPayments } from '@/lib/integrations/quickbooks-api';
import { getConnectionStatus } from '@/lib/integrations/google-calendar-connection';
import { listEvents } from '@/lib/integrations/google-calendar-api';
import { isIntegrationConfigured } from '@/lib/env.server';
import { todayInZone, addDaysISO } from '@/lib/integrations/homeworks-dates';
import { weekBounds } from '@/lib/data/operations-model';
import { formatCurrency } from '@/lib/format';
const unavailable=<span className="text-base">Unavailable</span>;
const stamp=()=>new Date().toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+' ET';
export async function QuickBooksMoney({full=false}:{full?:boolean}) {
  const [invoiceRead,paymentRead]=await Promise.allSettled([getAllInvoices(),getAllPayments()]);
  const invoices=invoiceRead.status==='fulfilled'&&invoiceRead.value.ok?invoiceRead.value.data.invoices:null;
  const payments=paymentRead.status==='fulfilled'&&paymentRead.value.ok?paymentRead.value.data.payments:null;
  const errors=[invoiceRead,paymentRead].flatMap(r=>r.status==='rejected'?['QuickBooks read could not be completed.']:r.value.ok?[]:[r.value.message]);
  const checked=stamp(); const today=todayInZone(); const week=weekBounds(today); const month=today.slice(0,7)+'-01';
  const unpaid=invoices?.filter(i=>i.Balance>0).sort((a,b)=>(a.DueDate??'9999').localeCompare(b.DueDate??'9999')||b.Balance-a.Balance);
  const sum=(rows:{TotalAmt:number}[])=>rows.reduce((n,r)=>n+r.TotalAmt,0);
  const weekPayments=payments?.filter(p=>p.TxnDate>=week.from&&p.TxnDate<=today);
  const monthPayments=payments?.filter(p=>p.TxnDate>=month&&p.TxnDate<=today);
  return <Card><CardHeader title="Money · QuickBooks" description="Live read on page load. Accounting totals stay separate from Homeworks amounts." action={!full?<Link href="/money" className="text-sm underline">Open Money</Link>:undefined}/><CardBody>
    {errors.length>0&&<div role="alert" className="mb-4 rounded-lg border border-amber-600 p-3 text-sm text-amber-300"><strong>QuickBooks data unavailable or incomplete</strong><p>{[...new Set(errors)].join(' ')}</p><p>Last failed read: {checked}. Last successful read: not recorded. No fallback values are presented as QuickBooks data.</p><Link className="underline" href="/settings">Review connection</Link></div>}
    {!errors.length&&<p className="mb-3 text-sm text-[var(--color-text-secondary)]">Connected · Last successful live read: {checked}</p>}
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <StatTile label="Outstanding receivables" value={invoices?formatCurrency(invoices.reduce((n,i)=>n+Math.max(0,i.Balance),0)):unavailable} sublabel={unpaid?`${unpaid.length} unpaid QuickBooks invoices`:'QuickBooks invoice read failed'}/>
      <StatTile label="Invoice payments this week" value={weekPayments?formatCurrency(sum(weekPayments)):unavailable} sublabel="QuickBooks Payment records only"/>
      <StatTile label="Invoice payments this month" value={monthPayments?formatCurrency(sum(monthPayments)):unavailable} sublabel="Excludes sales receipts and other deposits"/>
      <StatTile label="Invoiced this month" value={invoices?formatCurrency(sum(invoices.filter(i=>i.TxnDate>=month&&i.TxnDate<=today))):unavailable} sublabel="Invoice totals; not profit or collected cash"/>
    </div>
    {invoices&&<div className="mt-4"><h3 className="font-semibold">Unpaid invoices</h3>{unpaid?.length?<ul className="mt-2 divide-y divide-[var(--color-border)]">{unpaid.slice(0,full?100:5).map(i=><li key={i.Id} className="flex flex-wrap justify-between gap-2 py-2 text-sm"><span>{i.CustomerRef?.name??'QuickBooks customer'} · #{i.DocNumber??i.Id}<span className="block text-[var(--color-text-muted)]">{i.DueDate?`Due ${i.DueDate}${i.DueDate<today?' · Overdue':''}`:'No due date recorded'}</span></span><strong>{formatCurrency(i.Balance)}</strong></li>)}</ul>:<p className="text-sm">No unpaid invoices returned by QuickBooks.</p>}{full&&unpaid&&unpaid.length>100&&<p>Showing the 100 earliest due invoices; totals include all {unpaid.length}.</p>}</div>}
    {full&&payments&&<div className="mt-4"><h3 className="font-semibold">Recent recorded payments</h3>{payments.length?<ul className="mt-2 divide-y divide-[var(--color-border)]">{[...payments].filter(p=>p.TxnDate<=today).sort((a,b)=>b.TxnDate.localeCompare(a.TxnDate)).slice(0,25).map(p=><li key={p.Id} className="flex flex-wrap justify-between gap-2 py-2 text-sm"><span>{p.CustomerRef?.name??'QuickBooks customer'} · {p.TxnDate}</span><strong>{formatCurrency(p.TotalAmt)}</strong></li>)}</ul>:<p>No payment records returned.</p>}</div>}
    <p className="mt-4 text-xs text-[var(--color-text-muted)]">Total business revenue and profit are unavailable here: a complete profit-and-loss report is not connected. <Link className="underline" href="/invoices">View separate Homeworks/Jarvis invoices</Link>.</p>
  </CardBody></Card>;
}
export async function CalendarAgenda() {
  let error:string|null=null; let events:Awaited<ReturnType<typeof listEvents>>|null=null; let calendarName:string|null=null;
  const today=todayInZone(); const checked=stamp();
  try {
    if(!isIntegrationConfigured('googleCalendar')) error='Not configured. Google Calendar credentials and owner authorization are required in Settings.';
    else {
      const connection=await getConnectionStatus();
      if(!connection.connected) error=connection.error||'Disconnected. Connect Google Calendar in Settings.';
      else if(!connection.selectedCalendarId) error='Connected account has no selected calendar. Choose one in Settings.';
      else {calendarName=connection.selectedCalendarSummary;events=await listEvents(connection.selectedCalendarId,{from:today,to:addDaysISO(today,6)});if(!events.ok)error=events.message;}
    }
  }catch{error='Google Calendar could not be checked. Its events and conflicts are unavailable.';}
  return <Card><CardHeader title="Google Calendar · next 7 days" description="Calendar events are separate from paid jobs and never added to revenue." action={<Link href="/settings" className="text-sm underline">Settings</Link>}/><CardBody>
    {error?<div role="alert" className="text-sm text-amber-300"><p>{error}</p><p>Checked {checked}. Calendar events and cross-calendar conflicts are unavailable.</p></div>:events?.ok?<><p className="mb-3 text-sm">Connected · {calendarName} · Last successful read: {checked}</p>{events.data.events.length?<ul className="space-y-3">{events.data.events.map(e=><li key={e.id} className="text-sm"><strong>{e.summary||'Untitled event'}</strong><p>{e.start.date??(e.start.dateTime?new Date(e.start.dateTime).toLocaleString('en-US',{timeZone:'America/New_York',weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+' ET':'Time unavailable')}{e.start.date?' · All day':''}</p></li>)}</ul>:<p>No calendar events in the next 7 days.</p>}</>:null}
  </CardBody></Card>;
}
