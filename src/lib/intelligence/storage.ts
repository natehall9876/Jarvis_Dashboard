import type { SupabaseClient } from '@supabase/supabase-js';
import { activityOwner, ActivityError } from '@/lib/jarvis/background-auth';
import { annotateItem, DEFAULT_INTELLIGENCE_SETTINGS, IntelligenceError, runStale, topDecisions, unverifiedCoverage } from './model';
import type { IntelligenceAction, IntelligenceFinding, IntelligenceItem, IntelligenceRun, IntelligenceSettings, IntelligenceSnapshot } from './types';

export async function intelligenceOwner() {
  try { return await activityOwner(); }
  catch (e) { throw new IntelligenceError(e instanceof ActivityError ? e.message.replaceAll('activity', 'intelligence') : 'Owner access is unavailable.', e instanceof ActivityError ? e.status : 503); }
}
export function intelligenceFailure(error: unknown) {
  return Response.json({ error: error instanceof IntelligenceError ? error.message : 'Intelligence storage is unavailable. Retry after checking setup.' }, { status: error instanceof IntelligenceError ? error.status : 503, headers: { 'Cache-Control': 'no-store' } });
}
export function checkStorage(error: { message: string } | null) {
  if (error) throw new IntelligenceError('Intelligence storage could not complete this request.', 503);
}
const runColumns = 'id,source,run_key,started_at,finished_at,status,summary,coverage,item_count,applied';
const itemColumns = 'id,source,dedup_key,payload,state,outcome,observed_at,source_active,created_at,updated_at';
type StoredItem = Omit<IntelligenceItem, keyof IntelligenceFinding | 'stale' | 'stale_reason'> & { payload: IntelligenceFinding };
export async function readIntelligence(db: SupabaseClient, ownerId: string, now = new Date()): Promise<IntelligenceSnapshot> {
  const [settingsResult, active, outcomes, history, internal, external, candidates] = await Promise.all([
    db.from('jarvis_intelligence_settings').select('enabled,hourly_target,interests,watches,research_automation_id,research_cadence').eq('owner_id', ownerId).maybeSingle(),
    db.from('jarvis_intelligence_items').select(itemColumns).eq('owner_id', ownerId).in('state', ['new', 'accepted', 'watch']).order('source_active', { ascending: false }).order('observed_at', { ascending: false }).limit(101),
    db.from('jarvis_intelligence_items').select(itemColumns).eq('owner_id', ownerId).in('state', ['dismissed', 'completed']).order('updated_at', { ascending: false }).limit(51),
    db.from('jarvis_intelligence_runs').select(runColumns).eq('owner_id', ownerId).order('started_at', { ascending: false }).limit(20),
    db.from('jarvis_intelligence_runs').select(runColumns).eq('owner_id', ownerId).eq('source', 'internal').eq('applied', true).order('started_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('jarvis_intelligence_runs').select(runColumns).eq('owner_id', ownerId).eq('source', 'external').eq('applied', true).order('started_at', { ascending: false }).limit(1).maybeSingle(),
    // Independent current/ranked selection: Watch/history volume cannot hide actions.
    db.rpc('jarvis_intelligence_candidates').select(itemColumns),
  ]);
  for (const r of [settingsResult, active, outcomes, history, internal, external, candidates]) checkStorage(r.error);
  const candidateRows = candidates.data ?? [];
  if (!Array.isArray(candidateRows)) throw new IntelligenceError('Intelligence candidates returned an invalid response.', 503);
  const settings = (settingsResult.data ?? { ...DEFAULT_INTELLIGENCE_SETTINGS }) as IntelligenceSettings;
  const latest = { internal: internal.data as IntelligenceRun | null, external: external.data as IntelligenceRun | null };
  const annotate = (row: StoredItem): IntelligenceItem => {
    const { payload, ...stored } = row as StoredItem;
    const item = annotateItem({ ...payload, ...stored, stale: false, stale_reason: null }, latest[stored.source], now);
    return settings.enabled ? item : { ...item, stale: true, stale_reason: 'Intelligence is disabled in preferences.' };
  };
  const items = [...(active.data ?? []).slice(0, 100), ...(outcomes.data ?? []).slice(0, 50)].map(row => annotate(row as StoredItem)).sort((a, b) => b.priority - a.priority || a.dedup_key.localeCompare(b.dedup_key));
  const top = topDecisions((candidateRows.slice(0, 100) as StoredItem[]).map(annotate));
  const sources = [...(latest.internal?.coverage ?? []), ...(latest.external?.coverage ?? [])];
  if (!sources.some(s => s.source === 'quickbooks')) sources.push(unverifiedCoverage(now.toISOString()));
  const limitations = [
    'Source reads are bounded: overdue invoices; sent quotes; jobs from the past 31 days through the next 7 days. Larger sources fail visibly instead of publishing a partial total.',
    'Planned price per budgeted hour is not actual production or profit. Job costs, crew availability and accounting balances are unverified; use Connections for accounting access.',
    'Priority is a heuristic. Drafts are prepared, never sent. Actual outcomes are owner-reported and not proven causal lift.',
    'A configured schedule is not proof of a run. Internal and external execution timestamps are reported separately.',
  ];
  if (!settings.enabled) limitations.unshift('Intelligence is disabled; stored items are retained and no new scans will publish.');
  return { settings, items, top, runs: (history.data ?? []) as IntelligenceRun[], coverage: { internal: { last_run: latest.internal, stale: runStale(latest.internal, 'internal', now) }, external: { last_run: latest.external, stale: runStale(latest.external, 'external', now) }, sources, limitations }, has_more: candidateRows.length > 100 || (active.data?.length ?? 0) > 100 || (outcomes.data?.length ?? 0) > 50, generated_at: now.toISOString() };
}
/** Authenticated read shared by the page API and the read-only advisor tool. */
export async function getIntelligence(): Promise<IntelligenceSnapshot> {
  const { db, ownerId } = await intelligenceOwner();
  return readIntelligence(db, ownerId);
}
export async function updateIntelligence(db: SupabaseClient, action: Exclude<IntelligenceAction, { action: 'refresh' }>) {
  const result = await db.rpc('jarvis_update_intelligence', { p_action: action });
  if (result.error) throw new IntelligenceError('The change was not saved. Check the item state and retry; completed or dismissed items must return to Watch first.', 409);
}
