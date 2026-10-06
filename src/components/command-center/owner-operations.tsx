import Link from 'next/link';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { StatTile } from '@/components/ui/stat-tile';
import { getOperatingJobs, getSales } from '@/lib/data/operations';
import { getWorkloadSummary } from '@/lib/data/jobs';
import { getAttentionItems } from '@/lib/data/attention';
import { sumKnown, weekBounds } from '@/lib/data/operations-model';
import { todayInZone } from '@/lib/integrations/homeworks-dates';
import { formatCurrency, clientDisplayName } from '@/lib/format';
const unavailable=<span className="text-base">Unavailable</span>;
const money=(n:number|null|undefined)=>n==null?unavailable:formatCurrency(n);
export async function OwnerOperations() {
  const today=todayInZone(); const week=weekBounds(today);
  const [jobs,sales,attention,workload]=await Promise.all([getOperatingJobs(),getSales(),getAttentionItems(),getWorkloadSummary(today,week.to)]);
  const active=(jobs.data??[]).filter(j=>j.status!=='cancelled'&&j.status!=='skipped');
  const scheduled=active.filter(j=>j.scheduled_date!>=week.from&&j.scheduled_date!<=week.to);
  const completed=scheduled.filter(j=>j.status==='completed'&&j.scheduled_date!<=today);
  const openLeads=sales.leads.data?.filter(l=>!['won','lost'].includes(l.status));
  const closed=sales.leads.data?.filter(l=>['won','lost'].includes(l.status));
  const pending=sales.estimates.data?.filter(q=>q.status==='sent');
  const actions:{id:string;href:string;title:string;next:string;score:number}[]=[];
  for(const lead of openLeads??[]) {
    const age=Math.max(0,Math.floor((Date.parse(today)-Date.parse((lead.submitted_at||lead.received_at).slice(0,10)))/86400000));
    const overdue=lead.follow_up_date&&lead.follow_up_date<=today;
    if(overdue||age>=3||lead.status==='new'||lead.status==='estimate_needed') actions.push({id:'lead-'+lead.id,href:'/leads#lead-'+lead.id,title:`${lead.name} · ${lead.status.replaceAll('_',' ')} · ${age} days old`,next:lead.follow_up_notes||(lead.status==='estimate_needed'?'Prepare and send an estimate.':'Contact the lead and set the next follow-up.'),score:overdue?1000:800+Math.min(age,100)});
  }
  for(const q of sales.estimates.data??[]) if(q.status==='draft') actions.push({id:'quote-'+q.id,href:'/quotes/'+q.id,title:`${clientDisplayName(q.client)} · draft estimate ${q.quote_number} · ${formatCurrency(q.total)}`,next:'Review this unsent estimate and decide whether to send or close it.',score:750});
  for(const item of attention.data?.items??[]) {
    if(item.category==='equipment_issue') continue; // Equipment provenance is not established; keep it in Equipment.
    const r=item.reference; const path=r?{invoice:'invoices',client:'clients',job:'jobs',quote:'quotes',equipment:'equipment'}[r.type]:'schedule';
    const value=Number(item.summary.match(/\$([\d,]+(?:\.\d+)?)/)?.[1]?.replaceAll(',','')??0);
    actions.push({id:item.category+'-'+(r?.id??item.summary),href:'/'+path+(r?'/'+r.id:''),title:item.summary,next:item.category==='overdue_invoice'?'Confirm the balance, then follow up for payment.':item.category==='quote_needs_follow_up'?'Ask for a decision and record the next step.':'Review the record and resolve its status.',score:(item.severity==='critical'?1200:item.severity==='warning'?600:300)+Math.min(value,1000)/10});
  }
  for(const day of workload.data?.days??[]) if(day.crew_assigned.length===0&&day.job_count>0) actions.push({id:'crew-'+day.date,href:'/schedule?view=day&date='+day.date,title:`${day.date} · ${day.job_count} jobs with no recorded crew assignment`,next:'Check who is covering the work; available capacity is not established.',score:day.date===today?1100:850});
  actions.sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
  const serviceMix=new Map<string,typeof scheduled>();
  for(const job of scheduled){const name=job.service?.name??'Service not recorded';serviceMix.set(name,[...(serviceMix.get(name)??[]),job]);}
  const issues=[jobs.error,workload.error&&'Crew coverage unavailable: '+workload.error,sales.leads.error&&'Leads unavailable: '+sales.leads.error,sales.estimates.error&&'Estimates unavailable: '+sales.estimates.error,attention.error&&'Attention scan incomplete: '+attention.error].filter(Boolean);
  return <div className="space-y-5">
    <Card><CardHeader title="What needs my attention?" description="Ranked by urgency, overdue follow-ups, and money at risk. Review source freshness before acting."/><CardBody>
      {issues.length>0&&<p role="alert" className="mb-3 text-sm text-amber-300">{issues.join(' ')}</p>}
      {actions.length?<ol className="divide-y divide-[var(--color-border)]">{actions.slice(0,7).map((a,i)=><li key={a.id}><Link href={a.href} className="block min-h-11 py-3"><span className="font-medium">{i+1}. {a.title}</span><p className="mt-1 text-sm text-[var(--color-text-secondary)]">{a.next}</p></Link></li>)}</ol>:<p>{issues.length?'The attention check is incomplete.':'No overdue items found in the available records.'}</p>}
      {actions.length>7&&<p className="mt-3 text-sm">{actions.length-7} more items are available in <Link className="underline" href="/leads">Leads + Sales</Link>, <Link className="underline" href="/jobs">Jobs</Link>, and <Link className="underline" href="/invoices">Invoices</Link>.</p>}
    </CardBody></Card>
    <Card><CardHeader title="This week in WeedEater" description={`${week.from} through ${week.to} · Homeworks/Jarvis records · completed work is not cash collected`}/><CardBody>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile label="Scheduled revenue" value={jobs.error?unavailable:money(sumKnown(scheduled))} sublabel="All active work on this week's schedule"/>
        <StatTile label="Completed revenue" value={jobs.error?unavailable:money(sumKnown(completed))} sublabel="Completed dated work through today"/>
        <StatTile label="Jobs this week" value={jobs.error?unavailable:scheduled.length} sublabel={jobs.error?'Could not load jobs':`${completed.length} completed`}/>
        <StatTile label="Open leads" value={openLeads?.length??unavailable} sublabel="Leads recorded in Jarvis"/>
        <StatTile label="Estimates awaiting response" value={pending?.length??unavailable} sublabel={pending?formatCurrency(pending.reduce((n,q)=>n+q.total,0)):'Estimate source unavailable'}/>
        <StatTile label="Lead conversion" value={closed?.length?Math.round(closed.filter(l=>l.status==='won').length/closed.length*100)+'%':unavailable} sublabel="Won ÷ won + lost; recorded leads only"/>
        <StatTile label="Budgeted hours" value={jobs.error||scheduled.some(j=>j.budgeted_hours==null)?unavailable:scheduled.reduce((n,j)=>n+j.budgeted_hours!,0).toFixed(1)} sublabel="Scheduled job hours, not staff availability"/>
        <StatTile label="Available crew capacity" value={unavailable} sublabel="Working hours and availability are not established"/>
      </div>
      <div className="mt-4"><h3 className="text-sm font-semibold">Service mix this week</h3>{jobs.error?<p>Unavailable</p>:serviceMix.size?<ul className="mt-2 space-y-2 text-sm">{[...serviceMix].map(([name,rows])=><li key={name} className="flex flex-wrap justify-between gap-2"><span>{name} · {rows.length} jobs</span><span>{sumKnown(rows)==null?'Revenue unavailable':formatCurrency(sumKnown(rows)!)}</span></li>)}</ul>:<p className="text-sm">No active jobs recorded this week.</p>}</div>
    </CardBody></Card>
  </div>;
}
