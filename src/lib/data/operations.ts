import { cache } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { withDataResult } from '@/lib/data/shared';
import { todayInZone, addDaysISO } from '@/lib/integrations/homeworks-dates';
import type { BusinessJob, LeadRow, EstimateRow } from './operations-model';
import type { DataResult } from '@/types/domain';

/** Read every page with stable ordering; a failed/truncated scan never becomes a KPI. */
async function readAll<T>(db:SupabaseClient, table:string, select:string, date?:{column:string;from:string;to:string}):Promise<T[]> {
  const all:T[]=[];
  for(let offset=0;offset<20_000;offset+=500) {
    let query=db.from(table).select(select).order('id').range(offset,offset+499);
    if(date) query=query.gte(date.column,date.from).lte(date.column,date.to);
    const {data,error}=await query.abortSignal(AbortSignal.timeout(15_000));
    if(error) throw error;
    if(!data) throw new Error(`${table} returned no readable response.`);
    all.push(...data as unknown as T[]);
    if(data.length<500) return all;
  }
  throw new Error(`${table} exceeded the safe read limit. Totals are unavailable.`);
}
export const getSales = cache(async ()=>{
  const [leads,estimates]=await Promise.all([
    withDataResult(async()=>readAll<LeadRow>(await createSupabaseServerClient() as unknown as SupabaseClient,'leads','id,name,status,submitted_at,received_at,follow_up_date,follow_up_notes,service_requested,phone,email')),
    withDataResult(async()=>readAll<EstimateRow>(await createSupabaseServerClient() as unknown as SupabaseClient,'quotes','id,quote_number,status,total,created_at,sent_at,homeworks_deleted,client:clients(first_name,last_name,company_name,data_source)')),
  ]);
  if(estimates.data) estimates.data=estimates.data.filter(q=>q.client?.data_source!=='demo'&&!q.homeworks_deleted);
  return {leads,estimates};
});
export const getOperatingJobs = cache(async ():Promise<DataResult<BusinessJob[]>>=>withDataResult(async()=>{
  const db=await createSupabaseServerClient() as unknown as SupabaseClient;
  const today=todayInZone();
  const jobs=await readAll<BusinessJob>(db,'jobs','id,scheduled_date,scheduled_start_time,status,price,budgeted_hours,homeworks_deleted,property:properties(client:clients(first_name,last_name,company_name,data_source)),service:services(name)',{column:'scheduled_date',from:addDaysISO(today,-31),to:addDaysISO(today,14)});
  return jobs.filter(j=>j.property?.client?.data_source!=='demo'&&!j.homeworks_deleted);
}));

export type OperationalInvoice = {id:string;invoice_number:string;status:string;total:number;amount_paid:number;due_date:string|null;homeworks_id:string|null;homeworks_deleted:boolean;client:{first_name:string;last_name:string|null;company_name:string|null;data_source:string}|null};
export const getOperationalInvoices=cache(async()=>withDataResult(async()=>{
  const db=await createSupabaseServerClient() as unknown as SupabaseClient;
  const rows=await readAll<OperationalInvoice>(db,'invoices','id,invoice_number,status,total,amount_paid,due_date,homeworks_id,homeworks_deleted,client:clients(first_name,last_name,company_name,data_source)');
  return rows.filter(i=>i.client?.data_source!=='demo'&&!i.homeworks_deleted&&!['draft','void'].includes(i.status));
}));
