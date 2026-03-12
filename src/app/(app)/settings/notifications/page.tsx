import { requireAuth } from "@/lib/auth";
import { can } from "@/lib/constants/roles";
import { createClient } from "@/lib/supabase/server";
import { NotificationPreferencesPanel } from "./notification-preferences-panel";

const defaultEventTypes = [
  { type: "application.new", label: "New Application", description: "When a new application is submitted" },
  { type: "application.stage_changed", label: "Stage Changed", description: "When an application moves to a new stage" },
  { type: "interview.scheduled", label: "Interview Scheduled", description: "When a new interview is scheduled" },
  { type: "interview.reminder.24h", label: "Interview Reminder (24h)", description: "24 hours before an interview" },
  { type: "interview.reminder.1h", label: "Interview Reminder (1h)", description: "1 hour before an interview" },
  { type: "scorecard.submitted", label: "Scorecard Submitted", description: "When a scorecard evaluation is completed" },
  { type: "offer.sent", label: "Offer Sent", description: "When an offer letter is sent to a candidate" },
  { type: "offer.accepted", label: "Offer Accepted", description: "When a candidate accepts an offer" },
];

export default async function NotificationsSettingsPage() {
  const session = await requireAuth();
  const canManage = can(session.orgRole, "notifications:manage");
  const supabase = await createClient();

  const { data: preferences } = await supabase
    .from("notification_preferences")
    .select("id, event_type, channel")
    .eq("organization_id", session.orgId)
    .eq("user_id", session.userId)
    .is("deleted_at", null)
    .order("event_type");

  // Build a map of event_type -> channel for easier lookup
  const prefMap: Record<string, string> = {};
  for (const pref of preferences ?? []) {
    prefMap[pref.event_type] = pref.channel;
  }

  return (
    <div>
      <div>
        <h2 className="text-lg font-semibold">Notification Preferences</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose how you receive notifications for each event type.
        </p>
      </div>

      <div className="mt-6">
        <NotificationPreferencesPanel
          eventTypes={defaultEventTypes}
          currentPreferences={prefMap}
          canManage={canManage}
        />
      </div>
    </div>
  );
}
