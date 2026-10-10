"use client";

import { useId } from "react";
import type { JarvisVisualState } from "@/lib/jarvis/network-engine";

/** Decorative hologram. Color and movement reflect assistant state, not measured telemetry. */
export function JarvisCore({ state, className = "" }: { state: JarvisVisualState; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 480 480" fill="none" aria-hidden="true" className={`jarvis-core ${className}`} data-state={state}>
      <defs>
        <radialGradient id={`${id}-halo`}><stop stopColor="currentColor" stopOpacity=".25" /><stop offset=".65" stopColor="currentColor" stopOpacity=".06" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></radialGradient>
        <radialGradient id={`${id}-eye`}><stop stopColor="#fff" /><stop offset=".13" stopColor="#d9ffff" /><stop offset=".3" stopColor="currentColor" stopOpacity=".75" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></radialGradient>
        <linearGradient id={`${id}-arc`}><stop stopColor="currentColor" stopOpacity="0" /><stop offset=".6" stopColor="currentColor" /><stop offset="1" stopColor="#fff" /></linearGradient>
      </defs>
      <g className="jarvis-core-satellites" stroke="currentColor" opacity=".65">
        <ellipse cx="240" cy="240" rx="237" ry="122" transform="rotate(-28 240 240)" strokeWidth=".7" />
        <ellipse cx="240" cy="240" rx="237" ry="122" transform="rotate(58 240 240)" strokeWidth=".7" />
        <circle cx="31" cy="343" r="3" fill="#dcffff" />
        <circle cx="447" cy="136" r="4" fill="#ffcb83" stroke="#ffcb83" />
      </g>
      <circle cx="240" cy="240" r="235" fill={`url(#${id}-halo)`} />
      <g stroke="currentColor">
        <circle cx="240" cy="240" r="224" strokeOpacity=".2" />
        <circle cx="240" cy="240" r="219" strokeOpacity=".65" strokeDasharray="1 10.46" strokeWidth="5" />
        <path d="M240 4v14m0 444v14M4 240h14m444 0h14M72 72l10 10m316 316 10 10M72 408l10-10M398 82l10-10" strokeOpacity=".9" />
        <g className="jarvis-core-orbit">
          <circle cx="240" cy="240" r="204" strokeWidth="2" strokeOpacity=".65" strokeDasharray="300 48 78 24 200 58 65 510" />
          <circle cx="240" cy="240" r="197" strokeWidth="10" strokeOpacity=".12" strokeDasharray="230 80 60 400" />
          <path d="M240 36a204 204 0 0 1 204 204" stroke={`url(#${id}-arc)`} strokeWidth="3" />
          <circle cx="240" cy="36" r="4" fill="#e1ffff" stroke="none" />
        </g>
        <g className="jarvis-core-counter">
          {Array.from({ length: 48 }, (_, i) => <path key={i} d={i % 4 === 0 ? "M240 55v17" : "M240 58v8"} transform={`rotate(${i * 7.5} 240 240)`} strokeOpacity={i % 4 === 0 ? ".9" : ".4"} strokeWidth={i % 4 === 0 ? "2.5" : "1"} />)}
          <circle cx="240" cy="240" r="173" strokeOpacity=".28" />
          <circle cx="240" cy="240" r="167" strokeWidth="3" strokeDasharray="110 50 25 140" stroke="#ffbf69" strokeOpacity=".8" />
        </g>
        <g className="jarvis-core-gyroscope" strokeOpacity=".3">
          <ellipse cx="240" cy="240" rx="149" ry="65" transform="rotate(-32 240 240)" />
          <ellipse cx="240" cy="240" rx="149" ry="65" transform="rotate(32 240 240)" />
          <ellipse cx="240" cy="240" rx="65" ry="149" />
          <circle cx="240" cy="240" r="148" />
          <ellipse cx="240" cy="240" rx="149" ry="25" />
        </g>
        <g className="jarvis-core-inner">
          <circle cx="240" cy="240" r="129" strokeWidth="12" strokeDasharray="3 12.7" strokeOpacity=".7" />
          <circle cx="240" cy="240" r="114" strokeWidth="1.5" strokeDasharray="290 42 60 42" />
          <path d="M240 119v11m121 110h-11M240 361v-11M119 240h11" stroke="#ffbf69" strokeWidth="4" />
        </g>
        <circle cx="240" cy="240" r="99" fill="#020c14" fillOpacity=".85" strokeOpacity=".6" />
        <g className="jarvis-core-sphere" strokeWidth=".65" strokeOpacity=".45">
          {[24, 48, 72, 94].map(radius => <ellipse key={`longitude-${radius}`} cx="240" cy="240" rx={radius} ry="97" />)}
          {[-72, -48, -24, 0, 24, 48, 72].map(y => <ellipse key={`latitude-${y}`} cx="240" cy={240 + y} rx={Math.sqrt(97 * 97 - y * y)} ry={12} />)}
          <path d="M143 240h194M240 143v194" strokeOpacity=".7" />
        </g>
        <circle cx="240" cy="240" r="92" strokeOpacity=".16" strokeWidth="5" />
        <g className="jarvis-core-lens">
          <circle cx="240" cy="240" r="83" fill={`url(#${id}-eye)`} stroke="none" />
          <circle cx="240" cy="240" r="60" strokeOpacity=".45" strokeDasharray="2 5" />
          <path d="M204 219l36-21 36 21v42l-36 21-36-21z" strokeOpacity=".8" strokeWidth="1.5" />
          <circle cx="240" cy="240" r="39" stroke="#dcffff" strokeWidth="2" strokeDasharray="65 17" />
          <path d="M204 219l36 21 36-21m-36 21v42" strokeOpacity=".6" />
          <circle cx="240" cy="240" r="10" fill="#eaffff" strokeWidth="5" strokeOpacity=".2" />
        </g>
        <g className="jarvis-core-bars" strokeWidth="2">
          {[5, 9, 17, 10, 23, 30, 16, 26, 12, 20, 8, 5].map((height, index) => <path key={index} d={`M${201.5 + index * 7} ${315 - height / 2}v${height}`} style={{ animationDelay: `${index * -95}ms` }} />)}
        </g>
      </g>
      <g fill="currentColor" fontFamily="monospace" fontSize="7" letterSpacing="2" opacity=".8">
        <text x="240" y="32" textAnchor="middle">J.A.R.V.I.S.</text>
        <text x="240" y="456" textAnchor="middle">{state.toUpperCase()}</text>
      </g>
    </svg>
  );
}
