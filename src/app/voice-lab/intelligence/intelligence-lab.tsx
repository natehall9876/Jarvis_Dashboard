'use client';

import { useCallback, useRef, useState } from 'react';
import type { IntelligenceAction, IntelligenceSnapshot } from '@/lib/intelligence/types';
import { IntelligenceDashboard } from '@/components/intelligence/intelligence-dashboard';
import { intelligenceItems } from '@/components/intelligence/view-model';
import { intelligenceFixture } from './fixtures';

/** Request injection is confined to this production-disabled lab subtree. */
export function IntelligenceLab() {
  const [initial, setInitial] = useState(() => intelligenceFixture());
  const saved = useRef<IntelligenceSnapshot>(initial);
  const [mode, setMode] = useState<'normal' | 'error' | 'empty'>('normal');
  const [generation, setGeneration] = useState(0);
  const request = useCallback(async (action?: IntelligenceAction) => {
    if (mode === 'error') throw new Error('Synthetic connection failure. Your change was not saved.');
    let next = structuredClone(saved.current);
    if (action?.action === 'preferences') next.settings = { ...next.settings, ...action };
    if (action?.action === 'decision' || action?.action === 'outcome') {
      next.items = intelligenceItems(next).map(item => item.id !== action.id ? item : action.action === 'decision' ? { ...item, state: action.state } : { ...item, outcome: { notes: action.notes, realized_revenue: action.realized_revenue, realized_savings: action.realized_savings, hours_saved: action.hours_saved, attribution: 'owner_reported' as const, recorded_at: new Date().toISOString() } });
      next.top = next.top.map(item => next.items.find(candidate => candidate.id === item.id) ?? item).filter(item => ['new', 'accepted'].includes(item.state));
    }
    if (action?.action === 'preferences') {
      next.items = intelligenceItems(next).map(item => ({ ...item, stale: !next.settings.enabled || item.id.startsWith('44444444'), stale_reason: !next.settings.enabled ? 'Intelligence is disabled in preferences.' : item.id.startsWith('44444444') ? 'Evidence has expired.' : null }));
      next.top = next.items.filter(item => !item.stale && ['new', 'accepted'].includes(item.state)).sort((a, b) => b.priority - a.priority).slice(0, 3);
    }
    if (mode === 'empty') next = { ...next, items: [], top: [], has_more: false };
    saved.current = next;
    return next;
  }, [mode]);
  return <>
    <aside className="mb-6 rounded-lg border border-amber-500 p-4 text-sm"><strong>Synthetic Intelligence lab — no real business data</strong><p className="mt-2">Changes live only in this development page. Reload resets the fixture. The first top card is deliberately absent from the bounded items window.</p><div className="mt-3 flex flex-wrap gap-3"><label>Fixture mode <select aria-label="Fixture mode" value={mode} onChange={event => setMode(event.target.value as typeof mode)} className="ml-2 rounded border p-2"><option value="normal">Normal</option><option value="error">Request error</option><option value="empty">Empty response</option></select></label><button type="button" className="rounded border px-3 py-2" onClick={() => { saved.current = intelligenceFixture(); setInitial(saved.current); setGeneration(value => value + 1); }}>Reset fixture</button></div></aside>
    <IntelligenceDashboard key={generation} initialSnapshot={initial} request={request} />
  </>;
}
