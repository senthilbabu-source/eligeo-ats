# Interview Scheduling & Scorecards

> **ID:** D07
> **Status:** Review
> **Priority:** P1
> **Last updated:** 2026-03-10
> **Depends on:** D01 (schema — `interviews`, `scorecard_templates`, `scorecard_categories`, `scorecard_attributes`, `scorecard_submissions`, `scorecard_ratings`, `nylas_grants`), D02 (API patterns), D03 (billing — AI credit gating), D05 (design — components)
> **Depended on by:** D06 (pipeline ordering — interviews before offers), D08 (Candidate Portal — self-scheduling), D09 (Communications — interview notifications), D12 (Workflow — stage auto-advance), D17 (Analytics — interview metrics)
> **Last validated against deps:** 2026-03-10
> **Architecture decisions assumed:** ADR-001 (Supabase client), ADR-006 (soft delete), ADR-007 (audit), ADR-008 (enums)

---

## 1. Overview

Interview Scheduling & Scorecards covers the full interview lifecycle: scheduling (manual and self-serve), calendar integration via Nylas, structured evaluation via scorecards with blind review, AI-powered feedback summarization, and interview analytics. Every interview is tied to an `application` (one candidate + one job opening).

**Scope:**
- In scope: Interview CRUD, scheduling (manual/self-service), Nylas calendar sync, panel interviews, scorecard templates, blind review, AI summarization, feedback deadlines, interview analytics.
- Out of scope: Video conferencing (external links only), interview prep content, candidate travel booking.

## 2. User Stories

| ID | Role | Story | Acceptance Criteria |
|----|------|-------|---------------------|
| US-01 | Recruiter | Schedule an interview with a specific interviewer | Given an application, when I create an interview, then a calendar event is created via Nylas and the interviewer is notified |
| US-02 | Recruiter | Schedule a panel interview with multiple interviewers | Given a job, when I create a panel interview, then individual interview records are created for each panelist sharing the same time slot |
| US-03 | Candidate | Self-schedule from available time slots | Given a self-scheduling link, when I pick a slot, then the interview is confirmed and calendar events are created |
| US-04 | Interviewer | Submit a scorecard after an interview | Given an interview I conducted, when I submit my scorecard, then my ratings are recorded and I can see others' feedback (blind review) |
| US-05 | Recruiter | View aggregated scorecard results | Given all scorecards for an application, when I open the scorecard summary, then I see per-attribute averages and overall recommendations |
| US-06 | Admin | Create and manage scorecard templates | Given I'm an admin, when I create a template with categories and attributes, then it's available for interviewers to use |
| US-07 | Recruiter | Get AI-generated feedback summary | Given all scorecards are submitted, when I request a summary, then AI generates a concise evaluation digest (gated by `ai_scorecard_summarize` flag) |
| US-08 | Recruiter | Track overdue feedback | Given a feedback deadline has passed, when I view the interview list, then overdue interviews are highlighted |

## 3. Data Model

### 3.1 Tables

Six tables defined in D01 schema ([schema/05-interviews-scorecards.md](../schema/05-interviews-scorecards.md)) plus one integration table:

- **`interviews`** — scheduled interview records with status tracking
- **`scorecard_templates`** — org-scoped evaluation form definitions
- **`scorecard_categories`** — weighted evaluation categories (e.g., "Technical Skills")
- **`scorecard_attributes`** — individual criteria within a category (e.g., "System Design")
- **`scorecard_submissions`** — interviewer feedback with blind review RLS
- **`scorecard_ratings`** — per-attribute 1–5 ratings within a submission
- **`nylas_grants`** ([schema/08-system-compliance.md](../schema/08-system-compliance.md)) — OAuth grants for calendar sync

### 3.2 Interview Status Machine

```
scheduled ──→ confirmed ──→ completed
    │              │             │
    └──→ cancelled  └──→ cancelled  (terminal)
    │
    └──→ no_show                    (terminal)
```

| Transition | Trigger | Side Effects |
|------------|---------|-------------|
| `scheduled` → `confirmed` | Interviewer accepts calendar invite (Nylas webhook) OR manual confirm | — |
| `scheduled` → `cancelled` | Recruiter/interviewer cancels | Cancel Nylas event, notify candidate |
| `confirmed` → `completed` | Interviewer submits scorecard OR recruiter marks complete | Unlock scorecard submission form |
| `confirmed` → `cancelled` | Recruiter cancels | Cancel Nylas event, notify candidate + interviewer |
| `scheduled`/`confirmed` → `no_show` | Recruiter marks no-show after scheduled time | Log in audit, notify hiring manager |

### 3.3 Scorecard Template Versioning (G-012 Resolution)

**Decision:** Snapshot-on-assign, not live-link.

When a `scorecard_template_id` is assigned to an `interviews` row, the template's current structure (categories + attributes) becomes the evaluation basis. If the template is later edited:

- **Existing interviews** retain the template version that was active at assignment. The `scorecard_template_id` FK still points to the same template, but submissions reference the `scorecard_attributes` rows that existed at assignment time (immutable via soft-delete — old attributes are soft-deleted, new ones created).
- **New interviews** get the updated template structure.
- **Scorecard submissions** always reference `attribute_id` → `scorecard_attributes(id)`. Since attributes are append-only (reorder = soft-delete + re-create per D01), existing ratings remain valid even after template changes.

This works because D01 defines `scorecard_categories` and `scorecard_attributes` as append-only tables. "Editing" a template means soft-deleting old rows and creating new ones. Old submissions still FK to the old (soft-deleted) attribute rows, which remain readable for historical display.

### 3.4 Blind Review UX Flow (G-011 Resolution)

**Decision:** Auto-reveal after own submission. No manual "reveal" button.

The blind review flow:

1. **Before submission:** Interviewer sees only the scorecard form for their own interview. Other interviewers' submissions for the same application are hidden (RLS enforced at DB level — D01 `scorecard_submissions_select` policy).
2. **After submission:** The moment an interviewer submits their scorecard, they can immediately see all other submitted scorecards for the same application. This is automatic — no panel lead click, no waiting for all interviewers.
3. **Privileged roles** (owner, admin, recruiter, hiring_manager) always see all scorecards regardless of whether they've submitted.

**Rationale:** Waiting for all interviewers creates friction and delays. Auto-reveal after own submission prevents bias (you can't change your score after seeing others) while enabling collaboration (you can discuss discrepancies immediately).

## 4. Interview Scheduling

### 4.1 Manual Scheduling

Recruiter selects interviewer, time, duration, and type. System:

1. Checks interviewer's Nylas grant exists (required for calendar sync)
2. Creates `interviews` row with `status = 'scheduled'`
3. Fires `interview/scheduled` Inngest event
4. Inngest function creates Nylas calendar event with:
   - Attendees: interviewer email, candidate email (from `applications` → `candidates`)
   - Location/meeting URL from the interview record
   - Description with job title and candidate name
5. Stores `nylas_event_id` on the interview record for two-way sync

```typescript
// Nylas calendar event creation [VERIFY]
const event = await nylas.events.create({
  identifier: grant.grant_id,
  requestBody: {
    title: `Interview: ${candidate.name} — ${job.title}`,
    when: {
      startTime: Math.floor(scheduledAt.getTime() / 1000),
      endTime: Math.floor(endTime.getTime() / 1000),
    },
    participants: [
      { email: interviewer.email },
      { email: candidate.email },
    ],
    location: interview.meeting_url || interview.location || '',
    conferencing: interview.meeting_url ? {
      provider: 'Google Meet',  // or detected from URL
      details: { url: interview.meeting_url },
    } : undefined,
  },
});
```

### 4.2 Panel Interviews

A panel interview is a group of individual `interviews` rows sharing the same time slot for the same application. No separate "panel" table — panels are modeled as multiple interviews with identical `scheduled_at` and `duration_minutes`.

**Creation flow:**
1. Recruiter selects multiple interviewers for one time slot
2. System creates N `interviews` rows (one per panelist), all with `interview_type = 'panel'`
3. Each panelist gets their own calendar invite and scorecard submission
4. UI groups them visually by matching `scheduled_at` + `application_id` + `interview_type = 'panel'`

### 4.3 Self-Scheduling

Candidate receives a link with available time slots. Available on Growth+ plans (feature gated).

**Flow:**
1. Recruiter generates a self-scheduling link for an application
2. System queries interviewer availability via Nylas free/busy API [VERIFY]
3. Candidate portal (D08) displays available slots
4. Candidate selects a slot → system creates the interview as `confirmed` (skips `scheduled`)
5. Calendar events created for both parties

```typescript
// Self-scheduling availability query [VERIFY]
const freeBusy = await nylas.calendars.getFreeBusy({
  identifier: grant.grant_id,
  requestBody: {
    startTime: Math.floor(rangeStart.getTime() / 1000),
    endTime: Math.floor(rangeEnd.getTime() / 1000),
    emails: [interviewer.email],
  },
});
```

**Constraints:**
- Slots offered in 30-min increments within recruiter-defined windows
- Buffer time (15 min default) between interviews
- Maximum 3 reschedules per candidate (prevent abuse)
- Link expires after 7 days or when the application moves stages

### 4.4 Nylas Calendar Sync

Two-way sync between ATS and interviewer calendars:

| Direction | Trigger | Action |
|-----------|---------|--------|
| ATS → Calendar | Interview created/updated/cancelled | Create/update/delete Nylas event |
| Calendar → ATS | Nylas webhook: `event.updated` | Update interview status (e.g., attendee accepted → `confirmed`) |
| Calendar → ATS | Nylas webhook: `event.deleted` | Mark interview `cancelled` if deleted externally |

**Nylas webhook handler** (registered in D02 §8 webhook receiver pattern):

```typescript
// Inngest function: interview/nylas-event-sync
export const nylasEventSync = inngest.createFunction(
  { id: 'interview-nylas-event-sync', retries: 3 },
  { event: 'interview/nylas-webhook' },
  async ({ event, step }) => {
    const { type, data } = event;
    if (type === 'event.updated') {
      // Map Nylas attendee status → interview status
      // accepted → confirmed, declined → cancelled
    }
    if (type === 'event.deleted') {
      // Soft-delete interview if Nylas event removed externally
    }
  }
);
```

**Disconnection handling:** If a user revokes their Nylas grant, existing interviews keep their data but calendar sync stops. UI shows a "Calendar disconnected" warning. Reconnecting re-links via `nylas_event_id`.

## 5. Scorecard Evaluation

### 5.1 Scorecard Submission Flow

1. Interview status reaches `completed` (or interviewer opens scorecard form for a `confirmed` interview)
2. Interviewer sees the scorecard template assigned to the interview:
   - Categories grouped by `position` order
   - Attributes within each category, ordered by `position`
   - 1–5 rating scale per attribute + optional notes
   - Overall recommendation: `strong_no` | `no` | `yes` | `strong_yes`
   - Overall notes (free text)
3. On submit:
   - Insert `scorecard_submissions` row
   - Insert `scorecard_ratings` rows (one per attribute)
   - If interview was `confirmed`, auto-transition to `completed`
   - Fire `scorecard/submitted` Inngest event (triggers notification to recruiter)

### 5.2 Scorecard Aggregation

For the scorecard summary panel (recruiter/hiring manager view):

```typescript
interface ScorecardSummary {
  applicationId: string;
  totalSubmissions: number;
  recommendations: {
    strong_yes: number;
    yes: number;
    no: number;
    strong_no: number;
  };
  categoryAverages: Array<{
    categoryId: string;
    categoryName: string;
    weight: number;
    avgRating: number;  // weighted average of attribute ratings
    attributes: Array<{
      attributeId: string;
      attributeName: string;
      avgRating: number;
      ratings: Array<{ submittedBy: string; rating: number; notes?: string }>;
    }>;
  }>;
  weightedOverall: number;  // category-weight-adjusted overall score (1–5)
}
```

**Weighted overall calculation:**

```sql
-- Per-submission weighted score
SELECT
  ss.id AS submission_id,
  SUM(sr.rating * sc.weight) / SUM(sc.weight) AS weighted_score
FROM scorecard_submissions ss
JOIN scorecard_ratings sr ON sr.submission_id = ss.id AND sr.deleted_at IS NULL
JOIN scorecard_attributes sa ON sa.id = sr.attribute_id AND sa.deleted_at IS NULL
JOIN scorecard_categories sc ON sc.id = sa.category_id AND sc.deleted_at IS NULL
WHERE ss.application_id = $application_id AND ss.deleted_at IS NULL
GROUP BY ss.id;
```

### 5.3 AI Scorecard Summarization

Gated by `ai_scorecard_summarize` feature flag (Pro + Enterprise only, per D03 feature matrix). Consumes 1 AI credit per summarization.

**Flow:**
1. Recruiter clicks "Generate AI Summary" on scorecard summary panel
2. Server Action checks `hasFeature(org, 'ai_scorecard_summarize')` and credit availability
3. Collects all submissions + ratings for the application
4. Sends to LLM with structured prompt:
   - Input: all ratings, notes, recommendations, category names
   - Output: 3–5 sentence summary highlighting consensus, disagreements, and key strengths/weaknesses
5. Stores result in `ai_usage_logs` with `action = 'feedback_summarize'`, `entity_type = 'application'`, `entity_id = application.id`
6. Summary displayed inline (not persisted as a separate record — regenerate on demand)

## 6. API Endpoints

All endpoints follow D02 conventions (JWT auth, RLS-scoped, RFC 9457 errors).

### 6.1 Interview Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/interviews` | JWT | List interviews (filterable by `application_id`, `job_id`, `interviewer_id`, `status`) |
| POST | `/api/v1/interviews` | JWT | Create interview (recruiter/hiring_manager/admin) |
| GET | `/api/v1/interviews/:id` | JWT | Get interview detail |
| PATCH | `/api/v1/interviews/:id` | JWT | Update interview (reschedule, change status) |
| DELETE | `/api/v1/interviews/:id` | JWT | Soft-delete (cancel) interview |
| POST | `/api/v1/interviews/:id/complete` | JWT | Mark interview complete |
| POST | `/api/v1/interviews/:id/no-show` | JWT | Mark interviewer/candidate no-show |
| GET | `/api/v1/interviews/availability` | JWT | Query interviewer availability (Nylas free/busy) |

### 6.2 Scorecard Template Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/scorecard-templates` | JWT | List templates for current organization |
| POST | `/api/v1/scorecard-templates` | JWT | Create template with categories + attributes |
| GET | `/api/v1/scorecard-templates/:id` | JWT | Get template detail (includes categories + attributes) |
| PATCH | `/api/v1/scorecard-templates/:id` | JWT | Update template (creates new attribute versions) |
| DELETE | `/api/v1/scorecard-templates/:id` | JWT | Soft-delete template |

### 6.3 Scorecard Submission Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/interviews/:id/scorecard` | JWT | Get scorecard form (template + any existing submission) |
| POST | `/api/v1/interviews/:id/scorecard` | JWT | Submit scorecard (creates submission + ratings) |
| PATCH | `/api/v1/scorecard-submissions/:id` | JWT | Update own submission (before deadline) |
| GET | `/api/v1/applications/:id/scorecards` | JWT | Get aggregated scorecard summary for application |
| POST | `/api/v1/applications/:id/scorecards/summarize` | JWT | Generate AI summary (feature-gated) |

### 6.4 Request/Response Schemas

```typescript
// POST /api/v1/interviews
const CreateInterviewSchema = z.object({
  application_id: z.string().uuid(),
  interviewer_id: z.string().uuid(),
  interview_type: z.enum(['phone_screen', 'technical', 'behavioral', 'panel', 'culture_fit', 'final', 'other']),
  scheduled_at: z.string().datetime(),
  duration_minutes: z.number().int().min(15).max(480).default(60),
  location: z.string().optional(),
  meeting_url: z.string().url().optional(),
  scorecard_template_id: z.string().uuid().optional(),
  feedback_deadline_at: z.string().datetime().optional(),
  notes: z.string().max(2000).optional(),
});

// POST /api/v1/interviews/:id/scorecard
const SubmitScorecardSchema = z.object({
  overall_recommendation: z.enum(['strong_no', 'no', 'yes', 'strong_yes']),
  overall_notes: z.string().max(5000).optional(),
  ratings: z.array(z.object({
    attribute_id: z.string().uuid(),
    rating: z.number().int().min(1).max(5),
    notes: z.string().max(2000).optional(),
  })).min(1),
});

// GET /api/v1/applications/:id/scorecards — response
const ScorecardSummaryResponse = z.object({
  application_id: z.string().uuid(),
  total_submissions: z.number(),
  recommendations: z.object({
    strong_yes: z.number(),
    yes: z.number(),
    no: z.number(),
    strong_no: z.number(),
  }),
  weighted_overall: z.number().min(1).max(5),
  categories: z.array(z.object({
    id: z.string().uuid(),
    name: z.string(),
    weight: z.number(),
    avg_rating: z.number(),
    attributes: z.array(z.object({
      id: z.string().uuid(),
      name: z.string(),
      avg_rating: z.number(),
    })),
  })),
  ai_summary: z.string().nullable(),  // null if not generated or not available
});
```

## 7. Inngest Functions

| Function ID | Trigger | What It Does |
|-------------|---------|-------------|
| `interview-create-calendar-event` | `interview/scheduled` | Creates Nylas calendar event, stores `nylas_event_id` |
| `interview-update-calendar-event` | `interview/rescheduled` | Updates Nylas event with new time/details |
| `interview-cancel-calendar-event` | `interview/cancelled` | Deletes Nylas event, notifies participants |
| `interview-nylas-event-sync` | `interview/nylas-webhook` | Processes inbound Nylas webhook (attendee status, external deletes) |
| `interview-feedback-reminder` | `cron: 0 9 * * *` (daily 9 AM UTC) | Finds interviews past `feedback_deadline_at` without submission, sends reminder |
| `interview-scorecard-submitted` | `scorecard/submitted` | Notifies recruiter + hiring manager of new scorecard |
| `interview-self-schedule-expire` | `cron: 0 * * * *` (hourly) | Expires self-scheduling links older than 7 days |

## 8. UI Components

| Component | Location | Description |
|-----------|----------|-------------|
| `InterviewScheduler` | Application detail → Interviews tab | Date/time picker, interviewer selector with availability overlay, template picker |
| `PanelBuilder` | Interview creation modal (when type = panel) | Multi-interviewer selector, shared time slot |
| `SelfScheduleConfig` | Application detail → Send self-scheduling link | Date range picker, buffer config, link generation |
| `InterviewCard` | Application detail → Interviews tab | Status badge, time, interviewer, scorecard status |
| `ScorecardForm` | Interview detail → Scorecard tab | Category/attribute tree, 1–5 rating stars, notes, recommendation radio |
| `ScorecardSummary` | Application detail → Scorecards tab | Aggregated view with category averages, recommendation tally, AI summary button |
| `FeedbackDeadlineBadge` | Interview card + interviewer dashboard | Shows time remaining or "Overdue" badge (Design System `StatusBadge` variant) |
| `CalendarSyncStatus` | User settings → Integrations | Nylas grant status, connect/disconnect, sync health |

## 9. Edge Cases

### 9.1 Interviewer Leaves Organization

If an interviewer is removed from the organization while they have scheduled interviews:
- Interviews stay in current status (not auto-cancelled). Recruiter is notified via `org-member/removed` event.
- Recruiter must manually reassign or cancel. RLS prevents the departed user from accessing the interview.
- Any submitted scorecards remain (the `submitted_by` FK uses `ON DELETE RESTRICT` — user profile persists in `auth.users`).

### 9.2 Nylas Grant Revoked

If an interviewer disconnects their calendar:
- Existing interviews retain data but lose two-way sync.
- New interview creation for that interviewer shows a warning: "Calendar not connected. Event will not appear on interviewer's calendar."
- Inngest calendar event functions gracefully skip if no active grant found.

### 9.3 Scorecard Submitted After Deadline

Submissions are always accepted regardless of deadline. The deadline is advisory — `feedback_deadline_at` drives reminder notifications and UI indicators, not hard enforcement. Rationale: better to have late feedback than no feedback.

### 9.4 Concurrent Scorecard Edits

The `UNIQUE(interview_id, submitted_by)` constraint prevents duplicate submissions. If an interviewer tries to submit twice, the second insert fails with a conflict error. Updates use optimistic locking via `updated_at` check.

### 9.5 Template Deleted While In Use

If a `scorecard_template` is soft-deleted while interviews reference it:
- `scorecard_template_id` FK uses `ON DELETE SET NULL`, so the interview loses its template reference.
- Existing scorecard submissions remain valid (they reference `scorecard_attributes` directly, not the template).
- Interviewers who haven't submitted yet see a "Template unavailable" message and can submit a free-text evaluation via `overall_notes` only.

### 9.6 Self-Scheduling Conflicts

If two candidates select the same slot simultaneously:
- First to confirm wins (interview insert succeeds).
- Second gets a 409 Conflict response. UI re-fetches availability and shows updated slots.
- Nylas free/busy query is the source of truth — once the first event is created, the slot shows as busy.

### 9.7 Panel Interview — Partial Cancellation

If one panelist cancels but others keep the time:
- Only the cancelled interviewer's row transitions to `cancelled`.
- Other panel members' interviews remain `scheduled`/`confirmed`.
- UI shows the panel with a "1 of 3 cancelled" indicator.

### 9.8 Interview Rescheduling

Rescheduling updates `scheduled_at` on the interview and fires `interview/rescheduled` Inngest event. The Nylas event is updated (not deleted + recreated) to preserve the event thread. Maximum 5 reschedules tracked via `audit_logs`.

## 10. Plan Gating

Per D03 billing contracts:

| Feature | Starter | Growth | Pro | Enterprise |
|---------|---------|--------|-----|------------|
| Manual scheduling | ✅ | ✅ | ✅ | ✅ |
| Scorecard templates | ✅ | ✅ | ✅ | ✅ |
| Self-scheduling | ❌ | ✅ | ✅ | ✅ |
| AI scorecard summary | ❌ | ❌ | ✅ | ✅ |
| Calendar sync (Nylas) | ❌ | ✅ | ✅ | ✅ |

Enforcement: `hasFeature(org, flag)` checked in Server Actions before executing gated operations.

## 11. Security Considerations

- **Blind review RLS:** Enforced at database level (D01 `scorecard_submissions_select` policy). Cannot be bypassed by API — Supabase RLS runs on every query.
- **Calendar data:** Nylas grants are per-user, scoped by `UNIQUE(organization_id, user_id)`. One user cannot read another's calendar.
- **Scorecard immutability:** Once submitted, only the submitter or owner/admin can update. Ratings are append-only (D01 design). All changes audited.
- **Self-scheduling links:** Authenticated via candidate portal session (D08). No public unauthenticated access to interviewer availability.
- **AI summarization:** Input sanitized before LLM call. No candidate PII in the prompt beyond what's in scorecard notes. Credit check is atomic (D03 pattern).
