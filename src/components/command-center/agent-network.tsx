"use client";

import Link from "next/link";
import { CAPABILITIES, STATUS_LABEL, type Capability, type CapabilityStatus } from "@/lib/jarvis/capabilities";
import { useJarvis } from "@/components/jarvis/jarvis-provider";

const STATUS_COLOR: Record<CapabilityStatus, string> = {
  connected: "var(--color-accent)",
  partial: "var(--color-warning)",
  awaiting_credentials: "var(--color-info)",
  planned: "var(--color-text-muted)",
};

const W = 640;
const H = 400;
const CX = W / 2;
const CY = H / 2;
const RX = 250;
const RY = 148;

function position(index: number, total: number): { x: number; y: number } {
  const angle = -Math.PI / 2 + (index / total) * Math.PI * 2;
  // Rounded: raw trig floats serialize differently on the server and in the browser, which caused a hydration mismatch.
  const round = (v: number) => Math.round(v * 100) / 100;
  return { x: round(CX + Math.cos(angle) * RX), y: round(CY + Math.sin(angle) * RY) };
}

/**
 * Jarvis at the centre, its real capabilities around it. Colour and label state
 * exactly how much of each capability exists today (see lib/jarvis/capabilities
 * — nothing is marked connected without data flowing AND a Jarvis tool that can
 * read it). Nodes Jarvis actually consulted for the latest answer light up.
 * Every node is also reachable from the plain list below — the graph is a view
 * onto navigation, never the only way to navigate.
 */
export function AgentNetwork() {
  const { activeCapabilities, visualState } = useJarvis();
  const active = new Set(activeCapabilities);
  const total = CAPABILITIES.length;

  return (
    <div className="space-y-4">
      <div className="hidden sm:block">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Jarvis capability network">
          <defs>
            <radialGradient id="core-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#fff6dc" stopOpacity="0.9" />
              <stop offset="45%" stopColor="#e8c778" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#e8c778" stopOpacity="0" />
            </radialGradient>
          </defs>
          {CAPABILITIES.map((c, i) => {
            const p = position(i, total);
            const lit = active.has(c.id);
            return (
              <line
                key={c.id}
                x1={CX}
                y1={CY}
                x2={p.x}
                y2={p.y}
                stroke={lit ? "var(--color-accent)" : STATUS_COLOR[c.status]}
                strokeOpacity={lit ? 0.9 : c.status === "planned" ? 0.18 : 0.32}
                strokeWidth={lit ? 1.8 : 1}
                strokeDasharray={c.status === "planned" ? "3 5" : undefined}
              />
            );
          })}
          <circle cx={CX} cy={CY} r={70} fill="url(#core-glow)" />
          <circle cx={CX} cy={CY} r={34} fill="var(--color-surface-1)" stroke="var(--color-accent)" strokeOpacity={visualState === "idle" ? 0.5 : 1} />
          <text x={CX} y={CY + 4} textAnchor="middle" fontSize="13" fontWeight="600" fill="var(--color-text-primary)">
            JARVIS
          </text>
          {CAPABILITIES.map((c, i) => {
            const p = position(i, total);
            const lit = active.has(c.id);
            return <NodeShape key={c.id} c={c} x={p.x} y={p.y} lit={lit} />;
          })}
        </svg>
      </div>

      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {CAPABILITIES.map((c) => {
          const lit = active.has(c.id);
          const inner = (
            <div
              className={`flex h-full min-h-14 flex-col justify-center gap-0.5 rounded-lg border px-3 py-2 transition-colors ${
                lit ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]" : "border-[var(--color-border)] bg-[var(--color-surface-2)]"
              } ${c.href ? "hover:border-[var(--color-accent)]/60" : "opacity-75"}`}
            >
              <span className="flex items-center gap-1.5 text-sm font-medium text-[var(--color-text-primary)]">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: STATUS_COLOR[c.status] }} />
                {c.label}
              </span>
              <span className="text-[11px]" style={{ color: STATUS_COLOR[c.status] }}>
                {STATUS_LABEL[c.status]}
              </span>
            </div>
          );
          return (
            <li key={c.id} title={c.detail}>
              {c.href ? (
                <Link href={c.href} className="block h-full" aria-label={`${c.label}: ${STATUS_LABEL[c.status]}. ${c.detail}`}>
                  {inner}
                </Link>
              ) : (
                <div aria-label={`${c.label}: ${STATUS_LABEL[c.status]}. ${c.detail}`}>{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-[var(--color-text-muted)]">
        Green = data flows and Jarvis can read it. Amber = partly built. Gray dashed = planned, not available. Hover or long-press a capability for exactly what exists.
      </p>
    </div>
  );
}

function NodeShape({ c, x, y, lit }: { c: Capability; x: number; y: number; lit: boolean }) {
  const color = lit ? "var(--color-accent)" : STATUS_COLOR[c.status];
  const body = (
    <g>
      {lit ? <circle cx={x} cy={y} r={30} fill="var(--color-accent)" opacity={0.15} /> : null}
      <circle cx={x} cy={y} r={22} fill="var(--color-surface-1)" stroke={color} strokeWidth={lit ? 2 : 1.2} strokeDasharray={c.status === "planned" ? "3 3" : undefined} />
      <circle cx={x} cy={y} r={4} fill={color} />
      <text x={x} y={y + 38} textAnchor="middle" fontSize="11.5" fill="var(--color-text-secondary)">
        {c.label}
      </text>
      <title>{`${c.label} — ${STATUS_LABEL[c.status]}. ${c.detail}`}</title>
    </g>
  );
  return c.href ? (
    <a href={c.href} aria-label={c.label} style={{ cursor: "pointer" }}>
      {body}
    </a>
  ) : (
    body
  );
}
