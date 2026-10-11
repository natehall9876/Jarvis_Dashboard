import type { IntelligenceAction, IntelligenceItem, IntelligenceRun, IntelligenceSettings, SourceCoverage } from './types';

export const DEFAULT_INTELLIGENCE_SETTINGS: IntelligenceSettings = {
  enabled: true, hourly_target: 130,
  interests: ['WeedEater operating improvements', 'Local service demand', 'AI and automation', 'Cross-industry low-capital opportunities'],
  watches: [], research_automation_id: null, research_cadence: null,
};
export class IntelligenceError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function safeEvidenceUrl(value: string, source: 'internal' | 'external'): boolean {
  if (typeof value !== 'string' || value.length > 2048 || /[\s\\\u0000-\u001f]/.test(value)) return false;
  if (source === 'internal') return /^\/(invoices|quotes|jobs)\/[0-9a-f-]{36}$/.test(value) || value === '/connections';
  try {
    const u = new URL(value);
    const h = u.hostname.toLowerCase();
    return u.protocol === 'https:' && !value.slice(8).split(/[/?#]/, 1)[0].includes(':') && !u.username && !u.password && !u.port &&
      /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(h) && /\.[a-z]{2,}$/.test(h) &&
      !/(^|\.)(localhost|local|internal|test|invalid|example|home|lan)$/.test(h);
  } catch { return false; }
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new IntelligenceError('Expected an action object.');
  return value as Record<string, unknown>;
}
function exact(v: Record<string, unknown>, keys: string[]) {
  if (Object.keys(v).some(k => !keys.includes(k)) || keys.some(k => !(k in v))) throw new IntelligenceError('Action fields are missing or unsupported.');
}
function boundedText(v: unknown, max: number, empty = false): v is string {
  return typeof v === 'string' && (empty || v.trim().length > 0) && v.length <= max && !v.includes('\u0000');
}
export function finiteNonnegative(v: unknown): v is number | null {
  return v === null || typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1e9;
}
export function validateAction(value: unknown): IntelligenceAction {
  const v = object(value);
  if (v.action === 'refresh') { exact(v, ['action']); return { action: 'refresh' }; }
  if (v.action === 'preferences') {
    exact(v, ['action', 'enabled', 'hourly_target', 'interests', 'watches']);
    if (typeof v.enabled !== 'boolean' || typeof v.hourly_target !== 'number' || !Number.isFinite(v.hourly_target) || v.hourly_target < 1 || v.hourly_target > 10000 ||
      ![v.interests, v.watches].every(list => Array.isArray(list) && list.length <= 12 && list.every(s => boundedText(s, 120)))) throw new IntelligenceError('Enter a target from 1 to 10000 and up to 12 interests or watches each.');
  } else if (v.action === 'decision' || v.action === 'outcome') {
    if (typeof v.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.id)) throw new IntelligenceError('A valid item ID is required.');
    if (v.action === 'decision') {
      exact(v, ['action', 'id', 'state']);
      if (!['accepted', 'watch', 'dismissed', 'completed'].includes(String(v.state))) throw new IntelligenceError('Choose accept, watch, dismiss or complete.');
    } else {
      exact(v, ['action', 'id', 'notes', 'realized_revenue', 'realized_savings', 'hours_saved']);
      if (!boundedText(v.notes, 2000, true) || ![v.realized_revenue, v.realized_savings, v.hours_saved].every(finiteNonnegative)) throw new IntelligenceError('Outcomes must be nonnegative finite numbers or unknown, with notes up to 2000 characters.');
    }
  } else throw new IntelligenceError('Unsupported intelligence action.');
  return v as unknown as IntelligenceAction;
}
export function runStale(run: IntelligenceRun | null, source: 'internal' | 'external', now = new Date()): boolean {
  return !run || run.status === 'failed' || !run.applied || !Number.isFinite(Date.parse(run.finished_at)) || now.getTime() - Date.parse(run.finished_at) > (source === 'internal' ? 45 : 150) * 60000;
}
export function annotateItem(item: IntelligenceItem, latest: IntelligenceRun | null, now = new Date()): IntelligenceItem {
  let reason: string | null = null;
  if (!item.source_active) reason = 'No longer present in the latest successful source scan.';
  else if (Date.parse(item.expires_at) <= now.getTime()) reason = 'Evidence has expired; verify it again.';
  else if (item.deadline && Date.parse(item.deadline) < now.getTime()) reason = 'The recorded deadline has passed.';
  else if (runStale(latest, item.source, now)) reason = 'This source loop has no recent successful run.';
  else if (item.source === 'internal' && !latest?.coverage.some(c => c.source === 'homeworks' && c.status === 'ok')) reason = 'Homeworks upstream freshness was not verified by the latest scan.';
  else if (!latest?.coverage.some(c => c.source === item.scope && c.status === 'ok')) reason = 'The latest run did not verify this source.';
  else if (!item.evidence.length || item.evidence.some(e => !safeEvidenceUrl(e.url, item.source) || !Number.isFinite(Date.parse(e.observed_at)) || Date.parse(e.observed_at) < now.getTime() - 14 * 86400000)) reason = 'Source evidence needs verification.';
  return { ...item, stale: reason !== null, stale_reason: reason };
}
export function topDecisions(items: IntelligenceItem[]): IntelligenceItem[] {
  const seen = new Set<string>();
  return items.filter(i => !i.stale && (i.state === 'new' || i.state === 'accepted')).sort((a, b) => b.priority - a.priority || a.dedup_key.localeCompare(b.dedup_key)).filter(i => {
    const category = i.source === 'internal' && i.scope !== 'jobs' ? i.scope : i.dedup_key;
    if (seen.has(category)) return false;
    seen.add(category); return true;
  }).slice(0, 3);
}
export function unverifiedCoverage(now: string): SourceCoverage {
  return { source: 'quickbooks', status: 'unverified', checked_at: now, records: null, detail: 'QuickBooks accounting was not read. Operational balances and planned rates are not verified accounting profit.' };
}
