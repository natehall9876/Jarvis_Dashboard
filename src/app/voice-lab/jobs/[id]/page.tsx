import { notFound } from "next/navigation";
import { JobDetailView } from "@/components/jobs/job-detail-view";
import { updateJob, changeJobStatus } from "@/lib/actions/jobs";
import { FIXTURE_JOBS, FIXTURE_ACTIVITY, FIXTURE_NOTES, FIXTURE_PHOTO_URLS } from "./fixtures";

/**
 * Renders the REAL job detail view (src/components/jobs/job-detail-view.tsx
 * — the exact component the authenticated app uses, not a hand-built
 * lookalike) with fixture data instead of a live Supabase fetch. Dev-only,
 * 404s in production (see ../layout.tsx), and reachable without signing
 * in — the same as every other /voice-lab page. This does not weaken
 * production auth: the real dashboard routes under (dashboard)/ are
 * unaffected and still require a session; this is a separate, parallel
 * dev harness route, not a bypass of the real one.
 *
 * Bound to the REAL updateJob/changeJobStatus server actions (not stubs —
 * a plain inline function can't cross the server/client boundary into
 * StatusQuickChange/JobForm, both "use client": Next.js requires an actual
 * "use server" action reference there, confirmed by hitting exactly that
 * error while building this page). Same for JobNotes/PhotoUploadForm below,
 * which import their real server actions (addJobNote /
 * prepareJobPhotoUpload) directly, unconditionally. All of this is safe to
 * do from this unauthenticated route: every one of these actions
 * independently requires a real signed-in Supabase Auth session before
 * touching the database (see jobs.ts/notes-tasks.ts/photos.ts), and even if
 * that check were somehow bypassed, RLS's `for all to authenticated` policy
 * grants nothing to the unauthenticated `anon` role this page is visited
 * as. A real tap on "Save note", a real status change, or a real photo
 * upload attempt here fails closed with an honest error — the same
 * behavior worth seeing during the mobile pass — and never reaches a real
 * database write.
 *
 * Two fixtures: lab-job-1 (a normal, fully populated job) and
 * lab-job-error (every section-level error state at once — crew,
 * equipment, materials, and photo previews all failing — which is exactly
 * what the job-page section-isolation fix added this session needs to be
 * checked against visually, not just unit-tested).
 */
export default async function LabJob({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = FIXTURE_JOBS[id];
  if (!job) notFound();

  return (
    <JobDetailView
      id={id}
      job={job}
      photoUrls={id === "lab-job-error" ? new Map() : new Map(Object.entries(FIXTURE_PHOTO_URLS))}
      photoUrlsError={id === "lab-job-error" ? "Storage temporarily unavailable (503)" : null}
      activity={FIXTURE_ACTIVITY}
      jobNotes={FIXTURE_NOTES}
      isEditing={false}
      properties={[]}
      services={[]}
      routes={[]}
      employees={[]}
      updateJobAction={updateJob.bind(null, id)}
      changeStatusAction={changeJobStatus.bind(null, id, `/voice-lab/jobs/${id}`)}
    />
  );
}
