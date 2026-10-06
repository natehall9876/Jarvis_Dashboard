import Link from 'next/link';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { getSales } from '@/lib/data/operations';
import { todayInZone } from '@/lib/integrations/homeworks-dates';
import { clientDisplayName, formatCurrency } from '@/lib/format';
export const dynamic='force-dynamic';
export default async function LeadsPage() {
  const {leads,estimates}=await getSales(); const today=todayInZone();
  return <div className="space-y-5"><div><h1 className="text-2xl font-semibold">Leads + Sales</h1><p className="text-sm text-[var(--color-text-secondary)]">Recorded leads and Homeworks/Jarvis estimates. Existing customers are not counted as new leads.</p></div>
    <Card><CardHeader title="Leads and follow-ups" description="Age is measured from the recorded submission date. Won/lost records stay visible."/><CardBody>
      {leads.error?<p role="alert" className="text-amber-300">Leads unavailable: {leads.error}</p>:leads.data?.length?<ul className="space-y-4">{[...leads.data].sort((a,b)=>(a.follow_up_date??'9999').localeCompare(b.follow_up_date??'9999')).map(l=>{
        const age=Math.max(0,Math.floor((Date.parse(today)-Date.parse((l.submitted_at||l.received_at).slice(0,10)))/86400000)); const closed=['won','lost'].includes(l.status);
        return <li id={'lead-'+l.id} key={l.id} className="rounded-lg border border-[var(--color-border)] p-3"><div className="flex flex-wrap justify-between gap-2"><strong>{l.name}</strong><span>{l.status.replaceAll('_',' ')}</span></div><p className="text-sm">{age} days old · {l.service_requested||'Service not recorded'}</p><p className="mt-2 text-sm">Next action: {closed?'No open follow-up; outcome recorded.':l.follow_up_notes||(l.status==='estimate_needed'?'Prepare an estimate.':'Contact the lead and record a follow-up.')}</p>{l.follow_up_date&&<p className={l.follow_up_date<=today&&!closed?'text-amber-300':''}>Follow up {l.follow_up_date}{l.follow_up_date<today&&!closed?' · Overdue':''}</p>}<div className="mt-2 flex flex-wrap gap-4 text-sm">{l.phone&&<a className="underline" href={'tel:'+l.phone}>Call {l.phone}</a>}{l.email&&<a className="underline break-all" href={'mailto:'+l.email}>{l.email}</a>}</div></li>;
      })}</ul>:<p>No leads recorded in Jarvis. This does not establish that your website or Homeworks has no inquiries; an automatic lead intake feed is not verified.</p>}
    </CardBody></Card>
    <Card><CardHeader title="Estimates" description="Draft, awaiting response, won, and lost estimates from the available records."/><CardBody>
      {estimates.error?<p role="alert" className="text-amber-300">Estimates unavailable: {estimates.error}</p>:estimates.data?.length?<ul className="divide-y divide-[var(--color-border)]">{estimates.data.map(q=><li key={q.id}><Link href={'/quotes/'+q.id} className="block py-3"><div className="flex flex-wrap justify-between gap-2"><strong>{clientDisplayName(q.client)} · {q.quote_number}</strong><span>{formatCurrency(q.total)}</span></div><p className="text-sm">{q.status==='accepted'?'Won':q.status==='declined'?'Lost':q.status==='sent'?'Awaiting response':q.status} · Added to Jarvis {q.created_at.slice(0,10)}{q.sent_at?' · Sent '+q.sent_at.slice(0,10):''}</p><p className="mt-1 text-sm text-[var(--color-text-secondary)]">Next action: {q.status==='draft'?'Review and send, or close the draft.':q.status==='sent'?'Follow up for a decision.':q.status==='accepted'?'Confirm that the work is scheduled.':'No open sales follow-up.'}</p></Link></li>)}</ul>:<p>No estimates recorded.</p>}
    </CardBody></Card>
  </div>;
}
