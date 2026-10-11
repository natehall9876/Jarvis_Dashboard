import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { HOMEWORKS_STREAMS } from '@/lib/integrations/homeworks-auto-streams';
import { todayInZone, addDaysISO } from '@/lib/integrations/homeworks-dates';
import { buildDiagnostics, type InvoiceSource, type JobSource, type QuoteSource } from './diagnostics';
import { DEFAULT_INTELLIGENCE_SETTINGS, IntelligenceError, unverifiedCoverage } from './model';
import type { IntelligenceFinding, IntelligenceRunInput, IntelligenceSettings, SourceCoverage } from './types';

type SyncState = { stream: string; last_success_at: string | null; last_error: string | null };
export type IntelligenceWorkerReceipt = { owner_id: string; status: 'completed' | 'partial' | 'failed' | 'skipped'; reason?: string; run_id?: string; item_count?: number; applied?: boolean };
async function verifyOwner(db: SupabaseClient, ownerId: string) {
  const r = await db.from('app_members').select('role,active').eq('user_id', ownerId).maybeSingle();
  if (r.error || !r.data?.active || r.data.role !== 'owner') throw new IntelligenceError('Active owner access could not be verified.', 403);
}
/** Reads shared business projections only after owner verification. These tables
 * have active-owner authority, not tenant columns. No provider token stores read. */
async function readSource(db: SupabaseClient, ownerId: string, source: 'invoices' | 'quotes' | 'jobs' | 'homeworks', now: Date) {
  await verifyOwner(db, ownerId);
  const today = todayInZone(now);
  let query;
  if (source === 'invoices') query = db.from('invoices').select('id,invoice_number,status,total,amount_paid,due_date,homeworks_deleted,client:clients(first_name,last_name,data_source)').lt('due_date', today).not('status', 'in', '(draft,void,paid,cancelled)').order('id');
  else if (source === 'quotes') query = db.from('quotes').select('id,quote_number,status,total,sent_at,accepted_at,declined_at,valid_until,homeworks_deleted,client:clients(first_name,last_name,data_source)').eq('status', 'sent').order('id');
  else if (source === 'jobs') query = db.from('jobs').select('id,status,price,budgeted_hours,actual_hours,crew_size,scheduled_date,scheduled_start_time,homeworks_deleted,service:services(name),property:properties(street,client:clients(data_source))').gte('scheduled_date', addDaysISO(today, -31)).lte('scheduled_date', addDaysISO(today, 7)).order('id');
  else query = db.from('homeworks_sync_state').select('stream,last_success_at,last_error').order('stream');
  const max = source === 'homeworks' ? 50 : 500;
  const r = await query.limit(max + 1).abortSignal(AbortSignal.timeout(10000));
  if (r.error || !Array.isArray(r.data)) throw new Error('Source read failed; previous facts were retained.');
  if (r.data.length > max) throw new Error(`Source exceeds the ${max}-record limit. No partial source result was published.`);
  return r.data;
}
export async function scanIntelligenceOwner(db: SupabaseClient, ownerId: string, force = false): Promise<IntelligenceWorkerReceipt> {
  await verifyOwner(db, ownerId);
  const token = crypto.randomUUID();
  const claim = await db.rpc('jarvis_claim_intelligence', { p_owner: ownerId, p_token: token, p_force: force });
  if (claim.error || !claim.data) throw new IntelligenceError('The scan could not acquire a durable lease.', 503);
  if (!claim.data.claimed) return { owner_id: ownerId, status: 'skipped', reason: claim.data.reason };
  const started = claim.data.started_at as string, now = new Date();
  const sources = ['invoices', 'quotes', 'jobs', 'homeworks'] as const;
  const coverage: SourceCoverage[] = [];
  let findings: IntelligenceFinding[] = [];
  try {
    const p = await db.from('jarvis_intelligence_settings').select('enabled,hourly_target,interests,watches,research_automation_id,research_cadence').eq('owner_id', ownerId).maybeSingle();
    if (p.error || !p.data?.enabled) throw new Error('Intelligence preferences could not be read or were disabled.');
    const settings = { ...DEFAULT_INTELLIGENCE_SETTINGS, ...p.data } as IntelligenceSettings;
    const reads = await Promise.allSettled(sources.map(source => readSource(db, ownerId, source, now)));
    for (let index = 0; index < sources.length; index++) {
      const source = sources[index], result = reads[index], checked_at = new Date().toISOString();
      if (result.status === 'rejected') {
        coverage.push({ source, status: 'failed', checked_at, records: null, detail: result.reason instanceof Error ? result.reason.message : 'Source unavailable; previous facts retained.' });
        continue;
      }
      if (source === 'homeworks') {
        const rows = result.value as unknown as SyncState[];
        const expected = HOMEWORKS_STREAMS.map(s => s.key);
        const byStream = new Map(rows.map(row => [row.stream, row]));
        const missing = expected.filter(key => !byStream.has(key));
        const required = rows.filter(row => expected.includes(row.stream));
        const stale = required.filter(s => s.last_error || !s.last_success_at || !Number.isFinite(Date.parse(s.last_success_at)) || Date.parse(s.last_success_at) < now.getTime() - 30 * 60000);
        const current = missing.length === 0 && stale.length === 0;
        const oldest = required.map(r => r.last_success_at).filter((s): s is string => Boolean(s)).sort()[0];
        coverage.push({ source, status: current ? 'ok' : 'failed', checked_at, records: current ? required.length : null, detail: `${required.length}/${expected.length} required sync streams checked; ${missing.length} missing${missing.length ? ` (${missing.join(', ')})` : ''}; ${stale.length} failed or older than 30 minutes. Oldest successful checkpoint: ${oldest ?? 'unknown'}. Projection reads are distinct from upstream completeness.` });
      } else {
        const rows = result.value as unknown;
        const generated = buildDiagnostics(source === 'invoices' ? { invoices: rows as InvoiceSource[] } : source === 'quotes' ? { quotes: rows as QuoteSource[] } : { jobs: rows as JobSource[] }, settings, now);
        if (generated.length > 40 || generated.some(f => f.prepared.content.length > 12000)) {
          coverage.push({ source, status: 'failed', checked_at, records: null, detail: 'Qualified findings exceed the safe output bound; this source was not partially published.' });
        } else {
          findings.push(...generated);
          coverage.push({ source, status: 'ok', checked_at, records: result.value.length, detail: `${result.value.length} current operational rows read within the documented window; deleted and confirmed demo rows excluded from findings. Unknown amounts/hours stay unknown.` });
        }
      }
    }
  } catch {
    findings = [];
    coverage.splice(0, coverage.length, ...sources.map(source => ({ source, status: 'failed' as const, checked_at: new Date().toISOString(), records: null, detail: 'Scan preparation failed; previous facts retained.' })));
  }
  coverage.push(unverifiedCoverage(new Date().toISOString()));
  const good = coverage.filter(c => c.source !== 'quickbooks' && c.status === 'ok').length;
  const status = good === 4 ? 'completed' : good > 0 ? 'partial' : 'failed';
  const input: IntelligenceRunInput = { source: 'internal', run_key: `internal:${token}`, started_at: started, finished_at: new Date().toISOString(), status, coverage, summary: `${good}/4 operational source checks succeeded; ${findings.length} current findings prepared. QuickBooks accounting was not read.`, lease_token: token };
  const saved = await db.rpc('jarvis_import_intelligence', { p_owner: ownerId, p_run: input, p_items: findings });
  if (saved.error || !saved.data?.run_id) throw new IntelligenceError('The scan result could not be saved; no successful run was claimed.', 503);
  return { owner_id: ownerId, status, run_id: saved.data.run_id, item_count: saved.data.item_count, applied: saved.data.applied };
}
/** Optional owner is passed only by the already authenticated manual-refresh
 * handler, never from a worker HTTP payload. Cron discovers active owners. */
export async function runIntelligenceWorker(ownerId?: string) {
  const db = createSupabaseAdminClient() as unknown as SupabaseClient;
  let owners: string[];
  let has_more = false;
  if (ownerId) owners = [ownerId];
  else {
    const members = await db.from('app_members').select('user_id').eq('role', 'owner').eq('active', true).order('user_id').limit(6);
    if (members.error || !members.data) throw new IntelligenceError('Active owners could not be read.', 503);
    owners = members.data.slice(0, 5).map(m => m.user_id as string);
    has_more = members.data.length > 5;
  }
  const receipts: IntelligenceWorkerReceipt[] = [];
  for (const owner of owners) {
    try { receipts.push(await scanIntelligenceOwner(db, owner, Boolean(ownerId))); }
    catch { receipts.push({ owner_id: owner, status: 'failed', reason: 'The scan did not persist a result. Check storage and owner access.' }); }
  }
  return { receipts, has_more, checked_at: new Date().toISOString() };
}
