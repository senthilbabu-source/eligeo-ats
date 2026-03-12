"use client";

import { useState, useTransition } from "react";
import { setNotificationPreference } from "@/lib/actions/notifications";
import type { NotificationChannel } from "@/lib/types/ground-truth";

const channelOptions: { value: NotificationChannel; label: string }[] = [
  { value: "email", label: "Email" },
  { value: "in_app", label: "In-App" },
  { value: "both", label: "Both" },
  { value: "none", label: "None" },
];

interface EventType {
  type: string;
  label: string;
  description: string;
}

interface Props {
  eventTypes: EventType[];
  currentPreferences: Record<string, string>;
  canManage: boolean;
}

export function NotificationPreferencesPanel({
  eventTypes,
  currentPreferences,
  canManage,
}: Props) {
  const [prefs, setPrefs] = useState(currentPreferences);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  function handleChange(eventType: string, channel: string) {
    setPrefs((prev) => ({ ...prev, [eventType]: channel }));
    setSaved(null);
    setError(null);

    startTransition(async () => {
      const result = await setNotificationPreference({
        event_type: eventType,
        channel: channel as NotificationChannel,
      });

      if (result.error) {
        setError(result.error);
      } else {
        setSaved(eventType);
      }
    });
  }

  return (
    <div className="space-y-1">
      <div className="grid grid-cols-[1fr_auto] gap-4 border-b border-border pb-2">
        <span className="text-xs font-medium uppercase text-muted-foreground">
          Event
        </span>
        <span className="text-xs font-medium uppercase text-muted-foreground">
          Channel
        </span>
      </div>

      {eventTypes.map((evt) => (
        <div
          key={evt.type}
          className="grid grid-cols-[1fr_auto] items-center gap-4 rounded-md px-2 py-3 transition-colors hover:bg-muted/50"
        >
          <div>
            <p className="text-sm font-medium">{evt.label}</p>
            <p className="text-xs text-muted-foreground">{evt.description}</p>
          </div>
          <select
            value={prefs[evt.type] ?? "email"}
            onChange={(e) => handleChange(evt.type, e.target.value)}
            disabled={!canManage || isPending}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            {channelOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      ))}

      {error && (
        <p className="mt-2 text-sm text-destructive">{error}</p>
      )}
      {saved && (
        <p className="mt-2 text-sm text-green-600">Preference saved.</p>
      )}
    </div>
  );
}
