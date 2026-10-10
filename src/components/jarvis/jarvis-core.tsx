"use client";

import { useId } from "react";
import type { JarvisVisualState } from "@/lib/jarvis/network-engine";

/** A state indicator, not simulated telemetry or a microphone waveform. */
export function JarvisCore({ state, className = "" }: { state: JarvisVisualState; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 320 320" fill="none" aria-hidden="true" className={`jarvis-core ${className}`} data-state={state}>
      <defs>
        <radialGradient id={`${id}-glow`}><stop stopColor="currentColor" stopOpacity=".16" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></radialGradient>
        <linearGradient id={`${id}-arc`} x1="45" y1="50" x2="270" y2="275" gradientUnits="userSpaceOnUse"><stop stopColor="currentColor" /><stop offset=".5" stopColor="currentColor" stopOpacity=".08" /><stop offset="1" stopColor="currentColor" stopOpacity=".65" /></linearGradient>
      </defs>
      <circle cx="160" cy="160" r="156" fill={`url(#${id}-glow)`} />
      <circle cx="160" cy="160" r="146" stroke="currentColor" strokeOpacity=".16" strokeWidth="1" strokeDasharray="1 8" />
      <path d="M160 5V17M315 160H303M160 315V303M5 160H17" stroke="currentColor" strokeOpacity=".6" />
      <circle className="jarvis-core-orbit" cx="160" cy="160" r="131" stroke={`url(#${id}-arc)`} strokeWidth="1.5" strokeDasharray="210 22 28 20 164 25 120 234" />
      <circle cx="160" cy="160" r="113" stroke="currentColor" strokeOpacity=".17" />
      <circle className="jarvis-core-inner" cx="160" cy="160" r="106" stroke="currentColor" strokeOpacity=".5" strokeWidth="3" strokeDasharray="48 118" />
      <circle cx="160" cy="160" r="88" fill="#0b151f" stroke="currentColor" strokeOpacity=".35" />
      <circle cx="160" cy="160" r="81" stroke="currentColor" strokeOpacity=".1" />
      <g className="jarvis-core-bars" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
        {[10, 23, 38, 57, 30, 47, 65, 35, 20, 10].map((height, index) => <path key={index} d={`M${115 + index * 10} ${160 - height / 2}v${height}`} style={{ animationDelay: `${index * -80}ms` }} />)}
      </g>
      <path d="M150 51h20M150 269h20M51 150v20M269 150v20" stroke="currentColor" strokeOpacity=".7" strokeWidth="2" />
    </svg>
  );
}
