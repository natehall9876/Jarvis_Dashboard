'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { IntelligenceAction, IntelligenceSnapshot } from '@/lib/intelligence/types';
import { DecisionCard, stamp } from './decision-card';
import { preferencesAction, requestIntelligence, viewItems, VIEWS, type IntelligenceRequest, type IntelligenceView } from './view-model';
import styles from './intelligence.module.css';

export function IntelligenceDashboard({ initialSnapshot, request = requestIntelligence }: { initialSnapshot?: IntelligenceSnapshot; request?: IntelligenceRequest }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot ?? null);
  const [view, setView] = useState<IntelligenceView>('Act now');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const lock = useRef(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try { const next = await request(undefined, signal); setSnapshot(next); setError(null); }
    catch (error) { if (!signal?.aborted) setError(error instanceof Error ? error.message : 'Intelligence could not be loaded.'); }
    finally { lock.current = false; if (!signal?.aborted) setBusy(false); }
  }, [request]);
  useEffect(() => {
    const initialLoad = !initialSnapshot ? window.setTimeout(() => void load(), 0) : undefined;
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 60_000);
    return () => { window.clearTimeout(initialLoad); window.clearInterval(timer); };
  }, [initialSnapshot, load]);
  async function onAction(action: IntelligenceAction) {
    if (lock.current) return false;
    lock.current = true; setBusy(true); setError(null); setMessage('');
    try {
      const next = await request(action); setSnapshot(next);
      setMessage(action.action === 'refresh' ? 'Internal scan finished. See its recorded result below.' : action.action === 'preferences' ? 'Preferences saved.' : action.action === 'outcome' ? 'Owner-reported outcome saved.' : 'Decision saved.');
      return true;
    } catch (error) { setError(error instanceof Error ? error.message : 'The change could not be confirmed. Retry loading to check the saved state.'); return false; }
    finally { lock.current = false; setBusy(false); }
  }
  const top = snapshot?.top.slice(0, 3) ?? [];
  const items = snapshot ? viewItems(snapshot, view) : [];
  // Top decisions stay above every view; do not repeat them in the Act now list.
  const list = view === 'Act now' ? items.filter(item => !top.some(candidate => candidate.id === item.id)) : items;
  return <div className={styles.root}>
    <header className={styles.header}><div><div className={styles.eyebrow}>Jarvis / Intelligence</div><h1>Decide what moves the business.</h1><p className={styles.secondary}>Evidence, prepared work, and the next action.</p></div><button type="button" disabled={busy || !snapshot?.settings.enabled} onClick={() => void onAction({ action: 'refresh' })}><RefreshCw size={15} aria-hidden="true" />{busy ? 'Checking…' : 'Scan operations'}</button></header>
    {error && <div role="alert" className={styles.error}><p>{error}</p>{snapshot && <p className={styles.muted}>Showing the last loaded snapshot. This error does not mean there are no findings.</p>}<button type="button" disabled={busy} onClick={() => void load()}>Retry loading</button></div>}
    <p role="status" aria-live="polite" className={styles.notice}>{message}</p>
    {!snapshot && !error && <p role="status" className={styles.empty}>Loading decisions and source coverage…</p>}
    {snapshot && <>
      <section className={styles.coverage} aria-label="Execution and coverage">
        {!snapshot.settings.enabled && <p className={styles.warning}>Intelligence is paused. Stored decisions remain available; enable it in preferences to resume scans.</p>}
        <div className={styles.loops}>{(['internal', 'external'] as const).map(source => {
          const loop = snapshot.coverage[source];
          return <div key={source}><div className={styles.loopTitle}>{source === 'internal' ? 'Operations · every 15 minutes' : `Research · ${snapshot.settings.research_cadence ?? 'schedule not configured'}`}</div><p className={loop.stale ? styles.warning : styles.secondary}>{loop.last_run ? `${loop.last_run.status} · ${stamp(loop.last_run.finished_at)}` : 'No observed execution'}{loop.stale && loop.last_run ? ' · stale' : ''}</p>{loop.last_run && <p className={styles.muted}>{loop.last_run.summary}</p>}</div>;
        })}</div>
        <details><summary>Source coverage &amp; limits</summary><div className={styles.detailBody}><ul className={styles.sources}>{snapshot.coverage.sources.map(source => <li key={source.source}><strong>{source.source}</strong> · <span className={source.status !== 'ok' ? styles.warning : undefined}>{source.status}</span><p>{source.detail}</p><p className={styles.muted}>Checked {stamp(source.checked_at)}{source.records !== null ? ` · ${source.records} records read` : ' · Record count unknown'}</p></li>)}</ul><ul>{snapshot.coverage.limitations.map(limit => <li key={limit}>{limit}</li>)}</ul><p className={styles.muted}>Research recurrence: {snapshot.settings.research_automation_id ? `configured (${snapshot.settings.research_cadence ?? 'cadence not recorded'})` : 'not recorded'}. A schedule is not proof of execution.</p></div></details>
        <p className={styles.muted}>Snapshot {stamp(snapshot.generated_at)} · All times Eastern. Checked again every minute while this page is visible.</p>
      </section>
      <section aria-labelledby="intelligence-top"><h2 id="intelligence-top">Top decisions</h2><p className={styles.muted}>Up to three current actions, ranked by evidence and urgency. Saving a decision does not send a draft or change source records.</p><div className={styles.top}>{top.length ? top.map((item, index) => <DecisionCard key={item.id} item={item} rank={index + 1} busy={busy} onAction={onAction} />) : <p className={styles.empty}>No current decisions qualify. Check source coverage; stored findings remain in Watch and Outcomes.</p>}</div></section>
      <section aria-labelledby="intelligence-views"><h2 id="intelligence-views">Decision desk</h2><div className={styles.tabs} aria-label="Decision views">{VIEWS.map(option => <button type="button" key={option} aria-pressed={view === option} onClick={() => setView(option)}>{option}</button>)}</div><p className={styles.muted}>{view === 'Act now' ? 'Additional current actions beyond the top decisions.' : view === 'Ready for review' ? 'Actual prepared packets for current decisions. Review before taking a separate business action.' : view === 'Watch' ? 'Decisions you are watching and findings that need fresh evidence.' : 'Completed, dismissed, and owner-reported results.'}</p><div className={styles.list}>{list.length ? list.map(item => <DecisionCard key={item.id} item={item} busy={busy} onAction={onAction} />) : <p className={styles.empty}>No {view === 'Act now' ? 'additional current actions' : 'items in this view'}.</p>}</div>{snapshot.has_more && <p className={styles.warning}>This is a bounded view of recent decisions and outcomes. Older history may be omitted; top decisions are selected separately.</p>}</section>
      <details className={styles.settings} style={{ marginTop: 24 }}><summary>Intelligence preferences</summary><form className={styles.preferences} key={JSON.stringify(snapshot.settings)} onSubmit={event => { event.preventDefault(); void onAction(preferencesAction(new FormData(event.currentTarget))); }}>
        <label className={styles.check}><input type="checkbox" name="enabled" defaultChecked={snapshot.settings.enabled} />Enable operational scans and research</label><label>Target planned revenue per budgeted hour ($)<input type="number" name="hourly_target" min={1} max={10000} step="any" required defaultValue={snapshot.settings.hourly_target} /></label><p className={styles.muted}>A pricing benchmark, not actual profit. No capital budget is inferred.</p>
        <label>Research interests<textarea name="interests" rows={4} defaultValue={snapshot.settings.interests.join('\n')} /></label><label>Specific watches<textarea name="watches" rows={3} defaultValue={snapshot.settings.watches.join('\n')} /></label><p className={styles.muted}>One entry per line. Up to 12 per field, 120 characters per entry. Blank removes that list.</p><button type="submit" disabled={busy}>Save preferences</button>
      </form></details>
    </>}
  </div>;
}
