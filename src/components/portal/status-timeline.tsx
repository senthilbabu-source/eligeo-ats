"use client";

import { formatInTz } from "@/lib/datetime";

interface TimelineEvent {
  event: string;
  date: string;
  stageType: string;
}

const STAGE_COLORS: Record<string, string> = {
  applied: "bg-blue-500",
  sourced: "bg-gray-500",
  screening: "bg-yellow-500",
  interview: "bg-purple-500",
  offer: "bg-emerald-500",
  hired: "bg-green-600",
  rejected: "bg-red-500",
  withdrawn: "bg-gray-400",
};

/**
 * D32 §5.1 — Chronological timeline of application status changes.
 * Renders on the candidate status portal page.
 */
export function StatusTimeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
    );
  }

  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-3 top-2 bottom-2 w-0.5 bg-border" />

      <ol className="space-y-4">
        {events.map((ev, i) => (
          <li key={i} className="relative pl-8">
            {/* Dot */}
            <span
              className={`absolute left-1.5 top-1.5 h-3 w-3 rounded-full ${STAGE_COLORS[ev.stageType] ?? "bg-gray-400"}`}
            />
            <p className="text-sm font-medium">{ev.event}</p>
            <time className="text-xs text-muted-foreground">
              {formatInTz(ev.date, "UTC", "long")}
            </time>
          </li>
        ))}
      </ol>
    </div>
  );
}
