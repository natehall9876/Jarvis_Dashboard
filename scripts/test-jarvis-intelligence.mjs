import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';
function moduleAt(file,mocks={}){const abs=path.resolve(file),mod={exports:{}},req=createRequire(abs);const resolve=id=>id in mocks?mocks[id]:id.startsWith('@/')?moduleAt(`src/${id.slice(2)}.ts`,mocks):id.startsWith('.')?moduleAt(path.resolve(path.dirname(abs),id)+'.ts',mocks):req(id);new Function('require','module','exports',ts.transpileModule(fs.readFileSync(abs,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(resolve,mod,mod.exports);return mod.exports;}
const model=moduleAt('src/lib/intelligence/model.ts');
const diagnostics=moduleAt('src/lib/intelligence/diagnostics.ts');
const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002',token='00000000-0000-4000-8000-000000000003';
const now=new Date(),iso=now.toISOString();
function finding(overrides={}){return {dedup_key:'research:real-action',scope:'research',title:'Validate a real customer need',why_now:'Current primary evidence warrants a cheap test.',next_step:'Interview three actual prospects.',owner_label:'Owner',confidence:'medium',priority:60,priority_basis:'Material fit, unknown paid demand.',impact:{kind:'unknown',amount:null,unit:null,basis:'No revenue has been proven.'},effort_hours:null,capital_required:null,facts:['The primary source was read.'],inference:'Interest is not paid demand.',evidence:[{title:'Primary evidence',url:'https://www.energy.gov/example',observed_at:iso,published_at:null,source_type:'primary',note:'The source supports the stated factual claim.'}],deadline:null,expires_at:new Date(now.getTime()+86400000).toISOString(),prepared:{kind:'experiment',content:'Ask three prospects whether they have the specific need and will commit to a paid pilot. Record objections and stop if no commitment.',prepared_at:iso,next_actor:'Owner'},validation:{mechanism:'Sell a pilot after demand proof.',fit:'Uses current service capability.',entry_barrier:'Customer access remains unverified.',cheapest_test:'Three interviews.',success_metric:'One paid pilot commitment.',stop_rule:'Stop if no commitment.'},...overrides};}
function run(overrides={}){return {source:'external',run_key:crypto.randomUUID(),started_at:iso,finished_at:iso,status:'completed',summary:'Actual source review complete.',coverage:[{source:'research',status:'ok',checked_at:iso,detail:'Primary source read.',records:1}],...overrides};}
async function database(){const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,service_role;grant execute on function auth.uid() to authenticated,service_role;create table public.app_members(user_id uuid primary key,role text,active boolean);grant select on public.app_members to authenticated,service_role;insert into auth.users values('${a}'),('${b}');insert into public.app_members values('${a}','owner',true),('${b}','owner',true);`);await db.exec(fs.readFileSync('supabase/migrations/20261011120000_jarvis_intelligence.sql','utf8'));return db;}
async function as(db,role,owner,sql,args=[]){await db.exec(`reset role;select set_config('request.jwt.claim.sub','${owner}',false);set role ${role};`);return db.query(sql,args);}
async function ingest(db,r=run(),items=[finding()],owner=a){return as(db,'service_role','',`select public.jarvis_import_intelligence($1,$2,$3) receipt`,[owner,JSON.stringify(r),JSON.stringify(items)]);}

test('diagnostics preserve nulls and exclude deleted, confirmed demo, cancelled and zero-price appointments',()=>{
 const inv={id:a,invoice_number:'INV-1',status:'sent',total:200,amount_paid:20,due_date:'2026-10-01',homeworks_deleted:false};
 const job={id:a,status:'scheduled',price:260,budgeted_hours:4,actual_hours:null,crew_size:null,scheduled_date:'2026-10-10',scheduled_start_time:null,homeworks_deleted:false};
 const at=new Date('2026-10-11T12:00:00Z');
 const results=diagnostics.buildDiagnostics({invoices:[inv,{...inv,id:b,total:null},{...inv,id:token,homeworks_deleted:true},{...inv,id:'demo',client:{data_source:'demo'}}],quotes:[],jobs:[job,{...job,id:b,price:0},{...job,id:token,status:'cancelled'}]},model.DEFAULT_INTELLIGENCE_SETTINGS,at);
 const balance=results.find(i=>i.scope==='invoices');assert.equal(balance.impact.amount,180);assert.match(balance.prepared.content,/180.00/);assert.equal(results.filter(i=>i.scope==='invoices').length,1);
 const rate=results.find(i=>i.impact.kind==='planned_rate');assert.equal(rate.impact.amount,65);assert.match(rate.prepared.content,/260.00/);assert.match(rate.prepared.content,/520.00/);assert.match(rate.impact.basis,/not.*profit/i);
 assert.equal(results.filter(i=>i.impact.kind==='planned_rate').length,1);assert.ok(results.some(i=>i.prepared.kind==='worksheet'));assert.ok(results.every(i=>i.capital_required===null));
});
test('citation, input and ranking bounds reject unsafe links and nonfinite outcomes; top is at most three current actions',()=>{
 for(const url of ['javascript:alert(1)','https://user:pass@example.com','https://127.0.0.1/x','https://10.0.0.1/x','https://localhost/x','//evil.example','https://[::1]/x'])assert.equal(model.safeEvidenceUrl(url,'external'),false,url);
 assert.equal(model.safeEvidenceUrl('https://www.energy.gov/path','external'),true);
 assert.throws(()=>model.validateAction({action:'outcome',id:a,notes:'',realized_revenue:Infinity,realized_savings:null,hours_saved:null}));
 assert.throws(()=>model.validateAction({action:'preferences',enabled:true,hourly_target:130,interests:Array(13).fill('x'),watches:[]}));
 const items=Array.from({length:8},(_,i)=>({...finding({dedup_key:`research:${i}`}),id:String(i),source:'external',state:'new',outcome:null,source_active:true,observed_at:iso,created_at:iso,updated_at:iso,stale:false,stale_reason:null}));
 assert.equal(model.topDecisions(items).length,3);assert.equal(model.topDecisions(items.map(i=>({...i,stale:true}))).length,0);
});
test('real migration isolates owners and service ingestion, preserves decisions/outcomes and rejects regressions/retries',async()=>{const db=await database();try{
 const r=run();const first=await ingest(db,r);assert.equal(first.rows[0].receipt.applied,true);
 assert.equal((await as(db,'authenticated',b,'select * from jarvis_intelligence_items')).rows.length,0);
 await assert.rejects(()=>as(db,'authenticated',a,'select jarvis_import_intelligence($1,$2,$3)',[a,JSON.stringify(r),'[]']),/permission denied/);
 await assert.rejects(()=>as(db,'authenticated',a,"update jarvis_intelligence_items set state='completed'"),/permission denied/);
 const rows=await as(db,'authenticated',a,'select * from jarvis_intelligence_items');const id=rows.rows[0].id;
 await as(db,'authenticated',a,'select jarvis_update_intelligence($1)',[JSON.stringify({action:'decision',id,state:'completed'})]);
 await as(db,'authenticated',a,'select jarvis_update_intelligence($1)',[JSON.stringify({action:'outcome',id,notes:'Owner recorded the outcome.',realized_revenue:25,realized_savings:null,hours_saved:0})]);
 await assert.rejects(()=>as(db,'authenticated',b,'select jarvis_update_intelligence($1)',[JSON.stringify({action:'decision',id,state:'watch'})]),/Item unavailable/);
 await assert.rejects(()=>as(db,'authenticated',a,'select jarvis_update_intelligence($1)',[JSON.stringify({action:'decision',id,state:'accepted'})]),/terminal/);
 const newer=new Date(now.getTime()+1000).toISOString();await ingest(db,run({started_at:newer,finished_at:newer}),[finding({title:'Updated factual action'})]);
 const late=await ingest(db,run({started_at:new Date(now.getTime()-1000).toISOString()}),[finding({title:'Older action'})]);assert.equal(late.rows[0].receipt.applied,false);
 const duplicate=await ingest(db,r);assert.equal(duplicate.rows[0].receipt.duplicate,true);
 const current=(await as(db,'authenticated',a,'select * from jarvis_intelligence_items')).rows[0];assert.equal(current.payload.title,'Updated factual action');assert.equal(current.state,'completed');assert.equal(current.outcome.realized_revenue,25);assert.equal(current.outcome.attribution,'owner_reported');
 await as(db,'postgres','',`update app_members set active=false where user_id='${a}'`);assert.equal((await as(db,'authenticated',a,'select * from jarvis_intelligence_items')).rows.length,0);await assert.rejects(()=>ingest(db),/Active owner/);
 }finally{await db.close();}});
test('importer rejects unsafe, missing, expired, unsupported and oversized evidence at the database boundary',async()=>{const db=await database();try{
 const bad=[finding({evidence:[]}),finding({evidence:[{...finding().evidence[0],url:'javascript:alert(1)'}]}),finding({evidence:[{...finding().evidence[0],url:'https://127.0.0.1/secrets'}]}),finding({evidence:[{...finding().evidence[0],source_type:'news'}]}),finding({evidence:[{...finding().evidence[0],observed_at:'2000-01-01T00:00:00Z'}]}),finding({prepared:{...finding().prepared,content:'x'.repeat(12001)}}),finding({validation:null}),finding({prepared:{...finding().prepared,kind:'collection_draft'}}),finding({capital_required:-1}),finding({state:'completed'}),finding({expires_at:'2000-01-01T00:00:00Z'}),finding({confidence:null}),finding({impact:{...finding().impact,kind:null}})];
 await assert.rejects(()=>ingest(db,run({started_at:'today'}),[]),/ISO/);
 for(const f of bad)await assert.rejects(()=>ingest(db,run(),[f]));
 await assert.rejects(()=>ingest(db,run(),Array(4).fill(finding())));await assert.rejects(()=>ingest(db,run(),[finding(),finding()]));
 assert.equal((await as(db,'authenticated',a,'select * from jarvis_intelligence_runs')).rows.length,0);
 }finally{await db.close();}});
test('atomic scan lease fences overlapping/expired workers, reconciles only successful sources and records zero findings',async()=>{const db=await database();try{
 const claim=(await as(db,'service_role','','select jarvis_claim_intelligence($1,$2,true) receipt',[a,token])).rows[0].receipt;assert.equal(claim.claimed,true);
 assert.equal((await as(db,'service_role','','select jarvis_claim_intelligence($1,$2,true) receipt',[a,b])).rows[0].receipt.reason,'running');
 const internal=run({source:'internal',run_key:`internal:${token}`,lease_token:token,started_at:claim.started_at,finished_at:new Date().toISOString(),status:'partial',coverage:['invoices','quotes','jobs','homeworks','quickbooks'].map(source=>({source,status:source==='quickbooks'?'unverified':source==='quotes'?'failed':'ok',checked_at:new Date().toISOString(),detail:source==='quotes'?'Source unavailable.':'Actual source check.',records:['quotes','quickbooks'].includes(source)?null:0}))});
 const i=finding({scope:'invoices',evidence:[{...finding().evidence[0],url:`/invoices/${a}`,source_type:'record'}],validation:null});
 await assert.rejects(()=>ingest(db,{...internal,lease_token:b},[i]),/lease/);await ingest(db,internal,[i]);
 const saved=(await as(db,'authenticated',a,'select * from jarvis_intelligence_runs')).rows[0];assert.equal(saved.status,'partial');
 await as(db,'service_role','',`update jarvis_intelligence_settings set last_internal_started_at=now()-interval '20 minutes' where owner_id='${a}'`);
 const second=(await as(db,'service_role','','select jarvis_claim_intelligence($1,$2,true) receipt',[a,b])).rows[0].receipt;
 await ingest(db,{...internal,run_key:`internal:${b}`,lease_token:b,started_at:second.started_at,finished_at:new Date().toISOString()},[]);
 assert.equal((await as(db,'authenticated',a,'select * from jarvis_intelligence_items')).rows[0].source_active,false);
 const failed=run({started_at:new Date().toISOString(),finished_at:new Date().toISOString(),status:'failed',coverage:[{source:'research',status:'failed',checked_at:new Date().toISOString(),detail:'Connector unavailable.',records:null}]});await ingest(db,failed,[]);
 assert.equal((await as(db,'authenticated',a,"select * from jarvis_intelligence_runs where source='external'")).rows[0].item_count,0);
 }finally{await db.close();}});
function workerDb(overrides={}){
 const seen=[],imports=[];const tables={app_members:[{user_id:a,role:'owner',active:true}],jarvis_intelligence_settings:[{...model.DEFAULT_INTELLIGENCE_SETTINGS,owner_id:a}],invoices:[],quotes:[],jobs:[],homeworks_sync_state:moduleAt('src/lib/integrations/homeworks-auto-streams.ts').HOMEWORKS_STREAMS.map(s=>({stream:s.key,last_success_at:new Date().toISOString(),last_error:null})),...overrides};
 const db={from(table){seen.push(table);let filters=[],single=false;const q={select:()=>q,eq:(k,v)=>{filters.push(r=>r[k]===v);return q},lt:()=>q,lte:()=>q,gte:()=>q,not:()=>q,order:()=>q,limit:()=>q,abortSignal:()=>q,maybeSingle:()=>{single=true;return q},then(resolve,reject){const source=tables[table];if(source instanceof Error)return Promise.resolve({data:null,error:{message:'Private raw error must not escape'}}).then(resolve,reject);const rows=source.filter(r=>filters.every(f=>f(r)));return Promise.resolve({data:single?rows[0]??null:rows,error:null}).then(resolve,reject)}};return q;},async rpc(name,args){if(name==='jarvis_claim_intelligence')return {data:{claimed:true,started_at:new Date().toISOString()},error:null};if(name==='jarvis_import_intelligence'){imports.push(args);return {data:{run_id:crypto.randomUUID(),item_count:args.p_items.length,applied:true},error:null}};throw new Error(`Unexpected RPC ${name}`)}};
 return {db,seen,imports};
}
test('worker records per-source failures and bounded overflows without turning unread data into zero',async()=>{
 const worker=moduleAt('src/lib/intelligence/worker.ts',{'@/lib/supabase/admin':{createSupabaseAdminClient:()=>{throw new Error('Unexpected admin construction')}}});
 const invoices=[{id:a,invoice_number:'INV-1',status:'sent',total:100,amount_paid:20,due_date:'2026-01-01',homeworks_deleted:false}];
 const mock=workerDb({invoices,quotes:new Error('read failed')});const receipt=await worker.scanIntelligenceOwner(mock.db,a,true);assert.equal(receipt.status,'partial');
 const imported=mock.imports[0];assert.equal(imported.p_owner,a);assert.equal(imported.p_items.length,1);assert.equal(imported.p_items[0].impact.amount,80);assert.equal(imported.p_run.coverage.find(c=>c.source==='quotes').records,null);assert.equal(imported.p_run.coverage.find(c=>c.source==='quotes').status,'failed');assert.equal(imported.p_run.coverage.find(c=>c.source==='quickbooks').status,'unverified');assert.doesNotMatch(JSON.stringify(imported),/Private raw error/);
 const huge=workerDb({invoices:Array(501).fill(invoices[0])});await worker.scanIntelligenceOwner(huge.db,a,true);assert.equal(huge.imports[0].p_items.length,0);assert.equal(huge.imports[0].p_run.coverage.find(c=>c.source==='invoices').records,null);
 const output=workerDb({invoices:Array.from({length:41},(_,i)=>({...invoices[0],id:`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`}))});await worker.scanIntelligenceOwner(output.db,a,true);assert.equal(output.imports[0].p_run.coverage.find(c=>c.source==='invoices').status,'failed');assert.equal(output.imports[0].p_items.length,0);
 const allFailed=workerDb({invoices:new Error(),quotes:new Error(),jobs:new Error(),homeworks_sync_state:new Error()});assert.equal((await worker.scanIntelligenceOwner(allFailed.db,a,true)).status,'failed');assert.equal(allFailed.imports[0].p_items.length,0);
 const inactive=workerDb({app_members:[{user_id:a,role:'owner',active:false}]});await assert.rejects(()=>worker.scanIntelligenceOwner(inactive.db,a,true));assert.deepEqual(inactive.seen,['app_members']);
 const disabled=workerDb();disabled.db.rpc=async()=>({data:{claimed:false,reason:'disabled'},error:null});assert.equal((await worker.scanIntelligenceOwner(disabled.db,a)).reason,'disabled');assert.deepEqual(disabled.seen,['app_members']);
});
test('owner HTTP actions enforce authentication, origin, JSON size, typed state and outcome values before writing',async()=>{
 let allowed=true,writes=0,refreshes=0;
 const snapshot={settings:model.DEFAULT_INTELLIGENCE_SETTINGS,items:[],top:[],runs:[],coverage:{},has_more:false,generated_at:iso};
 const storage={intelligenceOwner:async()=>{if(!allowed)throw new model.IntelligenceError('Sign in',401);return {db:{},ownerId:a}},getIntelligence:async()=>snapshot,readIntelligence:async()=>snapshot,updateIntelligence:async()=>{writes++},intelligenceFailure:e=>Response.json({error:e.message},{status:e.status??503})};
 const route=moduleAt('src/app/api/jarvis/intelligence/route.ts',{'@/lib/intelligence/model':model,'@/lib/intelligence/storage':storage,'@/lib/intelligence/worker':{runIntelligenceWorker:async(owner)=>{assert.equal(owner,a);refreshes++;return {receipts:[{owner_id:a,status:'completed',run_id:token}]}}}});
 const request=(body,origin='https://jarvis.example')=>new Request('https://jarvis.example/api/jarvis/intelligence',{method:'POST',headers:{origin,'content-type':'application/json'},body:typeof body==='string'?body:JSON.stringify(body)});
 assert.equal((await route.POST(request({action:'refresh'},'https://evil.example'))).status,403);allowed=false;assert.equal((await route.POST(request({action:'refresh'}))).status,401);allowed=true;
 assert.equal((await route.POST(request('{broken'))).status,400);assert.equal((await route.POST(request('x'.repeat(16385)))).status,413);
 assert.equal((await route.PATCH(request({action:'outcome',id:a,notes:'',realized_revenue:-1,realized_savings:null,hours_saved:null}))).status,400);
 assert.equal((await route.PATCH(request({action:'decision',id:a,state:'new'}))).status,400);assert.equal(writes,0);assert.equal(refreshes,0);
 assert.equal((await route.PATCH(request({action:'decision',id:a,state:'watch'}))).status,200);assert.equal(writes,1);
 assert.equal((await route.POST(request({action:'refresh'}))).status,200);assert.equal(refreshes,1);assert.equal((await route.GET()).headers.get('cache-control'),'no-store');
});
test('worker HTTP validates CRON_SECRET before DB work and reports persistence failures honestly',async()=>{
 const prior=process.env.CRON_SECRET;process.env.CRON_SECRET='x'.repeat(32);let calls=0;
 try{const route=moduleAt('src/app/api/jarvis/intelligence/worker/route.ts',{'@/lib/intelligence/worker':{runIntelligenceWorker:async()=>{calls++;return {receipts:[{owner_id:a,status:'failed',reason:'Could not save.'}]}}}});
 assert.equal((await route.POST(new Request('https://jarvis.example/api/jarvis/intelligence/worker',{method:'POST'}))).status,401);assert.equal(calls,0);
 assert.equal((await route.POST(new Request('https://jarvis.example/api/jarvis/intelligence/worker',{method:'POST',headers:{authorization:`Bearer ${'x'.repeat(32)}`}}))).status,503);assert.equal(calls,1);
 }finally{if(prior===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=prior;}
});
test('freshness suppresses stale/failed/deadline-expired evidence and ranks distinct operational categories',()=>{
 const internalRun=run({source:'internal',applied:true,status:'partial',coverage:[{source:'invoices',status:'ok'},{source:'homeworks',status:'failed'}]});
 const item={...finding({scope:'invoices',evidence:[{...finding().evidence[0],url:`/invoices/${a}`,source_type:'record'}]}),id:a,source:'internal',state:'new',outcome:null,source_active:true,observed_at:iso,created_at:iso,updated_at:iso};
 assert.match(model.annotateItem(item,internalRun,now).stale_reason,/Homeworks/);
 const ext={...item,...finding(),source:'external'};assert.equal(model.annotateItem(ext,{...run(),applied:true},now).stale,false);assert.equal(model.annotateItem(ext,{...run(),applied:true,status:'failed'},now).stale,true);
 assert.equal(model.annotateItem({...ext,deadline:new Date(now.getTime()-1).toISOString()},{...run(),applied:true},now).stale,true);
 const items=[{...item,dedup_key:'invoices:a',priority:99,stale:false},{...item,dedup_key:'invoices:b',priority:98,stale:false},{...item,scope:'jobs',dedup_key:'jobs:planned-rate',priority:70,stale:false},{...item,scope:'jobs',dedup_key:'jobs:record-gaps',priority:60,stale:false}];assert.deepEqual(model.topDecisions(items).map(i=>i.dedup_key),['invoices:a','jobs:planned-rate','jobs:record-gaps']);
});
test('quotes require recorded sent age and no response; pricing excludes missing hours without inventing money',()=>{
 const at=new Date('2026-10-11T12:00:00Z');const q={id:a,quote_number:'Q-1',status:'sent',total:null,sent_at:'2026-09-20T12:00:00Z',accepted_at:null,declined_at:null,valid_until:null,homeworks_deleted:false};
 const results=diagnostics.buildDiagnostics({quotes:[q,{...q,id:b,accepted_at:iso},{...q,id:token,sent_at:null},{...q,id:'expired',valid_until:'2026-01-01'},{...q,id:'demo',client:{data_source:'demo'}}],jobs:[{id:a,status:'scheduled',price:260,budgeted_hours:null,actual_hours:null,crew_size:null,scheduled_date:'2026-10-12',scheduled_start_time:null,homeworks_deleted:false}]},model.DEFAULT_INTELLIGENCE_SETTINGS,at);
 const quotes=results.filter(f=>f.scope==='quotes');assert.equal(quotes.length,1);assert.equal(quotes[0].impact.amount,null);assert.equal(quotes[0].impact.unit,null);assert.match(quotes[0].prepared.content,/UNSENT/);assert.equal(results.filter(f=>f.impact.kind==='planned_rate').length,0);assert.match(results.find(f=>f.scope==='jobs').facts.join(' '),/availability.*not read/);
});
test('database handles expired lease recovery, disabled settings, invalid direct outcomes, and failed-source retention',async()=>{const db=await database();try{
 const first=(await as(db,'service_role','','select jarvis_claim_intelligence($1,$2,true) receipt',[a,token])).rows[0].receipt;
 await as(db,'service_role','',`update jarvis_intelligence_settings set lease_until=now()-interval '1 minute',last_internal_started_at=now()-interval '20 minutes' where owner_id='${a}'`);
 const next=(await as(db,'service_role','','select jarvis_claim_intelligence($1,$2,true) receipt',[a,b])).rows[0].receipt;assert.equal(next.claimed,true);
 const cov=['invoices','quotes','jobs','homeworks','quickbooks'].map(source=>({source,status:source==='quickbooks'?'unverified':'ok',checked_at:new Date().toISOString(),records:source==='quickbooks'?null:1,detail:'Actual test read.'}));
 const input=run({source:'internal',run_key:`internal:${b}`,lease_token:b,started_at:next.started_at,finished_at:new Date().toISOString(),coverage:cov});
 const f=finding({scope:'invoices',evidence:[{...finding().evidence[0],url:`/invoices/${a}`,source_type:'record'}],validation:null});
 await assert.rejects(()=>ingest(db,{...input,run_key:`internal:${token}`,lease_token:token,started_at:first.started_at},[f]),/lease/);await ingest(db,input,[f]);
 const id=(await as(db,'authenticated',a,'select id from jarvis_intelligence_items')).rows[0].id;
 await assert.rejects(()=>as(db,'authenticated',a,'select jarvis_update_intelligence($1)',[JSON.stringify({action:'outcome',id,notes:'invalid',realized_revenue:-1,realized_savings:null,hours_saved:null})]),/Invalid outcome/);
 await as(db,'service_role','',`update jarvis_intelligence_settings set last_internal_started_at=now()-interval '20 minutes' where owner_id='${a}'`);
 const third=(await as(db,'service_role','','select jarvis_claim_intelligence($1,$2,true) receipt',[a,token])).rows[0].receipt;
 const coverage=cov.map(c=>c.source==='invoices'?{...c,status:'failed',records:null}:c);
 await ingest(db,{...input,run_key:`internal:${token}`,lease_token:token,started_at:third.started_at,finished_at:new Date().toISOString(),status:'partial',coverage},[]);
 assert.equal((await as(db,'authenticated',a,'select * from jarvis_intelligence_items')).rows[0].source_active,true);
 await as(db,'authenticated',a,'select jarvis_update_intelligence($1)',[JSON.stringify({action:'preferences',enabled:false,hourly_target:130,interests:[],watches:[]})]);
 assert.equal((await as(db,'service_role','','select jarvis_claim_intelligence($1,$2,true) receipt',[a,token])).rows[0].receipt.reason,'disabled');await assert.rejects(()=>ingest(db),/disabled/);
 }finally{await db.close();}});
test('worker requires every canonical Homeworks checkpoint, including missing archive/deletion partitions',async()=>{
 const {HOMEWORKS_STREAMS}=moduleAt('src/lib/integrations/homeworks-auto-streams.ts');
 const worker=moduleAt('src/lib/intelligence/worker.ts',{'@/lib/supabase/admin':{createSupabaseAdminClient:()=>{throw new Error('Unexpected admin construction')}}});
 const invoices=[{id:a,invoice_number:'INV-1',status:'sent',total:100,amount_paid:20,due_date:'2026-01-01',homeworks_deleted:false}];
 const fresh=HOMEWORKS_STREAMS.map(s=>({stream:s.key,last_success_at:new Date().toISOString(),last_error:null}));
 const incomplete=workerDb({invoices,homeworks_sync_state:[fresh.find(s=>s.stream==='customers_false')]});
 assert.equal((await worker.scanIntelligenceOwner(incomplete.db,a,true)).status,'partial');
 const coverage=incomplete.imports[0].p_run.coverage.find(c=>c.source==='homeworks');assert.equal(coverage.status,'failed');assert.equal(coverage.records,null);assert.match(coverage.detail,/missing/);assert.match(coverage.detail,new RegExp(String(HOMEWORKS_STREAMS.length-1)+' missing'));
 const complete=workerDb({invoices,homeworks_sync_state:fresh});assert.equal((await worker.scanIntelligenceOwner(complete.db,a,true)).status,'completed');assert.equal(complete.imports[0].p_run.coverage.find(c=>c.source==='homeworks').records,HOMEWORKS_STREAMS.length);
 for(const change of [{last_error:'Actual sync failure'},{last_success_at:new Date(Date.now()-31*60000).toISOString()}]){
  const failed=workerDb({homeworks_sync_state:fresh.map((s,i)=>i===fresh.length-1?{...s,...change}:s)});assert.equal((await worker.scanIntelligenceOwner(failed.db,a,true)).status,'partial');assert.equal(failed.imports[0].p_run.coverage.find(c=>c.source==='homeworks').status,'failed');
 }
});
test('storage keeps an older high-priority New action in top despite 100 newer Watch records',async()=>{
 const storage=moduleAt('src/lib/intelligence/storage.ts',{'@/lib/jarvis/background-auth':{activityOwner:async()=>{throw new Error('Not used')},ActivityError:class extends Error{}}});
 const latest={...run(),id:token,item_count:0,applied:true,owner_id:a};
 const row=(id,state,priority,observed_at)=>({id,owner_id:a,source:'external',dedup_key:`research:${id}`,payload:finding({dedup_key:`research:${id}`,priority}),state,outcome:null,observed_at,source_active:true,created_at:observed_at,updated_at:observed_at});
 const action=row(a,'new',99,new Date(now.getTime()-3600000).toISOString());
 const watched=Array.from({length:100},(_,i)=>row(`watch-${i}`,'watch',20,iso));
 const tables={jarvis_intelligence_items:[...watched,action],jarvis_intelligence_settings:[{owner_id:a,...model.DEFAULT_INTELLIGENCE_SETTINGS}],jarvis_intelligence_runs:[latest]};
 const rpcCalls=[];
 const query=rows=>{let filters=[],orders=[],limit=Infinity,single=false;const q={select:()=>q,eq:(key,value)=>{filters.push(r=>r[key]===value);return q},in:(key,values)=>{filters.push(r=>values.includes(r[key]));return q},order:(key,{ascending=true}={})=>{orders.push([key,ascending]);return q},limit:value=>{limit=value;return q},maybeSingle:()=>{single=true;return q},then(resolve,reject){const matches=rows.filter(r=>filters.every(f=>f(r))).sort((a,b)=>{for(const [key,ascending]of orders){if(a[key]!==b[key])return(a[key]<b[key]?-1:1)*(ascending?1:-1)}return 0}).slice(0,limit);return Promise.resolve({data:single?matches[0]??null:matches,error:null}).then(resolve,reject)}};return q};
 const db={from:table=>query(tables[table]),rpc:(name,args)=>{rpcCalls.push({name,args});return query([action])}};
 const snapshot=await storage.readIntelligence(db,a,now);assert.equal(snapshot.has_more,true);assert.equal(snapshot.items.length,100);assert.equal(snapshot.top.length,1);assert.equal(snapshot.top[0].id,a);assert.equal(snapshot.top[0].priority,99);assert.equal(snapshot.top[0].stale,false);assert.equal(rpcCalls[0].name,'jarvis_intelligence_candidates');
});
test('database candidate read ranks numeric current actions before bounds, remains owner isolated and diversifies categories',async()=>{const db=await database();try{
 await ingest(db,run(),[finding({dedup_key:'research:high',priority:100}),finding({dedup_key:'research:nine',priority:9}),finding({dedup_key:'research:ninety',priority:90})]);
 assert.deepEqual((await as(db,'authenticated',a,'select dedup_key from jarvis_intelligence_candidates()')).rows.map(r=>r.dedup_key),['research:high','research:ninety','research:nine']);
 assert.equal((await as(db,'authenticated',b,'select * from jarvis_intelligence_candidates()')).rows.length,0);
 await assert.rejects(()=>as(db,'anon','','select * from jarvis_intelligence_candidates()'),/permission denied/);
 await as(db,'service_role','',`update jarvis_intelligence_items set payload=jsonb_set(payload,'{expires_at}',to_jsonb((now()-interval '1 minute')::text)) where dedup_key='research:high'`);
 assert.deepEqual((await as(db,'authenticated',a,'select dedup_key from jarvis_intelligence_candidates()')).rows.map(r=>r.dedup_key),['research:ninety','research:nine']);
 await as(db,'service_role','',`update jarvis_intelligence_items set state='watch' where dedup_key='research:ninety'`);
 assert.equal((await as(db,'authenticated',a,'select * from jarvis_intelligence_candidates()')).rows[0].dedup_key,'research:nine');
 await as(db,'service_role','',`update jarvis_intelligence_runs set finished_at=now()-interval '151 minutes' where source='external'`);
 assert.equal((await as(db,'authenticated',a,'select * from jarvis_intelligence_candidates()')).rows.length,0);
 const claim=(await as(db,'service_role','','select jarvis_claim_intelligence($1,$2,true) receipt',[a,token])).rows[0].receipt;
 const coverage=['invoices','quotes','jobs','homeworks','quickbooks'].map(source=>({source,status:source==='quickbooks'?'unverified':'ok',checked_at:new Date().toISOString(),records:source==='quickbooks'?null:1,detail:'Verified synthetic source.'}));
 const internalItem=(key,scope,priority)=>finding({dedup_key:key,scope,priority,validation:null,evidence:[{...finding().evidence[0],url:`/${scope}/${a}`,source_type:'record'}]});
 await ingest(db,run({source:'internal',run_key:`internal:${token}`,lease_token:token,started_at:claim.started_at,finished_at:new Date().toISOString(),coverage}),[internalItem('invoices:first','invoices',99),internalItem('invoices:second','invoices',98),internalItem('jobs:rate','jobs',80)]);
 assert.deepEqual((await as(db,'authenticated',a,'select dedup_key from jarvis_intelligence_candidates()')).rows.map(r=>r.dedup_key),['invoices:first','jobs:rate']);
 await as(db,'service_role','',`update jarvis_intelligence_runs set finished_at=now() where source='external'`);
 await as(db,'service_role','',`insert into jarvis_intelligence_items(owner_id,source,dedup_key,payload,observed_at) select $1,'external','research:bulk-'||n,jsonb_set(jsonb_set($2::jsonb,'{dedup_key}',to_jsonb('research:bulk-'||n)),'{priority}','30'),now() from generate_series(1,120) n`,[a,JSON.stringify(finding())]);
 const bounded=(await as(db,'authenticated',a,'select * from jarvis_intelligence_candidates()')).rows;assert.equal(bounded.length,101);assert.equal(bounded[0].dedup_key,'invoices:first');assert.equal(bounded[1].dedup_key,'jobs:rate');assert.equal(bounded.filter(r=>r.payload.scope==='invoices').length,1);
 await as(db,'service_role','',`update jarvis_intelligence_settings set enabled=false where owner_id='${a}'`);assert.equal((await as(db,'authenticated',a,'select * from jarvis_intelligence_candidates()')).rows.length,0);
 }finally{await db.close();}});
