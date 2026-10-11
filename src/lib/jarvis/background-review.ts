import { todayInZone,addDaysISO } from '@/lib/integrations/homeworks-dates';
import type { BackgroundJob } from './reminder-model';
export type ReviewJobRow={id:string;scheduled_date:string|null;scheduled_start_time:string|null;status:string;homeworks_deleted:boolean;budgeted_hours:number|null;service?:{name:string}|null;property?:{client?:{data_source:string}|null}|null};
export type ReviewInvoiceRow={id:string;invoice_number:string;status:string;total:number;amount_paid:number;due_date:string|null;homeworks_deleted:boolean;client?:{data_source:string}|null};
export function buildReview(kind:BackgroundJob['kind'], jobs:ReviewJobRow[], invoices:ReviewInvoiceRow[], now=new Date()):NonNullable<BackgroundJob['result']> {
 const today=todayInZone(now);const active=jobs.filter(j=>!j.homeworks_deleted&&j.property?.client?.data_source!=='demo'&&!['cancelled','skipped'].includes(j.status));
 const next=active.filter(j=>j.scheduled_date&&j.scheduled_date>=today&&j.scheduled_date<=addDaysISO(today,7)&&j.status!=='completed');
 const late=active.filter(j=>j.scheduled_date&&j.scheduled_date<today&&j.status!=='completed');
 const overdue=invoices.filter(i=>!i.homeworks_deleted&&i.client?.data_source!=='demo'&&!['draft','void','paid'].includes(i.status)&&i.due_date&&i.due_date<today&&Number.isFinite(Number(i.total))&&Number.isFinite(Number(i.amount_paid))&&Number(i.total)>Number(i.amount_paid));
 const balance=overdue.reduce((n,i)=>n+Math.max(0,Number(i.total)-Number(i.amount_paid)),0);
 const facts:string[]=[];
 if(kind!=='collections')facts.push(`${next.length} open jobs in the next 7 days; ${next.filter(j=>!j.scheduled_start_time).length} have no recorded start time.`,`${late.length} unfinished jobs in the prior 31 days.`,`${next.filter(j=>j.budgeted_hours===null).length} upcoming jobs have no recorded hours estimate.`);
 if(kind!=='schedule')facts.push(`${overdue.length} overdue open invoices with a combined remaining balance of $${balance.toFixed(2)}.`,...overdue.sort((a,b)=>(Number(b.total)-Number(b.amount_paid))-(Number(a.total)-Number(a.amount_paid))).slice(0,3).map(i=>`Invoice ${i.invoice_number}: $${(Number(i.total)-Number(i.amount_paid)).toFixed(2)} remaining, due ${i.due_date}.`));
 return {summary:`${kind[0].toUpperCase()+kind.slice(1)} review ready. ${facts[0]}`,facts:[...facts,'Read-only snapshot of current Jarvis source records. No records changed or messages sent.'],reviewed_at:now.toISOString()};
}
