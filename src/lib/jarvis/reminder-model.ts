import { BUSINESS_TIMEZONE } from '@/lib/integrations/homeworks-dates';

export type ActivityPreferences = { owner_id?: string; background_enabled: boolean; reminders_enabled: boolean; speech_enabled: boolean; push_enabled: boolean; prep_minutes: number; travel_minutes: number; timezone: string; quiet_start: string; quiet_end: string };
export const DEFAULT_ACTIVITY_PREFERENCES: ActivityPreferences = { background_enabled: false, reminders_enabled: false, speech_enabled: false, push_enabled: false, prep_minutes: 10, travel_minutes: 20, timezone: BUSINESS_TIMEZONE, quiet_start: '21:00', quiet_end: '07:00' };
export type SourceEvent = { id: string; source: 'schedule'|'calendar'; title: string; starts_at: string; version: string; location?: string|null };
export type ActivityNotification = { id: string; title: string; body: string; created_at: string; acknowledged_at: string|null; snoozed_until: string|null; delivered_at: string|null; reminder_id: string|null; source_version: string|null };
export type BackgroundJob = { id: string; kind: 'operations'|'schedule'|'collections'; status: 'queued'|'running'|'completed'|'failed'; created_at: string; finished_at: string|null; result: {summary: string; facts: string[]; reviewed_at: string}|null; error: string|null };
export function validatePreferences(input: unknown): ActivityPreferences {
  if (!input || typeof input !== 'object') throw new Error('Preferences are required.');
  const p = input as Record<string, unknown>;
  for (const key of ['background_enabled','reminders_enabled','speech_enabled','push_enabled']) if (typeof p[key] !== 'boolean') throw new Error('Choose explicit notification preferences.');
  for (const key of ['prep_minutes','travel_minutes']) if (!Number.isInteger(p[key]) || Number(p[key]) < 0 || Number(p[key]) > 180) throw new Error('Preparation and travel estimates must be 0–180 minutes.');
  for (const key of ['quiet_start','quiet_end']) if (typeof p[key] !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(p[key] as string)) throw new Error('Use valid quiet-hour times.');
  if (typeof p.timezone !== 'string' || p.timezone.length > 100) throw new Error('Select a timezone.');
  try { new Intl.DateTimeFormat('en-US',{timeZone:p.timezone}).format(); } catch { throw new Error('Select a valid timezone.'); }
  return Object.fromEntries(Object.keys(DEFAULT_ACTIVITY_PREFERENCES).map(k=>[k,p[k]])) as ActivityPreferences;
}
export function isQuietTime(now: Date, p: ActivityPreferences): boolean {
  const value = new Intl.DateTimeFormat('en-GB',{timeZone:p.timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now);
  if (p.quiet_start === p.quiet_end) return false;
  return p.quiet_start < p.quiet_end ? value >= p.quiet_start && value < p.quiet_end : value >= p.quiet_start || value < p.quiet_end;
}
export function reminderFor(event: SourceEvent, p: ActivityPreferences) {
  if (!Number.isFinite(Date.parse(event.starts_at))) throw new Error('Event time is unavailable.');
  const due_at = new Date(Date.parse(event.starts_at) - (p.prep_minutes+p.travel_minutes)*60_000).toISOString();
  const source_version = `${event.version}|${event.starts_at}|${p.prep_minutes}|${p.travel_minutes}`;
  return { source_id: `${event.source}:${event.id}`, source_version, title: event.title, starts_at: event.starts_at, due_at, body: `${event.title} begins at ${new Intl.DateTimeFormat('en-US',{timeZone:p.timezone,hour:'numeric',minute:'2-digit'}).format(new Date(event.starts_at))}. Allow ${p.prep_minutes} minutes to prepare and ${p.travel_minutes} minutes for travel (your estimates${event.location ? '' : '; location unavailable'}). Your saved background reviews can continue while you step away.` };
}
/** Resolve an actual local Schedule time, refusing nonexistent DST wall times. */
export function scheduleInstant(date: string, time: string|null, zone = BUSINESS_TIMEZONE): string|null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !time || !/^\d{2}:\d{2}(:\d{2})?$/.test(time)) return null;
  const target = `${date}T${time.slice(0,5)}`;
  let instant = Date.parse(`${target}:00Z`);
  const parts = (ms:number) => new Intl.DateTimeFormat('sv-SE',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(ms)).replace(' ','T');
  for(let i=0;i<3;i++) instant += Date.parse(`${target}:00Z`) - Date.parse(`${parts(instant)}:00Z`);
  return parts(instant) === target ? new Date(instant).toISOString() : null;
}
