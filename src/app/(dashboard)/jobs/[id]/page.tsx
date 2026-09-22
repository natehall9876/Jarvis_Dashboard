import { notFound } from "next/navigation";
import { ErrorState, NotConfiguredState } from "@/components/ui/states";
import { getJobPhotoUrls } from "@/lib/supabase/storage";
import { getJobById } from "@/lib/data/jobs";
import { getPropertyOptions, getServiceOptions, getRouteOptions, getEmployeeOptions } from "@/lib/data/options";
import { updateJob, changeJobStatus } from "@/lib/actions/jobs";
import { getActivityForEntity } from "@/lib/data/activity-log";
import { getJobNotes } from "@/lib/data/notes-tasks";
import { JobDetailView } from "@/components/jobs/job-detail-view";

export const dynamic = "force-dynamic";

export default async function JobDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string; error?: string }>;
}) {
  const { id } = await params;
  const { edit: isEditing, error: formError } = await searchParams;
  const [{ data: job, error }, properties, services, routes, employees, { data: activity }, jobNotes] = await Promise.all([
    getJobById(id),
    isEditing ? getPropertyOptions() : Promise.resolve({ data: [] }),
    isEditing ? getServiceOptions() : Promise.resolve({ data: [] }),
    isEditing ? getRouteOptions() : Promise.resolve({ data: [] }),
    isEditing ? getEmployeeOptions() : Promise.resolve({ data: [] }),
    getActivityForEntity("job", id),
    getJobNotes(id),
  ]);

  if (error?.includes("not configured")) return <NotConfiguredState />;
  if (error) return <ErrorState description={error} />;
  if (!job) notFound();

  const { urls: photoUrls, error: photoUrlsError } = await getJobPhotoUrls(job.photos.map((p) => p.storage_path));

  return (
    <JobDetailView
      id={id}
      job={job}
      photoUrls={photoUrls}
      photoUrlsError={photoUrlsError}
      activity={activity ?? []}
      jobNotes={jobNotes}
      isEditing={Boolean(isEditing)}
      formError={formError}
      properties={properties.data ?? []}
      services={services.data ?? []}
      routes={routes.data ?? []}
      employees={employees.data ?? []}
      updateJobAction={updateJob.bind(null, id)}
      changeStatusAction={changeJobStatus.bind(null, id, `/jobs/${id}`)}
    />
  );
}
