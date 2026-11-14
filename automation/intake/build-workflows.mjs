import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareReview} from './prepare-review.cjs';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const code = `${prepareReview.toString()}\nreturn $input.all().flatMap((item) => prepareReview(item.json).map((json) => ({json})));`;
const demo = {
  inquiries: [
    {source:'synthetic-demo', source_id:'demo-1', received_at:'2026-11-13T16:00:00-05:00', name:'Example Customer', phone:'401-555-0101', town:'Smithfield', region:'RI', service_requested:'Fall cleanup', message:'Could I get an estimate?'},
    {source:'synthetic-demo', source_id:'demo-2', received_at:'2026-11-13T16:05:00-05:00', name:'Example Customer', phone:'+1 (401) 555-0101', town:'Smithfield', region:'RI', service_requested:'Fall cleanup', message:'Following up on the estimate.'},
  ],
  existing_contacts: [{id:'synthetic-contact-1', phone:'14015550101'}],
};
const base = (name, nodes, connections) => ({name, active:false, nodes, connections, settings:{executionOrder:'v1', timezone:'America/New_York', saveManualExecutions:true}, pinData:{}, tags:[]});
const prepare = {id:'prepare-review', name:'Prepare draft-only review', type:'n8n-nodes-base.code', typeVersion:2, position:[340,100], parameters:{mode:'runOnceForAllItems', jsCode:code}};
const output = {id:'review-output', name:'Review output — no sending or CRM writes', type:'n8n-nodes-base.noOp', typeVersion:1, position:[640,100], parameters:{}};
const note = {id:'safety-note', name:'Read before connecting sources', type:'n8n-nodes-base.stickyNote', typeVersion:1, position:[60,-190], parameters:{height:220,width:720,content:'## Draft-only intake review\nAccepts { inquiries: [...], existing_contacts: [...] }. No credentials, schedules, webhook, database writes or send nodes. Returns every source record, duplicate candidates and draft text. Match candidates require review; never auto-merge. Output is not a durable master tracker. Use an authenticated staging writer only after its separate implementation and tests.'}};
const trigger = {id:'intake-input',name:'Intake input',type:'n8n-nodes-base.executeWorkflowTrigger',typeVersion:1.1,position:[40,100],parameters:{inputSource:'passthrough'}};
const connections = {'Intake input':{main:[[{node:prepare.name,type:'main',index:0}]]}, [prepare.name]:{main:[[{node:output.name,type:'main',index:0}]]}};
const intake = base('WeedEater — Draft-only intake review', [trigger,prepare,output,note], connections);
const manual = {id:'manual',name:'Run synthetic demo',type:'n8n-nodes-base.manualTrigger',typeVersion:1,position:[-250,100],parameters:{}};
const fixture = {id:'fixture',name:'Synthetic fixture only',type:'n8n-nodes-base.code',typeVersion:2,position:[40,100],parameters:{mode:'runOnceForAllItems',jsCode:`return [{json:${JSON.stringify(demo,null,2)}}];`}};
const demoWorkflow = base('WeedEater — Synthetic intake demo (no live data)',[manual,fixture,prepare,output,note],{'Run synthetic demo':{main:[[{node:fixture.name,type:'main',index:0}]]},[fixture.name]:{main:[[{node:prepare.name,type:'main',index:0}]]},[prepare.name]:connections[prepare.name]});
for (const [file,value] of [['draft-only-intake.n8n.json',intake],['synthetic-demo.n8n.json',demoWorkflow],['input.example.json',demo]]) fs.writeFileSync(path.join(__dirname,file),JSON.stringify(value,null,2)+'\n');
