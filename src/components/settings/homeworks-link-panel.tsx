"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  confirmHomeworksLinks,
  previewHomeworksLinking,
  type LinkConfirmResult,
  type LinkPreviewResult,
} from "@/lib/actions/homeworks-link";
import type { CustomerPlanRow, FieldDiff, FieldFill, PropertyPlanRow } from "@/lib/integrations/homeworks-linking";

function Changes({ fills, untouched, extra }: { fills: FieldFill[]; untouched: FieldDiff[]; extra: string[] }) {
  return (
    <div className="mt-1 grid gap-1 text-[11px] sm:grid-cols-2">
      <div>
        <div className="font-medium text-[var(--color-text-secondary)]">Will change</div>
        <ul className="text-[var(--color-text-muted)]">
          {extra.map((e) => (
            <li key={e}>{e}</li>
          ))}
          {fills.map((f) => (
            <li key={f.field}>
              {f.field}: blank &rarr; &ldquo;{f.value}&rdquo;
            </li>
          ))}
        </ul>
      </div>
      <div>
        <div className="font-medium text-[var(--color-text-secondary)]">Stays untouched</div>
        <ul className="text-[var(--color-text-muted)]">
          <li>notes, pricing, photos, jobs, all other fields</li>
          {untouched.map((d) => (
            <li key={d.field}>
              {d.field}: keeps &ldquo;{d.jarvis}&rdquo; (Homeworks has &ldquo;{d.homeworks}&rdquo;)
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function HeldList({ title, tone, rows }: { title: string; tone: string; rows: { key: string; label: string; detail: string }[] }) {
  if (rows.length === 0) return null;
  return (
    <details className="text-xs">
      <summary className={`cursor-pointer ${tone}`}>
        {title} ({rows.length})
      </summary>
      <ul className="mt-1 max-h-56 space-y-1 overflow-y-auto">
        {rows.map((r) => (
          <li key={r.key}>
            <span className="text-[var(--color-text-primary)]">{r.label}</span>
            <span className="text-[var(--color-text-muted)]"> — {r.detail}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * One-time workflow that links existing (Zapier-imported) Jarvis clients and
 * properties to their Homeworks IDs. Preview is read-only; the separate
 * "Confirm safe links" button writes only the rows still checked. Nothing is
 * created, merged, or deleted.
 */
export function HomeworksLinkPanel({ onLinked }: { onLinked: () => void }) {
  const [preview, setPreview] = useState<LinkPreviewResult | null>(null);
  const [result, setResult] = useState<LinkConfirmResult | null>(null);
  const [customerSel, setCustomerSel] = useState<Set<string>>(new Set());
  const [propertySel, setPropertySel] = useState<Set<string>>(new Set());
  const [previewPending, startPreview] = useTransition();
  const [confirmPending, startConfirm] = useTransition();

  function load(keepResult = false) {
    if (!keepResult) setResult(null);
    startPreview(async () => {
      const res = await previewHomeworksLinking();
      setPreview(res);
      if (res.ok) {
        const safeCustomers = res.plan.customers.filter((c) => c.status === "safe_link");
        setCustomerSel(new Set(safeCustomers.map((c) => c.hwId)));
        setPropertySel(new Set(safeCustomers.flatMap((c) => c.properties.filter((p) => p.status === "safe_link").map((p) => p.hwId))));
      }
    });
  }

  function toggle(set: Set<string>, setter: (s: Set<string>) => void, id: string) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  }

  function confirm() {
    if (!preview || !preview.ok) return;
    const safeCustomers = preview.plan.customers.filter((c) => c.status === "safe_link" && customerSel.has(c.hwId));
    const props = safeCustomers.flatMap((c) => c.properties.filter((p) => p.status === "safe_link" && propertySel.has(p.hwId)));
    const ok = window.confirm(
      `Link ${safeCustomers.length} existing client(s) and ${props.length} existing propert${props.length === 1 ? "y" : "ies"} to their Homeworks IDs?\n\n` +
        `This saves the Homeworks ID on records you already have and fills only blank fields. It creates, merges, and deletes nothing.`,
    );
    if (!ok) return;
    startConfirm(async () => {
      const res = await confirmHomeworksLinks({ customerIds: [...customerSel], propertyIds: [...propertySel] });
      setResult(res);
      if (res.ok) {
        onLinked();
        load(true);
      }
    });
  }

  const p = preview && preview.ok ? preview : null;
  const rows = p ? p.plan.customers : [];
  const safe = rows.filter((c) => c.status === "safe_link");
  const selectedCustomerCount = safe.filter((c) => customerSel.has(c.hwId)).length;
  const selectedPropertyCount = safe.filter((c) => customerSel.has(c.hwId)).flatMap((c) => c.properties.filter((x) => x.status === "safe_link" && propertySel.has(x.hwId))).length;
  const allProps = rows.flatMap((c) => c.properties.map((x) => ({ c, x })));

  return (
    <div className="space-y-2 border-t border-[var(--color-border)] pt-3">
      <p className="text-xs font-medium text-[var(--color-text-primary)]">Link existing records (one-time)</p>
      <p className="text-[11px] text-[var(--color-text-muted)]">
        Matches your existing Zapier-imported clients to Homeworks by exact phone number, then their properties by exact address. Read-only until you
        confirm; never creates, merges, or deletes anything.
      </p>
      <Button type="button" variant="secondary" onClick={() => load()} disabled={previewPending}>
        {previewPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        Preview linking (read-only)
      </Button>

      {preview && !preview.ok ? (
        <p className="flex items-start gap-1.5 text-xs text-[var(--color-critical)]">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {preview.message}
        </p>
      ) : null}

      {p ? (
        <div className="space-y-2 rounded-lg border border-[var(--color-border)] p-2">
          <p className="text-xs text-[var(--color-text-secondary)]">
            {p.homeworksCustomerCount} Homeworks customers compared against {p.jarvisClientCount} Jarvis clients and {p.jarvisPropertyCount} properties.
          </p>
          <div className="grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
            {[
              ["Safe customer links", p.plan.counts.safeCustomerLinks, "text-[var(--color-accent)]"],
              ["Safe property links", p.plan.counts.safePropertyLinks, "text-[var(--color-accent)]"],
              ["Already linked (updates)", p.plan.counts.alreadyLinkedCustomers + p.plan.counts.alreadyLinkedProperties, "text-[var(--color-info)]"],
              ["New customers", p.plan.counts.newCustomers, "text-[var(--color-text-primary)]"],
              ["New properties", p.plan.counts.newProperties, "text-[var(--color-text-primary)]"],
              ["Manual review", p.plan.counts.manualReview, "text-[var(--color-warning)]"],
              ["Ambiguous", p.plan.counts.ambiguous, "text-[var(--color-warning)]"],
            ].map(([label, n, tone]) => (
              <div key={label as string} className="rounded-md bg-[var(--color-surface-2)] p-2">
                <div className={`text-lg font-semibold ${tone}`}>{n as number}</div>
                <div className="text-[var(--color-text-muted)]">{label as string}</div>
              </div>
            ))}
          </div>

          {safe.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-[var(--color-text-primary)]">Safe links — uncheck any you don&apos;t want</p>
              <ul className="max-h-96 space-y-2 overflow-y-auto">
                {safe.map((c: CustomerPlanRow) => (
                  <li key={c.hwId} className="rounded-md border border-[var(--color-border)] p-2 text-xs">
                    <label className="flex items-start gap-2">
                      <input type="checkbox" className="mt-0.5" checked={customerSel.has(c.hwId)} onChange={() => toggle(customerSel, setCustomerSel, c.hwId)} />
                      <span>
                        <span className="text-[var(--color-text-primary)]">{c.hwName}</span>
                        <span className="text-[var(--color-text-muted)]"> (Homeworks) &rarr; </span>
                        <span className="text-[var(--color-text-primary)]">{c.client?.name}</span>
                        <span className="text-[var(--color-text-muted)]"> (Jarvis, phone {c.matchedPhone})</span>
                        <span className="block text-[11px] text-[var(--color-text-muted)]">{c.reason}</span>
                      </span>
                    </label>
                    <Changes
                      fills={c.fills}
                      untouched={c.untouched}
                      extra={[`homeworks_id: empty → ${c.hwId}`, ...(c.dataSourceChange ? [`data_source: ${c.dataSourceChange.from} → ${c.dataSourceChange.to}`] : [])]}
                    />
                    {c.properties.filter((x: PropertyPlanRow) => x.status === "safe_link").map((x: PropertyPlanRow) => (
                      <div key={x.hwId} className="mt-1.5 border-l-2 border-[var(--color-border)] pl-2">
                        <label className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={propertySel.has(x.hwId) && customerSel.has(c.hwId)}
                            disabled={!customerSel.has(c.hwId)}
                            onChange={() => toggle(propertySel, setPropertySel, x.hwId)}
                          />
                          <span>
                            <span className="text-[var(--color-text-primary)]">{x.label}</span>
                            <span className="text-[var(--color-text-muted)]"> (Homeworks) &rarr; {x.property?.label} (Jarvis)</span>
                            <span className="block text-[11px] text-[var(--color-text-muted)]">{x.reason}</span>
                          </span>
                        </label>
                        <Changes fills={x.fills} untouched={x.untouched} extra={[`homeworks_id: empty → ${x.hwId}`]} />
                      </div>
                    ))}
                  </li>
                ))}
              </ul>
              <Button type="button" onClick={confirm} disabled={confirmPending || selectedCustomerCount === 0} className="w-full justify-center">
                {confirmPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Confirm safe links ({selectedCustomerCount} client{selectedCustomerCount === 1 ? "" : "s"}, {selectedPropertyCount} propert
                {selectedPropertyCount === 1 ? "y" : "ies"})
              </Button>
            </div>
          ) : (
            <p className="text-xs text-[var(--color-text-muted)]">No safe links to confirm right now.</p>
          )}

          <HeldList
            title="Ambiguous matches — not linked"
            tone="text-[var(--color-warning)]"
            rows={[
              ...rows.filter((c) => c.status === "ambiguous").map((c) => ({ key: c.hwId, label: c.hwName, detail: `${c.reason} Candidates: ${c.candidates?.map((x) => x.name).join("; ")}` })),
              ...allProps.filter(({ x }) => x.status === "ambiguous").map(({ c, x }) => ({ key: x.hwId, label: `${c.hwName} — ${x.label}`, detail: x.reason })),
            ]}
          />
          <HeldList
            title="Manual review required — not linked"
            tone="text-[var(--color-warning)]"
            rows={[
              ...rows.filter((c) => c.status === "manual_review").map((c) => ({ key: c.hwId, label: c.hwName, detail: c.reason })),
              ...allProps.filter(({ x }) => x.status === "manual_review").map(({ c, x }) => ({ key: x.hwId, label: `${c.hwName} — ${x.label}`, detail: x.reason })),
            ]}
          />
          <HeldList
            title="New customers — no existing Jarvis match (not created here)"
            tone="text-[var(--color-text-secondary)]"
            rows={rows.filter((c) => c.status === "new_customer").map((c) => ({ key: c.hwId, label: c.hwName, detail: c.reason }))}
          />
          <HeldList
            title="New properties — no address match (not created here)"
            tone="text-[var(--color-text-secondary)]"
            rows={allProps.filter(({ x }) => x.status === "new_property").map(({ c, x }) => ({ key: x.hwId, label: `${c.hwName} — ${x.label}`, detail: x.reason }))}
          />
          <HeldList
            title="Already linked — treated as updates, not duplicates"
            tone="text-[var(--color-info)]"
            rows={[
              ...rows.filter((c) => c.status === "already_linked").map((c) => ({ key: c.hwId, label: c.hwName, detail: `→ ${c.client?.name}` })),
              ...allProps.filter(({ x }) => x.status === "already_linked").map(({ c, x }) => ({ key: x.hwId, label: `${c.hwName} — ${x.label}`, detail: "property already linked" })),
            ]}
          />
        </div>
      ) : null}

      {result && !result.ok ? (
        <p className="flex items-start gap-1.5 text-xs text-[var(--color-critical)]">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Linking failed: {result.message}
        </p>
      ) : null}
      {result && result.ok ? (
        <div className="space-y-1.5 rounded-lg border border-[var(--color-accent)]/40 p-2">
          <p className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-accent)]">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Linked {result.customersLinked} client(s) and {result.propertiesLinked} propert{result.propertiesLinked === 1 ? "y" : "ies"}; filled{" "}
            {result.fieldsFilled} blank field(s); created {result.created}; skipped {result.skipped}
            {result.errors > 0 ? `; ${result.errors} error(s)` : ""}. Previews were re-run below.
          </p>
          <details className="text-xs">
            <summary className="cursor-pointer text-[var(--color-text-secondary)]">Audit log ({result.audit.length} records)</summary>
            <ul className="mt-1 max-h-56 space-y-1 overflow-y-auto text-[var(--color-text-muted)]">
              {result.audit.map((a) => (
                <li key={`${a.kind}-${a.hwId}`}>
                  <span className="text-[var(--color-text-primary)]">
                    [{a.outcome}] {a.kind} {a.label}
                  </span>{" "}
                  — {a.detail}
                </li>
              ))}
            </ul>
          </details>
        </div>
      ) : null}
    </div>
  );
}
