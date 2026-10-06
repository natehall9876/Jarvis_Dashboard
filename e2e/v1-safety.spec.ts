import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { loadServerModule } from './load-server-module';

for (const failed of ['properties', 'invoices']) {
  test(`customer summary cannot show verified zeros when ${failed} fails`, async () => {
    const db = createClient('https://example.supabase.co', 'key', {auth:{persistSession:false}, global:{fetch:async input=>{
      const table = new URL(String(input)).pathname.split('/').at(-1);
      if(table === failed) return Response.json({message:'Source unavailable'}, {status:500});
      return Response.json(table === 'clients' ? [{id:'customer',data_source:'manual'}] : []);
    }}});
    const api=loadServerModule<{getClients:()=>Promise<{error:string|null;data:unknown}>}>('src/lib/data/clients.ts',{
      '@/lib/env':{isSupabaseConfigured:()=>true}, '@/lib/supabase/server':{createSupabaseServerClient:async()=>db},
    });
    const result=await api.getClients();
    expect(result.error).toBeTruthy();
    expect(result.data).toBeNull();
  });
}

import { sourceHealth, sumKnown, weekBounds } from '../src/lib/data/operations-model';
test('every stream must be fresh; one fresh customer stream cannot certify stale jobs',()=>{
  const rows=[{stream:'customers',last_success_at:'2026-10-06T17:00:00Z',last_error:null},{stream:'jobs',last_success_at:'2026-10-06T16:00:00Z',last_error:null}];
  expect(sourceHealth(rows,['customers','jobs'],Date.parse('2026-10-06T17:05:00Z')).current).toBe(false);
  expect(sourceHealth(rows.slice(0,1),['customers','jobs'],Date.parse('2026-10-06T17:05:00Z')).current).toBe(false);
  expect(sourceHealth(rows.slice(0,1),['customers'],Date.parse('2026-10-06T17:05:00Z')).current).toBe(true);
});
test('sync failure stays visible even with a recent success',()=>{
  expect(sourceHealth([{stream:'jobs',last_success_at:'2026-10-06T17:00:00Z',last_error:'Provider failed'}],['jobs'],Date.parse('2026-10-06T17:05:00Z')).errors).toContain('jobs: Provider failed');
});
test('missing job prices make a total unavailable, but known free jobs and empty results are zero',()=>{
  expect(sumKnown([{price:null},{price:50}])).toBeNull();
  expect(sumKnown([{price:0}])).toBe(0);
  expect(sumKnown([])).toBe(0);
  expect(sumKnown([{price:100},{price:65.25}])).toBe(165.25);
});
test('weekly operations use Monday through Sunday across month boundaries',()=>{
  expect(weekBounds('2026-10-01')).toEqual({from:'2026-09-28',to:'2026-10-04'});
});

import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
test('live money view keeps invoice balances separate from payments and excludes future payments',async()=>{
  const api=loadServerModule<{QuickBooksMoney:(p:{full:boolean})=>Promise<ReactElement>}>('src/components/command-center/live-integrations.tsx',{
    '@/lib/integrations/homeworks-dates':{todayInZone:()=> '2026-10-06'},
    '@/lib/data/operations-model':{weekBounds:()=>({from:'2026-10-05',to:'2026-10-11'})},
    '@/lib/integrations/quickbooks-api':{
      getAllInvoices:async()=>({ok:true,data:{invoices:[{Id:'1',TxnDate:'2026-10-01',TotalAmt:500,Balance:275,CustomerRef:{name:'Test'}}]}}),
      getAllPayments:async()=>({ok:true,data:{payments:[{Id:'p1',TxnDate:'2026-10-05',TotalAmt:225},{Id:'future',TxnDate:'2026-10-07',TotalAmt:9900}]}}),
    },
  });
  const html=renderToStaticMarkup(await api.QuickBooksMoney({full:true}));
  expect(html).toContain('$275'); expect(html).toContain('$225'); expect(html).not.toContain('$9,900');
  expect(html).toContain('Last successful live read');
});
test('provider denial never becomes zero receivables or a connected badge',async()=>{
  const api=loadServerModule<{QuickBooksMoney:(p:{full:boolean})=>Promise<ReactElement>}>('src/components/command-center/live-integrations.tsx',{
    '@/lib/integrations/quickbooks-api':{getAllInvoices:async()=>({ok:false,message:'Read denied'}),getAllPayments:async()=>({ok:false,message:'Read denied'})},
  });
  const html=renderToStaticMarkup(await api.QuickBooksMoney({full:true}));
  expect(html).toContain('Unavailable'); expect(html).toContain('Read denied'); expect(html).not.toContain('$0'); expect(html).not.toContain('Last successful live read');
});
test('unconfigured Google account shows unavailable calendar and conflicts',async()=>{
  const api=loadServerModule<{CalendarAgenda:()=>Promise<ReactElement>}>('src/components/command-center/live-integrations.tsx',{'@/lib/env.server':{isIntegrationConfigured:()=>false}});
  const html=renderToStaticMarkup(await api.CalendarAgenda());
  expect(html).toContain('Not configured');expect(html).toContain('conflicts are unavailable');expect(html).not.toContain('No calendar events');
});

test('QuickBooks forbidden response exposes only a safe diagnostic code',async()=>{
  const api=loadServerModule<typeof import('../src/lib/integrations/api-response')>('src/lib/integrations/api-response.ts',{},async()=>Response.json({Fault:{Error:[{code:'3100',Message:'SECRET customer payload'}]}},{status:403}));
  const result=await api.fetchApiJson('QuickBooks','https://example.test');
  expect(result.ok).toBe(false); if(!result.ok){expect(result.message).toContain('3100');expect(result.message).not.toContain('SECRET');}
});

import { buildBriefing } from '../src/lib/jarvis/briefing';
import { parseNavigationIntent } from '../src/lib/jarvis/voice-utils';
test('briefing does not describe missing prices as zero-dollar work',()=>{
  const result=buildBriefing({hour:10,jobs:[{status:'scheduled',price:null,budgeted_hours:null,scheduled_start_time:null,crewCount:0}]});
  expect(result.facts.find(f=>f.label==='Scheduled revenue')?.value).toContain('Unavailable');
});

for(const [command,href] of [['open money','/money'],['show me leads','/leads']]) test(command+' uses deterministic navigation',()=>{expect(parseNavigationIntent(command)).toMatchObject({kind:'route',target:{href}});});
