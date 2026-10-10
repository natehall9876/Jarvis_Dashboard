"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, ArrowUpRight, CalendarDays, Maximize2, Minimize2, Mic, Pause, Play, Send, Square } from "lucide-react";
import { JarvisCore } from "@/components/jarvis/jarvis-core";
import { useHydrated } from "@/lib/use-hydrated";
import { useJarvis } from "@/components/jarvis/jarvis-provider";
import type { Briefing } from "@/lib/jarvis/briefing";

const STATE_TEXT = { idle: "At your service.", listening: "I’m listening.", processing: "On it, Nate.", responding: "Here’s what I found.", action: "Making it happen.", success: "Consider it done.", error: "Let’s take a look." } as const;

export function CommandHero({ briefing, dataError }: { briefing: Briefing | null; dataError: string | null }) {
  const jarvis = useJarvis();
  const hydrated = useHydrated();
  const [command, setCommand] = useState("");
  const [motion, setMotion] = useState(true);
  const [immersive, setImmersive] = useState(false);
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
    <section aria-label="Jarvis command center" className="command-console" data-immersive={immersive} onKeyDown={event => { if (event.key === "Escape") setImmersive(false); }} data-motion={motion ? "on" : "paused"}>
      <div aria-hidden="true" className="hud-grid" />
      <div aria-hidden="true" className="hud-horizon" />
      <div aria-hidden="true" className="hud-scanner" />
      <svg aria-hidden="true" className="hud-circuit-field" viewBox="0 0 1200 700" preserveAspectRatio="none" fill="none">
        <g stroke="currentColor" strokeWidth="1">
          <path d="M0 150h180l65 65h110M0 160h175l65 65h95M1200 140h-170l-80 80H840M0 480h190l60-60h120M1200 510h-170l-65-65H840M60 0v70l70 70M1140 0v70l-70 70" />
          <path d="M0 350h110m980 0h110M600 0v55m0 590v55" strokeDasharray="3 8" />
          <circle cx="355" cy="215" r="4"/><circle cx="840" cy="220" r="4"/><circle cx="370" cy="420" r="4"/><circle cx="840" cy="445" r="4"/>
        </g>
      </svg>
      <div className="hud-topline">
        <span className="hud-eyebrow"><i className="hud-light" />WEEDEATER / COMMAND</span>
        <div className="flex items-center gap-2">
          <button type="button" className="hud-icon-button" onClick={() => setImmersive(!immersive)} aria-label={immersive ? "Exit immersive view" : "Enter immersive view"} aria-pressed={immersive}>{immersive ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
          <button type="button" className="hud-icon-button" onClick={() => setMotion(!motion)} aria-label={motion ? "Pause visual motion" : "Resume visual motion"}>{motion ? <Pause size={14} /> : <Play size={14} />}</button>
          <Link href="/settings" className="hud-settings">Connections<ArrowUpRight size={13} /></Link>
        </div>
      </div>
      <div className="hud-identity">
        <p className="hud-eyebrow">PERSONAL OPERATIONS INTELLIGENCE</p>
        <h1>J.A.R.V.I.S.</h1>
        <div className="hud-identity-rule" aria-hidden="true"><i /><span>W E E D E A T E R</span><i /></div>
        <p className="hud-greeting">{briefing?.greeting ?? "Welcome back."} <span>Let’s get to work.</span></p>
        {briefing && <p className="hud-mobile-brief">{briefing.headline}</p>}
      </div>
      <div className="hud-stage">
        <div className="hud-briefing hud-wing">
          <p className="hud-section-label"><span>01</span> MISSION BRIEF</p>
          <p className="hud-mission-number">{briefing ? String(briefing.counts.jobs).padStart(2, "0") : "—"}<span>JOBS TODAY</span></p>
          <p className="hud-mission-copy">{briefing?.headline ?? "Your briefing is unavailable. Ask a question or open your workspace."}</p>
          <Link href="/schedule" className="hud-text-link">View schedule <ArrowUpRight size={14} /></Link>
          <div className="hud-decor-bars" aria-hidden="true">{Array.from({length: 20}, (_, i) => <i key={i} style={{height: `${8 + ((i * 13) % 24)}px`}} />)}</div>
        </div>
        <div className="hud-core-stage">
          <div className="hud-projection-base" aria-hidden="true"><i /><i /><i /></div>
          <div className="hud-orbit-tag hud-orbit-tag-left" aria-hidden="true">VOICE<br /><span>INTERFACE</span></div>
          <div className="hud-orbit-tag hud-orbit-tag-right" aria-hidden="true">CONTEXT<br /><span>ENGINE</span></div>
          <button type="button" onClick={voiceControl} disabled={!hydrated} aria-label={controlLabel} className="hud-core-control"><JarvisCore state={visualState} className="h-full w-full" /></button>
          <div className="hud-core-status">
            <p role="status">{listening && jarvis.interim ? jarvis.interim : jarvis.progress ?? STATE_TEXT[visualState]}</p>
            <span>{busy ? "TAP CORE TO STOP" : listening ? "TAP CORE TO FINISH" : "TAP CORE TO SPEAK"}</span>
          </div>
        </div>
        <div className="hud-session hud-wing">
          <p className="hud-section-label"><span>02</span> INTERACTION</p>
          <dl className="hud-session-list">
            <div><dt>VOICE CHANNEL</dt><dd>{!hydrated ? "Standby" : listening ? "Listening" : speaking ? "Speaking" : jarvis.voiceSupported ? "Ready on tap" : "Text available"}</dd></div>
            <div><dt>CONVERSATION</dt><dd>{hydrated ? `${jarvis.exchanges.filter(e => e.status === "done").length} completed` : "Standby"}</dd></div>
            <div><dt>CONTEXT</dt><dd>{hydrated && jarvis.memoryAvailable ? "Saved on this device" : "This session"}</dd></div>
          </dl>
          <button type="button" className="hud-text-link" onClick={() => jarvis.setPanelOpen(true)} disabled={!hydrated}>Open conversation <ArrowRight size={14} /></button>
        </div>
      </div>
      {dataError && <p role="alert" className="hud-data-alert">{dataError}</p>}
      {briefing && briefing.facts.length > 0 && <dl className="hud-facts">{briefing.facts.map((fact, i) => <div key={fact.label} data-tone={fact.tone}><dt><span>0{i + 1}</span>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>}
      <div className="hud-command-area">
        <form className="hud-command-input" onSubmit={event => { event.preventDefault(); ask(command); }}>
          <span aria-hidden="true" className="hud-prompt">›</span>
          <label htmlFor="workspace-command" className="sr-only">Ask Jarvis from your workspace</label>
          <input id="workspace-command" value={command} onChange={event => setCommand(event.target.value)} maxLength={2000} disabled={!hydrated || loading || listening} placeholder="Your command, Nate." />
          <button type="button" onClick={voiceControl} disabled={!hydrated} aria-label={controlLabel} className="hud-input-mic">{busy || listening ? <Square size={18} /> : <Mic size={20} />}</button>
          {!loading && <button type="submit" disabled={!hydrated || !command.trim() || listening} aria-label="Send to Jarvis" className="hud-send"><Send size={18} /></button>}
        </form>
        <div className="hud-shortcuts">
          <button type="button" onClick={() => ask("Give me a concise owner briefing and the most useful next action.")} disabled={!hydrated || loading}>Brief me<ArrowRight size={13} /></button>
          <Link href="/schedule"><CalendarDays size={13} />Open schedule</Link>
          <span>{loading ? "PROCESSING YOUR REQUEST" : listening ? "VOICE INPUT ACTIVE" : speaking ? "VOICE OUTPUT ACTIVE" : "AWAITING YOUR COMMAND"}</span>
        </div>
      </div>
    </section>
  );
}
