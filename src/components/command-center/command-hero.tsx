"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, ArrowUpRight, CalendarDays, Mic, Send, Square } from "lucide-react";
import { JarvisCore } from "@/components/jarvis/jarvis-core";
import { useHydrated } from "@/lib/use-hydrated";
import { useJarvis } from "@/components/jarvis/jarvis-provider";
import type { Briefing } from "@/lib/jarvis/briefing";

const TONE = { ok: "text-[#c5f49b]", warn: "text-[var(--color-warning)]", muted: "text-[#b7c6d3]" } as const;
const STATE_TEXT = { idle: "Ready for your command", listening: "Listening to you", processing: "Working on it", responding: "Responding", action: "Applying your change", success: "Complete", error: "Needs your attention" } as const;

export function CommandHero({ briefing, dataError }: { briefing: Briefing | null; dataError: string | null }) {
  const jarvis = useJarvis();
  const hydrated = useHydrated();
  const [command, setCommand] = useState("");
  const { visualState, listening, loading, speaking } = jarvis;
  const busy = loading || speaking;
  const controlLabel = loading ? "Stop response" : listening ? "Stop listening" : speaking ? "Stop speaking" : "Talk to Jarvis";
  function voiceControl() {
    if (loading) jarvis.stopResponse();
    else if (listening) jarvis.stopListening();
    else if (speaking) jarvis.stopSpeaking();
    else { jarvis.setPanelOpen(true); jarvis.startListening(); }
  }
  function ask(text: string) { if (!text.trim() || loading) return; jarvis.setPanelOpen(true); void jarvis.submit(text.trim()); setCommand(""); }
  return (
    <section aria-label="Jarvis command center" className="command-console relative isolate overflow-hidden rounded-[1.75rem] border border-[#26404e] bg-[#0b121b] shadow-[0_24px_80px_-40px_#000]">
      <div aria-hidden="true" className="command-grid absolute inset-0 -z-10 opacity-40" />
      <div className="flex items-center justify-between gap-3 border-b border-white/6 px-5 py-4 sm:px-8">
        <p className="flex items-center gap-3 text-[11px] font-medium tracking-[.24em] text-[#c0d3e1]"><span className="h-1.5 w-1.5 rounded-full bg-[#71d8ed]" />J.A.R.V.I.S.<span className="hidden border-l border-white/15 pl-3 text-[10px] tracking-[.12em] text-[#8499ac] sm:inline">WEEDEATER</span></p>
        <Link href="/settings" className="flex min-h-11 items-center gap-1 text-xs text-[#a7bbce] hover:text-white">Connections<ArrowUpRight className="h-3.5 w-3.5" /></Link>
      </div>
      <div className="grid items-center gap-2 px-5 pt-5 sm:px-8 sm:pt-7 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[.21em] text-[#75d9ec]">Your operations. In focus.</p>
          <h1 className="text-[2rem] font-medium leading-[1.12] tracking-[-.045em] text-[#edf6fd] sm:text-[2.75rem]">{briefing?.greeting ?? "At your service."}</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-[#a9bdce] sm:text-base">{briefing?.headline ?? "Your briefing is unavailable. You can still open your workspace or ask a question."}</p>
          {dataError && <p role="alert" className="mt-3 max-w-xl text-sm text-[var(--color-warning)]">{dataError}</p>}
          {briefing && briefing.facts.length > 0 && <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 sm:mt-7">
            {briefing.facts.map(f => <div key={f.label} className="border-l border-[#2b4354] pl-3"><dt className="text-[10px] uppercase tracking-[.1em] text-[#8b9fb2]">{f.label}</dt><dd className={`mt-1 text-sm font-medium ${TONE[f.tone]}`}>{f.value}</dd></div>)}
          </dl>}
        </div>
        <div className="relative flex flex-col items-center justify-center py-2 xl:py-0">
          <button type="button" onClick={voiceControl} disabled={!hydrated} aria-label={controlLabel} className="group relative h-[180px] w-[180px] rounded-full outline-none transition-transform duration-200 hover:scale-[1.025] focus-visible:ring-2 focus-visible:ring-[#72ddf2] active:scale-[.97] sm:h-[230px] sm:w-[230px] xl:h-[296px] xl:w-[296px]">
            <JarvisCore state={visualState} className="h-full w-full" />
          </button>
          <p className="max-w-full text-center text-xs font-medium text-[#97e4f2]" role="status">{listening && jarvis.interim ? jarvis.interim : jarvis.progress ?? STATE_TEXT[visualState]}</p>
          <p className="mt-1 text-[10px] tracking-wide text-[#8b9fb2]">{busy ? "Tap the core to stop" : listening ? "Tap the core when you’re done" : "Tap the core to speak"}</p>
        </div>
      </div>
      <div className="px-5 pt-5 pb-5 sm:px-8 sm:pb-7">
        <form className="flex items-center gap-1.5 rounded-2xl border border-[#355364] bg-[#101e2a]/85 p-1.5 transition-colors focus-within:border-[#73d8ea]" onSubmit={event => { event.preventDefault(); ask(command); }}>
          <label htmlFor="workspace-command" className="sr-only">Ask Jarvis from your workspace</label>
          <input id="workspace-command" value={command} onChange={event => setCommand(event.target.value)} maxLength={2000} disabled={!hydrated || loading || listening} placeholder="What needs my attention?" className="min-h-12 min-w-0 flex-1 bg-transparent px-3 text-base text-[#edf6fd] outline-none placeholder:text-[#91a7b9]" />
          <button type="button" onClick={voiceControl} disabled={!hydrated} aria-label={controlLabel} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-[#92d9e8] hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-[#72ddf2]">{busy || listening ? <Square className="h-4 w-4" /> : <Mic className="h-5 w-5" />}</button>
          {!loading && <button type="submit" disabled={!hydrated || !command.trim() || listening} aria-label="Send to Jarvis" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#83def0] text-[#092431] transition-transform active:scale-95 disabled:opacity-35"><Send className="h-4 w-4" /></button>}
        </form>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#afc3d3]">
          <button type="button" onClick={() => ask("Give me a concise owner briefing and the most useful next action.")} disabled={!hydrated || loading} className="flex min-h-11 items-center gap-1.5 hover:text-white disabled:opacity-40">Brief me<ArrowRight className="h-3 w-3" /></button>
          <Link href="/schedule" className="flex min-h-11 items-center gap-1.5 hover:text-white"><CalendarDays className="h-3.5 w-3.5" />Open schedule</Link>
          <span className="ml-auto text-[10px] text-[#8b9fb2]">{hydrated && jarvis.memoryAvailable ? "Context saved on this device" : "Your command workspace"}</span>
        </div>
      </div>
    </section>
  );
}
