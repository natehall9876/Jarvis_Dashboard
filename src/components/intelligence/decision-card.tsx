'use client';

import { useState } from 'react';
import type { IntelligenceAction, IntelligenceItem } from '@/lib/intelligence/types';
import { decisionOptions, outcomeAction } from './view-model';
import styles from './intelligence.module.css';

export function stamp(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York', timeZoneName: 'short' }).format(new Date(value));
}
export const dollars = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);
const impactLabels = { receivable_balance: 'Recorded receivable', quoted_revenue: 'Quoted revenue', planned_rate: 'Planned rate', scenario: 'Scenario estimate', unknown: 'Impact not quantified' };
const preparedLabels = { collection_draft: 'Unsent collection draft', quote_draft: 'Unsent quote follow-up', outreach_draft: 'Unsent outreach draft', calculation: 'Calculation table', worksheet: 'Repair worksheet', experiment: 'Experiment brief', comparison: 'Source comparison' };

export function DecisionCard({ item, rank, busy, onAction }: { item: IntelligenceItem; rank?: number; busy: boolean; onAction: (action: IntelligenceAction) => Promise<boolean> }) {
  const [copyStatus, setCopyStatus] = useState('');
  async function copyPacket() {
    try { await navigator.clipboard.writeText(item.prepared.content); setCopyStatus('Copied prepared work.'); }
    catch { setCopyStatus('Copy unavailable. Select the prepared text to copy it.'); }
  }
  return <article className={styles.card} aria-label={item.title} data-intelligence-id={item.id}>
    <div className={styles.cardHead}>
      {rank && <span className={styles.rank} aria-label={`Priority ${rank}`}>{rank}</span>}
      <div><h3>{item.title}</h3><div className={styles.metadata}><span className={styles.state}>{item.state === 'new' ? 'New decision' : item.state}</span><span>{item.source === 'internal' ? 'Operations' : 'Research'}</span><span>{item.confidence} confidence</span><span>Owner: {item.owner_label}</span></div></div>
    </div>
    {item.stale && <p className={styles.warning}>Needs rechecking: {item.stale_reason ?? 'Evidence is no longer current.'}</p>}
    <div className={styles.body}>
      <div><p className={styles.secondary}>{item.why_now}</p><p><strong>Next:</strong> {item.next_step}</p>{item.deadline && <p className={styles.warning}>Documented deadline: {stamp(item.deadline)}</p>}</div>
      <div className={styles.impact}><p className={styles.impactLabel}>{impactLabels[item.impact.kind]}</p>{item.impact.amount !== null && <p className={styles.impactValue}>{dollars(item.impact.amount)}{item.impact.unit === 'USD/hour' ? '/hr' : ''}</p>}<p className={styles.muted}>{item.impact.basis}</p><p className={styles.muted}>Effort: {item.effort_hours === null ? 'unknown' : `${item.effort_hours} hours`} · Capital: {item.capital_required === null ? 'unknown' : dollars(item.capital_required)}</p></div>
    </div>
    <div className={styles.actions} aria-label="Decision controls">{decisionOptions(item).map(option => <button type="button" key={option.state} disabled={busy} className={option.state === 'accepted' ? styles.primary : undefined} onClick={() => void onAction({ action: 'decision', id: item.id, state: option.state })}>{option.label}</button>)}</div>
    <details className={styles.details}><summary>Prepared work · {preparedLabels[item.prepared.kind]}</summary><div className={styles.detailBody}>
      <p className={styles.secondary}>Prepared {stamp(item.prepared.prepared_at)} · Next actor: {item.prepared.next_actor}</p>
      <pre className={styles.packet}>{item.prepared.content}</pre><div className={styles.actions}><button type="button" onClick={() => void copyPacket()}>Copy prepared work</button></div><p role="status" className={styles.muted}>{copyStatus}</p>
    </div></details>
    <details className={styles.details}><summary>Evidence, reasoning &amp; validation</summary><div className={styles.detailBody}>
      <h4>Recorded facts</h4><ul>{item.facts.map((fact, index) => <li key={index}>{fact}</li>)}</ul><h4>Interpretation</h4><p className={styles.secondary}>{item.inference}</p>
      <h4>Priority basis</h4><p className={styles.secondary}>{item.priority}/100 · {item.priority_basis}</p><p className={styles.muted}>Ranking heuristic, not expected return or probability of profit.</p>
      <h4>Exact sources</h4><ul className={styles.sources}>{item.evidence.map((evidence, index) => <li key={index}><a href={evidence.url} {...(evidence.url.startsWith('https://') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{evidence.title}</a><p>{evidence.note}</p><p className={styles.muted}>Verified {stamp(evidence.observed_at)}{evidence.published_at ? ` · Published ${stamp(evidence.published_at)}` : ' · Publication date not recorded'}</p></li>)}</ul>
      <p className={styles.muted}>Finding observed {stamp(item.observed_at)} · Valid until {stamp(item.expires_at)}.</p>
      {item.validation && <><h4>Validation plan</h4><dl className={styles.validation}>{([['mechanism', 'How it could make or save money'], ['fit', 'Business fit'], ['entry_barrier', 'Entry barrier'], ['cheapest_test', 'Cheapest test'], ['success_metric', 'Success measure'], ['stop_rule', 'Stop rule']] as const).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{item.validation![key]}</dd></div>)}</dl></>}
    </div></details>
    <details className={styles.details}><summary>{item.outcome ? 'View or update reported outcome' : 'Record an outcome'}</summary><div className={styles.detailBody}>
      <p className={styles.muted}>Owner-reported results, not proven causal lift. Leave unknown amounts blank. Saving an outcome does not complete the decision.</p>
      {item.outcome && <p className={styles.secondary}>Last recorded {stamp(item.outcome.recorded_at)}</p>}
      <form key={item.outcome?.recorded_at ?? 'new'} onSubmit={event => { event.preventDefault(); void onAction(outcomeAction(item.id, new FormData(event.currentTarget))); }}>
        <label>What happened?<textarea name="notes" rows={3} maxLength={2000} defaultValue={item.outcome?.notes ?? ''} /></label>
        <div className={styles.fields}>{([['realized_revenue', 'Realized revenue ($)'], ['realized_savings', 'Realized savings ($)'], ['hours_saved', 'Hours saved']] as const).map(([name, label]) => <label key={name}>{label}<input type="number" name={name} min={0} max={1e9} step="any" placeholder="Unknown" defaultValue={item.outcome?.[name] ?? ''} /></label>)}</div>
        <button type="submit" disabled={busy}>Save reported outcome</button>
      </form>
    </div></details>
  </article>;
}
