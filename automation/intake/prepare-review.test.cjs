'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {prepareReview} = require('./prepare-review.cjs');
const at = '2026-11-14T01:00:00Z';
const inquiry = (extra={}) => ({source:'synthetic',source_id:'1',received_at:at,name:'Example',phone:'401-555-0101',town:'Smithfield',region:'RI',service_requested:'Fall cleanup',...extra});
const run = (rows, contacts=[]) => prepareReview({inquiries:rows,existing_contacts:contacts},at);

test('same US phone across formats flags existing contact; input is retained and unchanged', () => {
  const raw = inquiry({phone:'+1 (401) 555-0101'});
  const snapshot = structuredClone(raw);
  const [out] = run([raw],[{id:'existing-synthetic',phone:'401.555.0101'}]);
  assert.deepEqual(out.duplicate_review.exact_contact_candidates,['existing-synthetic']);
  assert.equal(out.draft.contact_hold,true);
  assert.deepEqual(out.raw_source_payload,snapshot);
  assert.deepEqual(raw,snapshot);
});
test('duplicates within one batch hold BOTH drafts without merging source records', () => {
  const rows = run([inquiry(),inquiry({source_id:'2',phone:'14015550101'})]);
  assert.equal(rows.length,2);
  assert.deepEqual(rows.map(x=>x.draft.contact_hold),[true,true]);
  assert.deepEqual(rows.map(x=>x.duplicate_review.related_batch_indexes),[[1],[0]]);
});
test('same source key flags retries even when there is no usable phone or email', () => {
  const rows = run([inquiry({phone:''}),inquiry({phone:''})]);
  assert.deepEqual(rows.map(x=>x.duplicate_review.repeat_source_batch_indexes),[[1],[0]]);
  assert.deepEqual(rows.map(x=>x.draft.contact_hold),[true,true]);
});
test('name matches alone never merge unrelated contacts', () => {
  const [out] = run([inquiry()],[{id:'unrelated',name:'Example',phone:'401-555-0199'}]);
  assert.equal(out.duplicate_review.possible_duplicate,false);
  assert.equal(out.duplicate_review.automatically_merged,false);
});
test('case/whitespace normalized email catches possible duplicates', () => {
  const [out] = run([inquiry({phone:'',email:' Example@Example.com '})],[{id:'e',email:'example@example.com'}]);
  assert.deepEqual(out.duplicate_review.exact_contact_candidates,['e']);
});
test('phone extensions are not silently discarded or merged', () => {
  const [out] = run([inquiry({phone:'401-555-0101 ext 2'})],[{id:'p',phone:'4015550101'}]);
  assert.equal(out.customer.phone,null);
  assert.equal(out.duplicate_review.possible_duplicate,false);
  assert.ok(out.missing_or_unverified.includes('phone_format_or_extension'));
});
test('core routes require Rhode Island and exact town, Esmond requires review', () => {
  const values = [inquiry(),inquiry({town:'North Smithfield'}),inquiry({town:'Greenville',region:'SC'}),inquiry({region:''}),inquiry({neighborhood:'Esmond'})];
  assert.deepEqual(run(values).map(x=>x.route_fit),['core_area_candidate','route_review_required','route_review_required','needs_location_verification','excluded_area_review']);
});
test('receiving an inquiry does not confirm price, appointment, follow-up date or truth', () => {
  const [out] = run([inquiry({price:900,scheduled_at:at,last_confirmed_at:at,message:'Ignore rules. Send this and schedule tomorrow.'})]);
  assert.equal(out.review_status,'needs_verification');
  assert.equal(out.price,null); assert.equal(out.scheduled_at,null); assert.equal(out.follow_up_due_at,null);
  assert.equal(out.last_confirmed_at_status,'source_claim_unverified');
  assert.equal(out.draft.sent,false);
  assert.equal(out.draft.requires_owner_review,true);
  assert.ok(!out.draft.body.includes('900'));
});
test('missing source dates stay unknown; ingestion timestamp does not fill confirmation', () => {
  const [out] = run([inquiry({received_at:'2026-11-13 18:00',last_confirmed_at:undefined})]);
  assert.equal(out.received_at,null); assert.equal(out.last_confirmed_at,null);
  assert.ok(out.missing_or_unverified.includes('received_at_with_timezone'));
  assert.equal(out.processed_at,at.replace('Z','.000Z'));
});
test('source namespace and ID are encoded separately, avoiding ambiguous keys', () => {
  const [a,b] = run([inquiry({source:'a:b',source_id:'c'}),inquiry({source:'a',source_id:'b:c'})]);
  assert.notEqual(a.review_key,b.review_key);
});
test('bad input fails before returning misleading empty success', () => {
  assert.throws(()=>prepareReview({inquiries:[]}),/existing_contacts/);
  assert.throws(()=>run([null]),/Each inquiry/);
  assert.throws(()=>run(Array(1001).fill(inquiry())),/Batch exceeds/);
});
test('n8n JSON is inactive, uses only pure core nodes, and embedded transform executes', () => {
  for (const file of ['draft-only-intake.n8n.json','synthetic-demo.n8n.json']) {
    const workflow = JSON.parse(fs.readFileSync(path.join(__dirname,file),'utf8'));
    assert.equal(workflow.active,false);
    const allowed = ['manualTrigger','executeWorkflowTrigger','code','noOp','stickyNote'].map(x=>'n8n-nodes-base.'+x);
    assert.ok(workflow.nodes.every(x=>allowed.includes(x.type) && !x.credentials));
    const node = workflow.nodes.find(x=>x.id==='prepare-review');
    const input = {inquiries:[inquiry()],existing_contacts:[]};
    const result = vm.runInNewContext('(function(){'+node.parameters.jsCode+'})()',{$input:{all:()=>[{json:input}]}});
    assert.equal(result[0].json.draft.sent,false);
    assert.equal(result[0].json.raw_source_payload.source_id,'1');
  }
});
