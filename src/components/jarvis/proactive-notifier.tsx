'use client';
import {useEffect,useRef,useState} from 'react';
import {useJarvis} from './jarvis-provider';
import {isQuietTime,type ActivityPreferences,type ActivityNotification} from '@/lib/jarvis/reminder-model';
export function ProactiveNotifier({ownerId}:{ownerId?:string|null}){
 const jarvis=useJarvis();const state=useRef(jarvis);useEffect(()=>{state.current=jarvis;},[jarvis]);const [notice,setNotice]=useState<ActivityNotification|null>(null);const inFlight=useRef(false);
 useEffect(()=>{if(!ownerId)return;let live=true;
 async function poll(){if(inFlight.current||document.visibilityState!=='visible')return;const j=state.current;if(j.loading||j.speaking||j.listening)return;inFlight.current=true;try{
 const response=await fetch('/api/jarvis/activity',{cache:'no-store'});if(!response.ok)return;const data=await response.json();const p=data.preferences as ActivityPreferences;if(!live||isQuietTime(new Date(),p))return;
 const next=(data.notifications as ActivityNotification[]).find(n=>!n.delivered_at&&!n.acknowledged_at&&(!n.snoozed_until||Date.parse(n.snoozed_until)<=Date.now()));if(!next)return;
 // Atomic database claim keeps foreground announcements deduplicated across tabs.
 const claimed=await fetch('/api/jarvis/activity/notifications',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:next.id,action:'delivered'})});if(!claimed.ok||!(await claimed.json()).claimed||!live)return;
 setNotice(next);const current=state.current;if(p.speech_enabled&&!isQuietTime(new Date(),p)&&!current.muted&&!current.loading&&!current.speaking&&!current.listening)await current.announce(next.body);
 }catch{/* Stored notice remains accessible in ActivityPanel. No fake delivery toast. */}finally{inFlight.current=false;}}
 const tick=setTimeout(()=>void poll(),5000);const interval=setInterval(()=>void poll(),20000);const visible=()=>{if(document.visibilityState==='visible')void poll();};document.addEventListener('visibilitychange',visible);return()=>{live=false;clearTimeout(tick);clearInterval(interval);document.removeEventListener('visibilitychange',visible);};
 },[ownerId]);
 async function settle(action:'acknowledge'|'snooze'){if(!notice)return;const response=await fetch('/api/jarvis/activity/notifications',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:notice.id,action})});if(response.ok)setNotice(null);}
 if(!notice)return null;
 return <aside role="status" aria-live="polite" className="fixed bottom-28 left-4 right-4 z-50 mx-auto max-w-md rounded-2xl border border-cyan-200/30 bg-slate-950/95 p-4 text-slate-100 shadow-2xl backdrop-blur-lg"><div className="flex items-start justify-between gap-3"><p className="text-sm font-semibold">{notice.title}</p><button type="button" onClick={()=>setNotice(null)} aria-label="Dismiss activity notice" className="px-2 text-slate-400">×</button></div><p className="mt-2 text-sm text-slate-300">{notice.body}</p><div className="mt-3 flex gap-4"><button type="button" onClick={()=>void settle('acknowledge')} className="text-xs text-cyan-200">Acknowledge</button><button type="button" onClick={()=>void settle('snooze')} className="text-xs text-cyan-200">Snooze 10 minutes</button></div></aside>;
}
