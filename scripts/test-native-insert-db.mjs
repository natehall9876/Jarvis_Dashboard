import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const root=process.cwd();
const req=createRequire(path.join(root,'package.json'));
const ts=req('typescript');
const {PGlite}=req('@electric-sql/pglite');
const owner='00000000-0000-4000-8000-000000000001';
const job='00000000-0000-4000-8000-000000000003';
function load(file,mocks){
 const abs=path.resolve(root,file), m={exports:{}}, local=createRequire(abs);
 let source=fs.readFileSync(abs,'utf8');
 if(file==='src/lib/ai/actions/execute.ts'&&process.env.NATIVE_INSERT_SOURCE_REF)
  source=execFileSync('git',['show',process.env.NATIVE_INSERT_SOURCE_REF+':'+file],{cwd:root,encoding:'utf8'});
 const resolve=id=>Object.hasOwn(mocks,id)?mocks[id]:id.startsWith('@/')?load('src/'+id.slice(2)+'.ts',mocks):local(id);
 new Function('require','module','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(resolve,m,m.exports);
 return m.exports;
}
async function fixture(type){
 const db=new PGlite();
 await db.exec("create role authenticated; create schema auth; create table auth.users(id uuid primary key); create table public.jobs(id uuid primary key); create table public.clients(id uuid primary key); create table public.properties(id uuid primary key);");
 await db.query('insert into auth.users values($1)',[owner]);
 await db.query('insert into public.jobs values($1)',[job]);
 await db.exec(fs.readFileSync(path.join(root,'supabase/job-notes-tasks-migration.sql'),'utf8'));
 const state={failRead:false,loseResponse:false,insertAttempts:0};
 const table=type==='create_task'?'owner_tasks':'job_notes';
 const client={auth:{getUser:async()=>({data:{user:{id:owner}}})},from(name){
  let values,returning=false,single=false,filters=[];
  const q={
   insert(v){values=v;return q},select(){returning=true;return q},
   eq(k,v){filters.push([k,v]);return q},single(){single=true;return q},maybeSingle(){single=true;return q},
   then(resolve,reject){return (async()=>{
    if(name==='action_requests')return {error:{code:'42P01',message:'isolated absent action table'},data:null};
    assert.equal(name,table);
    try{
     let rows;
     if(values){
      state.insertAttempts++;
      const keys=Object.keys(values);
      const cols=keys.map(k=>'"'+k.replaceAll('"','""')+'"').join(',');
      rows=(await db.query('insert into '+name+'('+cols+') values('+keys.map((_,i)=>'$'+(i+1)).join(',')+') returning *',Object.values(values))).rows;
      if(state.loseResponse){state.loseResponse=false;throw Object.assign(new Error('lost response after actual PostgreSQL commit'),{lost:true});}
      return {data:returning?(single?rows[0]:rows):null,error:null};
     }
     if(state.failRead)return {data:null,error:{code:'08006',message:'synthetic read transport failure'}};
     const where=filters.map(([k],i)=>'"'+k.replaceAll('"','""')+'"=$'+(i+1)).join(' and ');
     // Match PostgREST JSON date/timestamp serialization rather than driver Date objects.
     rows=(await db.query('select to_jsonb(t) as payload from '+name+' t'+(where?' where '+where:''),filters.map(x=>x[1]))).rows.map(r=>r.payload);
     return {data:single?rows[0]??null:rows,error:null};
    }catch(e){if(e.lost)throw e;return {data:null,error:{code:e.code,message:e.message}};}
   })().then(resolve,reject)}
  };return q;
 }};
 const mocks={'@/lib/supabase/server':{createSupabaseServerClient:async()=>client},'@/lib/data/jobs':{getJobById:async()=>({data:{scheduled_date:null},error:null})},'@/lib/actions/jobs':{},'@/lib/data/activity-log':{logActivity:async()=>{}}};
 const run=()=>load('src/lib/ai/actions/execute.ts',mocks).executeProposedAction;
 const action={kind:'proposed_action',id:'fixture-action',type,title:'test',proposed:{},requiresConfirmation:true,target:{type:'job',id:job},payload:type==='create_task'?{title:'Bring tools',notes:'Original',due_date:'2026-10-12',job_id:job}:{note:'Original note'}};
 const count=async()=>Number((await db.query('select count(*) as n from '+table)).rows[0].n);
 return {db,state,run,action,count};
}
for(const type of ['create_task','add_job_note']){
 for(const mode of ['failRead','loseResponse']){
  test(type+': PostgreSQL committed row + '+mode+' + fresh-process retry stays one row',async()=>{
   const f=await fixture(type);
   try{
    f.state[mode]=true;
    assert.equal((await f.run()(f.action)).ok,false);
    assert.equal(await f.count(),1,'first write really committed in PostgreSQL');
    f.state[mode]=false;
    assert.equal((await f.run()(f.action)).ok,true,'fresh module must verify saved row');
    assert.equal(await f.count(),1,'retry must not create a second business row');
   }finally{await f.db.close()}
  });
 }
 test(type+': two independent executors race on one PostgreSQL PK',async()=>{
  const f=await fixture(type);
  try{
   const results=await Promise.all([f.run()(f.action),f.run()(f.action)]);
   assert.ok(results.every(r=>r.ok),JSON.stringify(results));
   assert.equal(await f.count(),1);
   const ids=results.map(r=>r.result.task_id||r.result.note_id);
   assert.equal(ids[0],ids[1]);
  }finally{await f.db.close()}
 });
 test(type+': changed payload does not overwrite a committed PostgreSQL row',async()=>{
  const f=await fixture(type);
  try{
   assert.equal((await f.run()(f.action)).ok,true);
   const changed=structuredClone(f.action);
   changed.payload[type==='create_task'?'title':'note']='Changed';
   const result=await f.run()(changed);
   assert.equal(result.ok,false);
   assert.equal(result.reason,'stale');
   assert.equal(await f.count(),1);
  }finally{await f.db.close()}
 });
}
