import { addDaysISO } from '@/lib/integrations/homeworks-dates';
export type HealthStream = {stream:string;last_success_at:string|null;last_error:string|null};
export function sourceHealth(streams:HealthStream[], expected:string[], now=Date.now()) {
  const errors=streams.filter(s=>s.last_error).map(s=>s.stream+': '+s.last_error);
  const selected=expected.map(key=>streams.find(s=>s.stream===key));
  const times=selected.map(s=>s?.last_success_at ? Date.parse(s.last_success_at) : NaN);
  const complete=times.length>0 && times.every(t=>Number.isFinite(t));
  return {current:complete && !errors.length && times.every(t=>now-t>=-60_000 && now-t<15*60_000), lastSuccess:complete ? new Date(Math.min(...times)).toISOString() : null, errors};
}
export type BusinessJob = {id:string;scheduled_date:string|null;status:string;price:number|null;budgeted_hours:number|null;scheduled_start_time:string|null;homeworks_deleted?:boolean;property:{client:{first_name:string;last_name:string|null;company_name:string|null;data_source:string}|null}|null;service:{name:string}|null};
export type LeadRow = {id:string;name:string;status:string;submitted_at:string;received_at:string;follow_up_date:string|null;follow_up_notes:string|null;service_requested:string|null;phone:string|null;email:string|null};
export type EstimateRow = {id:string;quote_number:string;status:string;total:number;created_at:string;sent_at:string|null;homeworks_deleted?:boolean;client:{first_name:string;last_name:string|null;company_name:string|null;data_source:string}|null};
export function weekBounds(today:string) {
  const day=new Date(today+'T12:00:00Z').getUTCDay(); const from=addDaysISO(today,-((day+6)%7));
  return {from,to:addDaysISO(from,6)};
}
export function sumKnown(rows:{price:number|null}[]):number|null { return rows.some(r=>typeof r.price!=='number'||!Number.isFinite(r.price)) ? null : Math.round(rows.reduce((n,r)=>n+r.price!,0)*100)/100; }
