import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

function moduleAt(file, mocks) {
  const abs = path.resolve(file), mod = { exports: {} }, req = createRequire(abs);
  const resolve = id => id in mocks ? mocks[id] : id.startsWith('@/')
    ? moduleAt(`src/${id.slice(2)}.ts`, mocks) : req(id);
  const code = ts.transpileModule(fs.readFileSync(abs, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  new Function('require', 'module', 'exports', code)(resolve, mod, mod.exports);
  return mod.exports;
}
const owner = '00000000-0000-4000-8000-000000000001';
function fixture(type) {
  const table = type === 'create_task' ? 'owner_tasks' : 'job_notes';
  const state = { rows: new Map(), ids: [], user: owner, readError: false, responseFailure: false, insertError: null, logFailure: false };
  const db = {
    auth: { getUser: async () => ({ data: { user: state.user ? { id: state.user } : null } }) },
    from(name) {
      let values, id;
      const q = {
        insert(v) { values = v; return q; },
        select() { return q; },
        eq(k, v) { assert.equal(k, 'id'); id = v; return q; },
        maybeSingle() { return q; },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            // Deliberately exercise the unchanged action_requests memory fallback.
            if (name === 'action_requests') return { error: { code: '42P01', message: 'missing' }, data: null };
            assert.equal(name, table);
            if (values) {
              state.ids.push(values.id);
              if (state.insertError) return { error: state.insertError, data: null };
              if (state.rows.has(values.id)) return { error: { code: '23505', message: 'duplicate PK' }, data: null };
              state.rows.set(values.id, { status: 'open', completed_at: null, client_id: null, property_id: null, ...values });
              if (state.responseFailure) throw new Error('Lost insert response after commit');
              return { error: null, data: null };
            }
            const data = state.rows.get(id) ?? null;
            return { data, error: state.readError ? { code: '08006', message: 'read unavailable' } : null };
          }).then(resolve, reject);
        },
      };
      return q;
    },
  };
  const mocks = {
    '@/lib/supabase/server': { createSupabaseServerClient: async () => db },
    '@/lib/data/jobs': { getJobById: async () => ({ error: null, data: { scheduled_date: null } }) },
    '@/lib/actions/jobs': {},
    '@/lib/data/activity-log': { logActivity: async () => { if (state.logFailure) throw new Error('Logging unavailable'); } },
  };
  const load = () => moduleAt('src/lib/ai/actions/execute.ts', mocks).executeProposedAction;
  const action = { kind: 'proposed_action', id: 'action-1', type, title: 'Test', proposed: {}, requiresConfirmation: true,
    target: { type: 'job', id: 'job-1' }, payload: type === 'create_task'
      ? { title: 'Bring tools', notes: 'Original', due_date: '2026-10-12', job_id: 'job-1' } : { note: 'Original note' } };
  return { state, action, load };
}

for (const type of ['add_job_note', 'create_task']) {
  for (const mode of ['readError', 'responseFailure', 'logFailure']) {
    test(`${type}: committed insert survives ${mode}, retry and restart with one PK`, async () => {
      const { state, action, load } = fixture(type), run = load();
      state[mode] = true;
      assert.equal((await run(action)).ok, false);
      assert.equal(state.rows.size, 1);
      // Read errors remain unverified even if the adapter also supplies data.
      if (mode === 'readError') assert.equal((await run(action)).ok, false);
      state[mode] = false;
      assert.equal((await run(action)).ok, true);
      assert.equal((await load()(action)).ok, true);
      assert.equal(state.rows.size, 1);
      assert.equal(new Set(state.ids).size, 1);
      assert.match(state.ids[0], /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });
  }
  test(`${type}: independent concurrent attempts are arbitrated by the native PK`, async () => {
    const { state, action, load } = fixture(type);
    const results = await Promise.all([load()(action), load()(action)]);
    assert.equal(results.every(r => r.ok), true);
    assert.equal(state.rows.size, 1);
    assert.equal(state.ids.length, 2);
    assert.equal(new Set(state.ids).size, 1);
  });
  test(`${type}: changed payload and foreign owner row cannot recover success`, async () => {
    const { state, action, load } = fixture(type);
    assert.equal((await load()(action)).ok, true);
    const changed = structuredClone(action);
    changed.payload[type === 'create_task' ? 'title' : 'note'] = 'Different';
    assert.equal((await load()(changed)).reason, 'stale');
    assert.equal(state.rows.size, 1);
    const row = [...state.rows.values()][0];
    row.created_by = 'another-owner';
    assert.equal((await load()(action)).reason, 'stale');
    assert.equal(row.created_by, 'another-owner');
  });
  test(`${type}: owner identity scopes the PK and authentication is required`, async () => {
    const { state, action, load } = fixture(type);
    assert.equal((await load()(action)).ok, true);
    state.user = '00000000-0000-4000-8000-000000000002';
    assert.equal((await load()(action)).ok, true);
    assert.equal(new Set(state.ids).size, 2);
    state.user = null;
    assert.equal((await load()(action)).reason, 'auth');
    assert.equal(state.rows.size, 2);
  });
  test(`${type}: other database errors and invalid keys remain truthful failures`, async () => {
    const { state, action, load } = fixture(type);
    for (const code of ['42501', '23503', '08006']) {
      state.insertError = { code, message: 'Insert denied' };
      const result = await load()(action);
      assert.equal(result.ok, false);
      assert.equal(result.message, 'Insert denied');
      assert.equal(state.rows.size, 0);
    }
    for (const id of ['', 'a'.repeat(129), 'bad key']) {
      assert.equal((await load()({ ...action, id })).reason, 'invalid');
    }
  });
}
test('edited/completed task is never overwritten or falsely verified', async () => {
  for (const edit of [{ title: 'Edited' }, { notes: 'Edited' }, { due_date: null }, { job_id: null },
    { status: 'done', completed_at: '2026-10-12' }, { client_id: 'client' }]) {
    const { state, action, load } = fixture('create_task');
    assert.equal((await load()(action)).ok, true);
    const row = [...state.rows.values()][0];
    Object.assign(row, edit);
    const before = structuredClone(row);
    assert.equal((await load()(action)).reason, 'stale');
    assert.deepEqual(row, before);
    assert.equal(state.rows.size, 1);
  }
});
