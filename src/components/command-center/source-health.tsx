'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { sourceHealth, type HealthStream } from '@/lib/data/operations-model';
import { HOMEWORKS_STREAMS } from '@/lib/integrations/homeworks-auto-streams';
const expected=HOMEWORKS_STREAMS.map(s=>s.key);
type Snapshot={streams:HealthStream[];run:{status:string;error:string|null}|null};
export function SourceHealthBanner() {
  const [state,setState]=useState<Snapshot|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [checkedAt,setCheckedAt]=useState<number|null>(null);
  useEffect(()=>{
    let disposed=false; let inFlight=false; const controller=new AbortController();
    async function check() {
      if(document.visibilityState!=='visible'||inFlight) return;
      inFlight=true;
      try {
        const response=await fetch('/api/integrations/homeworks/status',{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(12_000)])});
        if(!response.ok) throw new Error(response.status===401?'Session expired. Sign in to verify current data.':'Sync health unavailable. Saved records may be stale.');
        const data=await response.json();
        if(!Array.isArray(data.streams)) throw new Error('Sync health returned an incomplete response.');
        if(!disposed){setState(data);setError(null);setCheckedAt(Date.now());}
      } catch(e){if(!disposed){setError(e instanceof Error?e.message:'Freshness check failed.');setCheckedAt(Date.now());}}
      finally{inFlight=false;}
    }
    void check(); const timer=setInterval(check,30_000); document.addEventListener('visibilitychange',check);
    return ()=>{disposed=true;controller.abort();clearInterval(timer);document.removeEventListener('visibilitychange',check);};
  },[]);
  const health=sourceHealth(state?.streams??[],expected,checkedAt??0);
  const current=health.current&&!error&&!state?.run?.error;
  const time=health.lastSuccess ? new Date(health.lastSuccess).toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+' ET' : 'not yet verified';
  return <aside aria-label="Data freshness" role={!checkedAt || current?'status':'alert'} className={`mb-7 rounded-xl border px-4 py-3 text-xs ${current || !checkedAt?'border-[var(--color-border)] bg-[var(--color-surface-1)]':'border-amber-600 bg-[var(--color-warning-soft)] text-amber-200'}`}>
    <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2">
      <span className="flex items-center gap-2 font-medium"><span aria-hidden className={`h-1.5 w-1.5 rounded-full ${current?'bg-[var(--color-accent)]':'bg-[var(--color-warning)]'}`} />{!checkedAt?'Checking source freshness…':current?'Homeworks current · Database reachable':'Data needs attention'}</span>
      <Link className="min-h-6 content-center text-[var(--color-text-secondary)] underline underline-offset-4" href="/homeworks">Sync details</Link>
    </div>
    <p className="mt-1.5 leading-5 text-[var(--color-text-muted)]">All-source checkpoint: {time}. Updates every 5 minutes. Accounting and calendar access are checked separately.</p>
    {error&&<p className="mt-2 leading-5">{error}</p>}{!error&&checkedAt&&!current&&<p className="mt-2 leading-5">Use saved figures with caution. {state?.run?.error||health.errors[0]||'Some source streams are stale or have never completed.'}</p>}
  </aside>;
}
