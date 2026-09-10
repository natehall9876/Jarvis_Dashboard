import { Sparkles, User, Zap } from "lucide-react";
import { EmptyState } from "@/components/ui/states";
import type { ActivityEvent } from "@/lib/data/activity-log";

const SOURCE_ICON: Record<ActivityEvent["source"], React.ReactNode> = {
  jarvis: <Sparkles className="h-3 w-3" />,
  owner: <User className="h-3 w-3" />,
  system: <Zap className="h-3 w-3" />,
};

const SOURCE_LABEL: Record<ActivityEvent["source"], string> = {
  jarvis: "Jarvis",
  owner: "Owner",
  system: "System",
};

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Read-only timeline of activity_log rows for one record — "what happened
 * here?" Renders nothing dramatic when there's no history yet: either the
 * record is genuinely new, or (before supabase/activity-log-migration.sql
 * has been run) the table doesn't exist and getActivityForEntity already
 * degrades to an empty array rather than surfacing an error.
 */
export function ActivityTimeline({ events }: { events: ActivityEvent[] }) {
  if (events.length === 0) {
    return <EmptyState title="No activity recorded yet" description="Changes to this record will show up here." />;
  }

  return (
    <ol className="space-y-3">
      {events.map((event) => (
        <li key={event.id} className="flex gap-3 text-sm">
          <span
            className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-3)] text-[var(--color-text-muted)]"
            title={SOURCE_LABEL[event.source]}
          >
            {SOURCE_ICON[event.source]}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[var(--color-text-secondary)]">{event.summary}</p>
            <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">
              {formatTimestamp(event.createdAt)} · {SOURCE_LABEL[event.source]}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
