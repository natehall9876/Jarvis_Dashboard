import type { JobDetail } from "@/lib/data/jobs";
import type { ActivityEvent } from "@/lib/data/activity-log";
import type { JobNote } from "@/lib/data/notes-tasks";

/**
 * FIXTURE DATA — not real business data, not read from any database. Two
 * scenarios for the mobile review pass: "lab-job-1" is a normal, fully
 * populated job (the common case); "lab-job-error" deliberately triggers
 * every section-level error state added this session (see
 * src/lib/data/jobs.ts's JobDetail.sectionErrors and
 * src/lib/supabase/storage.ts's getJobPhotoUrls), which real data almost
 * never exercises but the UI must still render correctly and legibly at
 * phone width.
 */

const BASE_JOB = {
  id: "lab-job-1",
  created_at: "2026-09-01T12:00:00Z",
  updated_at: "2026-09-20T12:00:00Z",
  property_id: "lab-property-1",
  service_id: "lab-service-1",
  service_agreement_id: null,
  route_id: null,
  scheduled_date: "2026-09-24",
  scheduled_start_time: "09:00:00",
  stop_order: null,
  status: "scheduled",
  price: 185,
  budgeted_hours: 1.5,
  actual_hours: null,
  crew_size: 2,
  notes: "Gate code is 4471. Dog is friendly but will bark.",
  completion_notes: null,
  started_at: null,
  completed_at: null,
  homeworks_id: "57158869",
};

const PROPERTY = {
  id: "lab-property-1",
  street: "42 Meadowbrook Lane",
  city: "Smithfield",
  client: { id: "lab-client-1", first_name: "Tara", last_name: "Zelano", company_name: null, data_source: "homeworks_sync" as const },
};

function job(overrides: Partial<JobDetail>): JobDetail {
  return {
    ...BASE_JOB,
    property: PROPERTY as JobDetail["property"],
    service: { id: "lab-service-1", name: "Lawn Maintenance" },
    crew: [
      { id: "lab-emp-1", first_name: "Marcus", last_name: "Diallo", hours_worked: null },
      { id: "lab-emp-2", first_name: "Sofia", last_name: "Reyes", hours_worked: null },
    ],
    time_entries: [],
    equipment: [{ id: "lab-je-1", job_id: "lab-job-1", equipment_id: "lab-eq-1", hours_used: 1.5, equipment: { id: "lab-eq-1", name: "Zero-turn mower #2" } } as JobDetail["equipment"][number]],
    materials: [{ id: "lab-jm-1", job_id: "lab-job-1", material_name: "Fertilizer (fall blend)", quantity: 2, unit: "bags" } as JobDetail["materials"][number]],
    photos: [],
    sectionErrors: { crew: null, timeEntries: null, equipment: null, materials: null, photos: null },
    ...overrides,
  } as JobDetail;
}

export const FIXTURE_JOBS: Record<string, JobDetail> = {
  "lab-job-1": job({}),
  "lab-job-error": job({
    crew: [],
    equipment: [],
    materials: [],
    photos: [
      { id: "lab-photo-1", job_id: "lab-job-1", storage_path: "lab/unreachable.jpg", caption: "Before", photo_type: "before", created_at: "2026-09-20T12:00:00Z" } as JobDetail["photos"][number],
    ],
    sectionErrors: {
      crew: "permission denied for table job_employees",
      equipment: "relation \"public.job_equipment\" does not exist",
      materials: "canceling statement due to statement timeout",
      timeEntries: null,
      photos: null,
    },
  }),
};

export const FIXTURE_PHOTO_URLS_ERROR: Record<string, string | null> = {
  "lab-job-1": null,
  "lab-job-error": "Storage temporarily unavailable (503)",
};

export const FIXTURE_ACTIVITY: ActivityEvent[] = [
  { id: "lab-a1", createdAt: "2026-09-20T14:32:00Z", entityType: "job", entityId: "lab-job-1", eventType: "job_created", summary: "Job synced from Homeworks", detail: null, source: "system" },
  { id: "lab-a2", createdAt: "2026-09-21T09:10:00Z", entityType: "job", entityId: "lab-job-1", eventType: "job_note_added", summary: "Note added", detail: null, source: "owner" },
];

export const FIXTURE_NOTES: { data: JobNote[]; needsMigration: boolean; error: string | null } = {
  data: [{ id: "lab-note-1", createdAt: "2026-09-21T09:10:00Z", body: "Called ahead — customer wants the back bed skipped this visit.", source: "owner" }],
  needsMigration: false,
  error: null,
};
