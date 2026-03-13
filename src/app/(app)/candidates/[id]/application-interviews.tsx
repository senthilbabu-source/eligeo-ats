import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { can } from "@/lib/constants/roles";
import { getUserTimezone } from "@/lib/datetime-server";
import { InterviewList } from "./interview-list";
import type { InterviewCardData } from "./interview-card";

interface ApplicationInterviewsProps {
  applicationId: string;
}

export async function ApplicationInterviews({ applicationId }: ApplicationInterviewsProps) {
  const session = await requireAuth();
  const supabase = await createClient();

  if (!can(session.orgRole, "interviews:view")) {
    return null;
  }

  // Fetch interviews for this application
  const { data: interviews } = await supabase
    .from("interviews")
    .select(
      `id, interview_type, scheduled_at, duration_minutes, location,
       meeting_url, status, notes, scorecard_template_id,
       feedback_deadline_at, interviewer_id, created_at`,
    )
    .eq("application_id", applicationId)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .order("scheduled_at", { ascending: true, nullsFirst: false });

  // Fetch interviewer names via pre-fetch + .in() (Supabase type quirk)
  const interviewerIds = [
    ...new Set((interviews ?? []).map((i) => i.interviewer_id)),
  ];

  let interviewerNames: Map<string, string> = new Map();
  if (interviewerIds.length > 0) {
    const { data: profiles } = await supabase
      .from("user_profiles")
      .select("id, full_name")
      .in("id", interviewerIds);
    interviewerNames = new Map(
      (profiles ?? []).map((p) => [p.id, p.full_name ?? "Unknown"]),
    );
  }

  // Check which interviews have scorecard submissions from current user
  const interviewIds = (interviews ?? []).map((i) => i.id);
  let submissionsByInterview: Set<string> = new Set();
  if (interviewIds.length > 0) {
    const { data: submissions } = await supabase
      .from("scorecard_submissions")
      .select("interview_id")
      .in("interview_id", interviewIds)
      .eq("organization_id", session.orgId)
      .is("deleted_at", null);
    submissionsByInterview = new Set(
      (submissions ?? []).map((s) => s.interview_id),
    );
  }

  const interviewCards: InterviewCardData[] = (interviews ?? []).map((i) => ({
    id: i.id,
    interview_type: i.interview_type,
    scheduled_at: i.scheduled_at,
    duration_minutes: i.duration_minutes,
    location: i.location,
    meeting_url: i.meeting_url,
    status: i.status,
    notes: i.notes,
    scorecard_template_id: i.scorecard_template_id,
    feedback_deadline_at: i.feedback_deadline_at,
    interviewer_id: i.interviewer_id,
    interviewer_name: interviewerNames.get(i.interviewer_id) ?? "Unknown",
    created_at: i.created_at,
    has_submission: submissionsByInterview.has(i.id),
  }));

  // Fetch org members for interviewer picker (anyone with interviews:view or higher)
  const { data: members } = await supabase
    .from("organization_members")
    .select("user_id, role")
    .eq("organization_id", session.orgId)
    .is("deleted_at", null);

  const memberUserIds = (members ?? []).map((m) => m.user_id);
  let memberProfiles: Array<{ id: string; full_name: string }> = [];
  if (memberUserIds.length > 0) {
    const { data: profiles } = await supabase
      .from("user_profiles")
      .select("id, full_name")
      .in("id", memberUserIds);
    memberProfiles = (profiles ?? []).map((p) => ({
      id: p.id,
      full_name: p.full_name ?? "Unknown",
    }));
  }

  // Fetch scorecard templates for the schedule modal
  const { data: templates } = await supabase
    .from("scorecard_templates")
    .select("id, name")
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .order("name");

  const timezone = await getUserTimezone(session.userId, session.orgId);

  return (
    <InterviewList
      applicationId={applicationId}
      interviews={interviewCards}
      canCreate={can(session.orgRole, "interviews:create")}
      canEdit={can(session.orgRole, "interviews:edit")}
      canSubmitScorecard={can(session.orgRole, "scorecards:submit")}
      currentUserId={session.userId}
      interviewers={memberProfiles}
      templates={(templates ?? []).map((t) => ({ id: t.id, name: t.name }))}
      timezone={timezone}
    />
  );
}
