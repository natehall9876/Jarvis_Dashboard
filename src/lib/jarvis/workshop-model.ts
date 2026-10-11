import type { Job, PropertyWithClient, Quote, QuoteItem } from "@/types/domain";

export type WorkshopDetail = {
  property: PropertyWithClient;
  quotes: (Quote & { items: QuoteItem[] })[];
  jobs: (Job & { service: { name: string } | null })[];
  checkedAt: string;
};
export type WorkOption = { id: string; kind: "quote" | "job"; label: string; date: string; status: string; price: number | null; hours: number | null; scope: string[]; href: string };
export function workOptions(detail: WorkshopDetail): WorkOption[] {
  return [
    ...detail.quotes.filter(q => !q.homeworks_deleted).map(q => ({ id: `quote:${q.id}`, kind: "quote" as const, label: q.quote_number || "Recorded estimate", date: q.created_at, status: q.status, price: Number.isFinite(q.total) ? q.total : null,
      hours: q.items.length && q.items.every(i => i.budgeted_hours !== null) ? q.items.reduce((sum, i) => sum + (i.budgeted_hours ?? 0), 0) : null,
      scope: q.items.map(i => `${i.description} · recorded quantity ${i.quantity} × $${i.unit_price.toFixed(2)}${i.is_optional ? " (optional)" : ""}`), href: `/quotes/${q.id}` })),
    ...detail.jobs.filter(j => !j.homeworks_deleted).map(j => ({ id: `job:${j.id}`, kind: "job" as const, label: j.service?.name || "Recorded job", date: j.scheduled_date || j.created_at, status: j.status, price: j.price !== null && Number.isFinite(j.price) ? j.price : null, hours: j.budgeted_hours, scope: [j.notes || j.service?.name || "Service scope not recorded"], href: `/jobs/${j.id}` })),
  ];
}
export function priceDifference(a?: WorkOption, b?: WorkOption): number | null {
  return a?.price !== null && a?.price !== undefined && b?.price !== null && b?.price !== undefined ? b.price - a.price : null;
}
export type WorkshopView = { yaw: number; pitch: number; distance: number };
export const DEFAULT_VIEW: WorkshopView = { yaw: 0, pitch: 0.12, distance: 5.2 };
export type WorkshopSave = { version: 1; owner: string; propertyId: string; options: string[]; assumptions: string; view: WorkshopView; savedAt: string };
export const workshopKey = (owner: string) => `jarvis.workshop.v1:${owner}`;
export function readWorkshop(raw: string | null, owner: string): WorkshopSave | null {
  try {
    if (!raw || raw.length > 15000) return null;
    const value = JSON.parse(raw);
    if (value?.version !== 1 || value.owner !== owner || typeof value.propertyId !== "string" || !/^[\w-]{1,100}$/.test(value.propertyId) || !Array.isArray(value.options) || value.options.length > 2 || !value.options.every((id: unknown) => typeof id === "string" && /^(quote|job):[\w-]{1,100}$/.test(id)) || typeof value.assumptions !== "string" || value.assumptions.length > 6000 || typeof value.savedAt !== "string" || !Number.isFinite(Date.parse(value.savedAt))) return null;
    const v = value.view;
    if (!v || ![v.yaw, v.pitch, v.distance].every(n => typeof n === "number" && Number.isFinite(n)) || Math.abs(v.yaw) > 1000 || Math.abs(v.pitch) > 1.3 || v.distance < 2.6 || v.distance > 9) return null;
    return value as WorkshopSave;
  } catch { return null; }
}

export type HandPoint = { x: number; y: number; z?: number };
/** Normalize pinch to palm size, so moving nearer the camera isn't itself a pinch. */
export function handPose(points: HandPoint[]): { pinched: boolean; x: number; y: number; angle: number } | null {
  if (points.length < 21) return null;
  const distance = (a: HandPoint, b: HandPoint) => Math.hypot(a.x - b.x, a.y - b.y);
  const palm = distance(points[0], points[9]);
  if (palm < 0.02) return null;
  return { pinched: distance(points[4], points[8]) / palm < 0.33, x: (points[4].x + points[8].x) / 2, y: (points[4].y + points[8].y) / 2, angle: Math.atan2(points[9].y - points[0].y, points[9].x - points[0].x) };
}

/** The advisor accepts at most 2,000 characters; retain source IDs and safety instructions first. */
export function buildWorkshopReview(propertyId: string, optionIds: string[], assumptions: string): { prompt: string; truncated: boolean } {
  const prefix = `Review recorded scope and pricing for property ${propertyId}. Compare ${optionIds.slice(0, 2).join(" and ") || "its recent estimates and jobs"}. Use current records. Identify differences and missing measurements. Do not invent facts, change records, or send anything. My unverified assumptions: `;
  const note = " [Remaining assumptions omitted from this request.]";
  const text = assumptions || "none";
  const truncated = prefix.length + text.length > 2000;
  const allowance = Math.max(0, 2000 - prefix.length - (truncated ? note.length : 0));
  return { prompt: `${prefix}${text.slice(0, allowance)}${truncated ? note : ""}`, truncated };
}

export type WorkshopActivityNode = { id: string; label: string; kind: "capability" | "tool" };
/** Progress labels identify a real tool phase. Don't reuse lingering capability highlights during a fresh request. */
export function workshopActivityNodes(loading: boolean, progress: string | null, activeCapabilities: string[], toolsUsed: string[]): WorkshopActivityNode[] {
  const toolPhases = new Set(["Preparing an action for your review", "Checking your connections", "Checking the Homeworks source", "Reviewing what needs your attention", "Checking invoice records", "Checking your schedule and jobs", "Looking up the customer record", "Checking your tasks", "Checking business records"]);
  if (loading) return progress && toolPhases.has(progress) ? [...new Set(activeCapabilities)].slice(0, 8).map(id => ({ id: `capability:${id}`, label: `Active capability: ${id.replaceAll("_", " ")}`, kind: "capability" })) : [];
  return [...new Set(toolsUsed)].slice(-8).map(id => ({ id: `tool:${id}`, label: `Recorded tool: ${id.replaceAll("_", " ")}`, kind: "tool" }));
}
