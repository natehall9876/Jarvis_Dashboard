import type { IntelligenceAction, IntelligenceItem, IntelligenceSnapshot } from '@/lib/intelligence/types';

export const VIEWS = ['Act now', 'Ready for review', 'Watch', 'Outcomes'] as const;
export type IntelligenceView = typeof VIEWS[number];

/** Top candidates may be outside the bounded history window. Keep the full cards. */
export function intelligenceItems(snapshot: IntelligenceSnapshot): IntelligenceItem[] {
  return [...new Map([...snapshot.items, ...snapshot.top].map(item => [item.id, item])).values()];
}
export function viewItems(snapshot: IntelligenceSnapshot, view: IntelligenceView) {
  return intelligenceItems(snapshot).filter(item => {
    if (view === 'Outcomes') return item.state === 'completed' || item.state === 'dismissed' || item.outcome !== null;
    if (view === 'Watch') return item.state === 'watch' || (item.stale && (item.state === 'new' || item.state === 'accepted'));
    const current = !item.stale && (item.state === 'new' || item.state === 'accepted');
    return current && (view === 'Act now' || Boolean(item.prepared?.content));
  });
}
export function decisionOptions(item: IntelligenceItem): Array<{ state: 'accepted' | 'watch' | 'dismissed' | 'completed'; label: string }> {
  if (item.state === 'completed' || item.state === 'dismissed') return [{ state: 'watch', label: 'Return to Watch' }];
  return ([{ state: 'accepted', label: 'Accept' }, { state: 'watch', label: 'Watch' }, { state: 'completed', label: 'Complete' }, { state: 'dismissed', label: 'Dismiss' }] as const).filter(option => option.state !== item.state);
}
export function outcomeAction(id: string, values: FormData): IntelligenceAction {
  const number = (key: string) => { const value = String(values.get(key) ?? '').trim(); return value === '' ? null : Number(value); };
  return { action: 'outcome', id, notes: String(values.get('notes') ?? ''), realized_revenue: number('realized_revenue'), realized_savings: number('realized_savings'), hours_saved: number('hours_saved') };
}
export function preferencesAction(values: FormData): IntelligenceAction {
  const lines = (key: string) => String(values.get(key) ?? '').split('\n').map(value => value.trim()).filter(Boolean);
  return { action: 'preferences', enabled: values.get('enabled') === 'on', hourly_target: Number(values.get('hourly_target')), interests: lines('interests'), watches: lines('watches') };
}
export type IntelligenceRequest = (action?: IntelligenceAction, signal?: AbortSignal) => Promise<IntelligenceSnapshot>;
export const requestIntelligence: IntelligenceRequest = async (action, signal) => {
  let response: Response;
  let result;
  try {
    response = await fetch('/api/jarvis/intelligence', {
    method: action ? 'POST' : 'GET', cache: 'no-store', signal,
    ...(action ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action) } : {}),
  });
    result = await response.json();
  } catch {
    throw new Error(action ? 'The change could not be confirmed. Retry loading to check the saved state before trying again.' : 'Intelligence could not be loaded. Please retry.');
  }
  if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Intelligence is unavailable. Please retry.');
  return action ? result.snapshot : result;
};
