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
  return <aside aria-label="Data freshness" role={current?'status':'alert'} className={`mb-5 rounded-lg border p-3 text-sm ${current?'border-[var(--color-border)]':'border-amber-600 text-amber-300'}`}>
    <div className="flex flex-wrap justify-between gap-2"><strong>{!checkedAt?'Checking source freshness…':current?'Homeworks current · Database reachable':'Data needs attention'}</strong><Link className="underline" href="/homeworks">Sync details</Link></div>
    <p>All-source checkpoint: {time}. Automatic updates every 5 minutes.</p>
    {error&&<p>{error}</p>}{!error&&checkedAt&&!current&&<p>Use saved figures with caution. {state?.run?.error||health.errors[0]||'Some source streams are stale or have never completed.'}</p>}
    <p className="text-xs text-[var(--color-text-muted)]">QuickBooks and Google Calendar are checked separately in the cards below or in Settings.</p>
  </aside>;
}
