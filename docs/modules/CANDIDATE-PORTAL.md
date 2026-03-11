# Candidate Portal

> **ID:** D09
> **Status:** Review
> **Priority:** P1
> **Last updated:** 2026-03-10
> **Depends on:** D01 (schema — candidates, applications, files, custom_field_definitions), D05 (Design System — career page theming, branding_config), D07 (Interviews — self-scheduling backend), D08 (Notifications — candidate email delivery), D10 (Search — Typesense public job search), D11 (Real-Time — polling strategy)
> **Depended on by:** D20 (White-Label — custom domain + email branding)
> **Last validated against deps:** 2026-03-10
> **Architecture decisions assumed:** ADR-001 (Supabase client), ADR-006 (soft delete), ADR-009 (file storage), ADR-010 (GDPR erasure)

---

## 1. Overview

Candidate Portal defines the public-facing and candidate-facing surfaces of the ATS: the career page (job listings, job detail, application form), the candidate status tracker (magic-link authenticated), interview self-scheduling, and GDPR consent management. Candidates never have ATS user accounts — all access is via time-limited magic links embedded in emails.

**Scope:**
- In scope: Career page (public job listings, org-branded), application form with resume upload, magic link authentication, application status tracking, interview self-scheduling UI (G-023), candidate email delivery context (G-026), public job search via Typesense (G-029), polling for status updates (G-030), branding fallbacks (G-020), public endpoint rate limiting (G-013), GDPR consent, file upload flow.
- Out of scope: ATS dashboard UI (D05), internal recruiter views, real-time WebSocket for candidates (D11 — excluded by design), white-label custom domains (D20).

## 2. User Stories

| ID | Role | Story | Acceptance Criteria |
|----|------|-------|---------------------|
| US-01 | Candidate | Browse open jobs on a company's career page | Given I visit `careers.{org_slug}.example.com`, then I see the company-branded career page with open job listings |
| US-02 | Candidate | Search and filter job listings | Given I'm on the career page, when I type in the search box, then jobs are filtered by title/department/location with typo tolerance |
| US-03 | Candidate | Apply to a job | Given I click "Apply", when I fill out the form and upload my resume, then my application is created and I receive a confirmation email |
| US-04 | Candidate | Track my application status | Given I click the magic link in my email, then I see my application's current stage and timeline |
| US-05 | Candidate | Self-schedule an interview | Given I receive a self-scheduling email, when I click the link, then I see available time slots and can pick one |
| US-06 | Candidate | Request data erasure | Given I'm on my status page, when I click "Delete my data", then I receive a confirmation email and my data is queued for GDPR erasure |
| US-07 | Candidate | View and accept an offer | Given I receive an offer email, when I click the link, then I'm redirected to the Dropbox Sign document for e-signature |

## 3. Authentication

### 3.1 Magic Link Strategy

Candidates authenticate via **stateless signed tokens** — not Supabase Auth magic links (which create user accounts). Each email to a candidate contains a unique, time-limited URL with a signed token.

```typescript
// Token generation (server-side, in Inngest notification handler)
import { SignJWT, jwtVerify } from 'jose';

const CANDIDATE_TOKEN_SECRET = new TextEncoder().encode(
  process.env.CANDIDATE_TOKEN_SECRET! // Separate from Supabase JWT secret
);

async function generateCandidateToken(payload: {
  application_id: string;
  candidate_id: string;
  organization_id: string;
  scope: 'status' | 'schedule' | 'offer';
}): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(payload.scope === 'schedule' ? '7d' : '30d')
    .sign(CANDIDATE_TOKEN_SECRET);
}

// Token verification (middleware for candidate routes)
async function verifyCandidateToken(token: string) {
  const { payload } = await jwtVerify(token, CANDIDATE_TOKEN_SECRET);
  return payload as CandidateTokenPayload;
}
```

### 3.2 Token Scopes

| Scope | Expiry | Access |
|-------|--------|--------|
| `status` | 30 days | View application status, timeline, request erasure |
| `schedule` | 7 days | View available slots + book interview (D07 §4.3) |
| `offer` | 30 days | View offer details + redirect to e-sign |

### 3.3 Token Lifecycle

- **Generated:** When a candidate email is dispatched (D08 §4.3). One token per email, scoped to the action.
- **Embedded in URL:** `https://careers.{slug}.example.com/portal?token={jwt}`
- **Verified on every request:** Stateless — no session storage. Token decoded and validated per request.
- **Revoked implicitly:** When application status changes to a terminal state (`hired`, `rejected`, `withdrawn`), the token remains valid but the UI shows read-only status. No sensitive actions available.

### 3.4 Security Constraints

- Token secret is separate from Supabase JWT secret — compromise of one doesn't affect the other.
- Tokens are **not** stored in the database — stateless verification only.
- All candidate portal routes are server-rendered (no client-side token exposure in JavaScript).
- Rate limiting on token verification endpoint prevents brute-force (§10).

## 4. Career Page (Public)

### 4.1 URL Structure

```
/careers/{org_slug}                     — Job listing page
/careers/{org_slug}/jobs/{job_slug}      — Job detail page
/careers/{org_slug}/jobs/{job_slug}/apply — Application form
/careers/{org_slug}/portal               — Status tracker (requires token)
/careers/{org_slug}/schedule/{interview_id} — Self-scheduling (requires token)
```

Career pages are served as Next.js dynamic routes with ISR (Incremental Static Regeneration):
- Job listing: revalidated every 60 seconds
- Job detail: revalidated every 60 seconds
- Application form: server-rendered (no caching — form requires fresh CSRF token)

### 4.2 Branding & Theming (G-020 Resolution)

Career pages respect the organization's `branding_config` JSONB. When fields are null or empty, system defaults apply.

```typescript
interface BrandingConfig {
  logo_url?: string;
  primary_color?: string;    // HSL format: "217 91% 50%"
  secondary_color?: string;
  font_family?: string;
  favicon_url?: string;
  career_page_header_html?: string; // Sanitized HTML for hero section
}

// Defaults applied when branding_config fields are null/empty
const BRANDING_DEFAULTS: Required<BrandingConfig> = {
  logo_url: '/images/default-logo.svg',           // Eligeo logo
  primary_color: '222.2 84% 4.9%',                // D05 system foreground
  secondary_color: '210 40% 96.1%',               // D05 system muted
  font_family: 'Inter',                            // D05 system font
  favicon_url: '/favicon.ico',                     // System favicon
  career_page_header_html: '',                     // No custom header
};

// Resolution function
function resolveTheme(config: BrandingConfig): Required<BrandingConfig> {
  return {
    logo_url: config.logo_url || BRANDING_DEFAULTS.logo_url,
    primary_color: config.primary_color || BRANDING_DEFAULTS.primary_color,
    secondary_color: config.secondary_color || BRANDING_DEFAULTS.secondary_color,
    font_family: config.font_family || BRANDING_DEFAULTS.font_family,
    favicon_url: config.favicon_url || BRANDING_DEFAULTS.favicon_url,
    career_page_header_html: config.career_page_header_html ?? BRANDING_DEFAULTS.career_page_header_html,
  };
}
```

**HTML sanitization:** `career_page_header_html` is sanitized server-side using DOMPurify before rendering. Allowed tags: `<h1>`, `<h2>`, `<p>`, `<a>`, `<img>`, `<span>`, `<div>`. No scripts, iframes, or event handlers.

### 4.3 Job Listing Page

```typescript
// Next.js page: app/careers/[orgSlug]/page.tsx
// ISR with 60-second revalidation

export default async function CareerPage({ params }: { params: { orgSlug: string } }) {
  const org = await getOrganizationBySlug(params.orgSlug);
  if (!org) notFound();

  const theme = resolveTheme(org.branding_config);
  const jobs = await searchPublicJobs(org.id, ''); // Initial load — all open jobs

  return (
    <CareerLayout theme={theme} org={org}>
      <JobSearchBar orgId={org.id} searchKey={org.typesense_search_key} />
      <JobGrid jobs={jobs} orgSlug={params.orgSlug} />
    </CareerLayout>
  );
}
```

### 4.4 Job Detail Page

Displays: title, department, location, employment type, salary range (if disclosed), description (rendered from `description_html`), required skills, "Apply" CTA button.

### 4.5 CSS Custom Properties

Theme values are injected as CSS custom properties on the career page layout:

```css
:root {
  --career-primary: hsl(var(--brand-primary));
  --career-secondary: hsl(var(--brand-secondary));
  --career-font: var(--brand-font), 'Inter', sans-serif;
}
```

## 5. Application Form

### 5.1 Form Fields

| Field | Type | Required | Source |
|-------|------|----------|--------|
| Full name | text | ✅ | `candidates.full_name` |
| Email | email | ✅ | `candidates.email` |
| Phone | tel | ❌ | `candidates.phone` |
| Resume | file (PDF/DOCX, 10MB max) | ✅ | `files` table via Supabase Storage |
| Cover letter | file (PDF/DOCX, 5MB max) | ❌ | `files` table via Supabase Storage |
| LinkedIn URL | url | ❌ | `candidates.linkedin_url` |
| Custom fields | dynamic | per org config | `custom_field_definitions` → `custom_field_values` |
| GDPR consent | checkbox | ✅ | Stored in `applications.metadata` |

### 5.2 Submission Flow

```
1. Candidate fills form + uploads resume
2. Client-side validation (Zod)
3. POST /api/v1/portal/apply
   a. Rate limit check (§10)
   b. Upload resume to Supabase Storage → insert into `files` table
   c. Upsert candidate (dedup by org_id + email)
   d. Create application (status: 'active', current_stage: first stage)
   e. Insert application_stage_history (initial placement)
   f. Insert custom_field_values (if any)
   g. Fire 'workflow/stage-changed' event (triggers auto-actions on first stage)
   h. Fire 'notification/dispatch' for application_received email
4. Return success → redirect to confirmation page
```

### 5.3 Candidate Deduplication

When a candidate applies, the system checks for an existing candidate record by `(organization_id, email)`:

- **New candidate:** Insert into `candidates` table with `source = 'career_page'`.
- **Existing candidate:** Update mutable fields (phone, linkedin_url) only if the new values are non-empty. Do not overwrite existing resume — create a new application linked to the same candidate.
- **Anonymized candidate:** If `is_anonymized = TRUE`, reject the application with error: "This email address is not available." (GDPR — re-identification prevention.)

### 5.4 Resume Upload

```typescript
// Server Action: upload candidate resume
async function uploadResume(formData: FormData) {
  const file = formData.get('resume') as File;

  // Validate
  const MAX_SIZE = 10 * 1024 * 1024; // 10MB
  const ALLOWED_TYPES = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

  if (file.size > MAX_SIZE) throw new Error('Resume must be under 10MB');
  if (!ALLOWED_TYPES.includes(file.type)) throw new Error('Resume must be PDF or DOCX');

  // Generate safe filename
  const ext = file.type === 'application/pdf' ? 'pdf' : 'docx';
  const safeName = `${crypto.randomUUID()}.${ext}`;
  const storagePath = `resumes/${orgId}/${safeName}`;

  // Upload to Supabase Storage
  const { error } = await supabaseAdmin.storage
    .from('candidate-files')
    .upload(storagePath, file, { contentType: file.type });

  if (error) throw new Error('Upload failed');

  // Insert file metadata
  const { data: fileRecord } = await supabaseAdmin
    .from('files')
    .insert({
      organization_id: orgId,
      entity_type: 'candidate',
      entity_id: candidateId,
      file_name: file.name, // Original name for display
      file_type: file.type,
      file_size: file.size,
      storage_path: storagePath,
    })
    .select('id')
    .single();

  return fileRecord.id;
}
```

### 5.5 GDPR Consent

- **Consent text:** "I consent to {org_name} processing my personal data for recruitment purposes. [Privacy Policy link]"
- **Storage:** `applications.metadata.gdpr_consent = { consented_at: ISO8601, ip_address: string, consent_text: string }`
- **Privacy policy URL:** Stored in `branding_config.privacy_policy_url`. If not set, a generic placeholder is shown.
- **Consent is per-application:** Each application records its own consent timestamp.

## 6. Application Status Tracker

### 6.1 Status Page

Accessible via magic link (`scope: 'status'`). Shows:

1. **Application summary:** Job title, applied date, current status badge
2. **Pipeline progress:** Horizontal stage indicator showing current position (stage names visible, but no internal stage details)
3. **Timeline:** Chronological list of status changes (e.g., "Application received", "Phone screen scheduled", "Interview completed")
4. **Actions:** "Withdraw application" button, "Delete my data" link (GDPR)

### 6.2 Candidate-Visible Stage Names

Candidates see simplified stage names, not internal stage types:

| Internal `stage_type` | Candidate-visible label |
|-----------------------|------------------------|
| `sourced` | "Application Received" |
| `applied` | "Application Received" |
| `screening` | "Under Review" |
| `interview` | "Interview Stage" |
| `offer` | "Offer Stage" |
| `hired` | "Offer Accepted" |
| `rejected` | "Not Selected" |

### 6.3 Polling for Status Updates (G-030 Resolution)

Candidates don't have persistent WebSocket connections. Application status updates use client-side polling.

```typescript
// Client-side polling hook
function useApplicationStatus(token: string) {
  const [status, setStatus] = useState<ApplicationStatus | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  useEffect(() => {
    let interval = 30_000; // 30 seconds default
    let timeoutId: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const res = await fetch(`/api/v1/portal/status?token=${token}`);
        if (res.ok) {
          const data = await res.json();
          const changed = data.updated_at !== status?.updated_at;

          setStatus(data);
          setLastUpdated(new Date());

          // Adaptive polling: slow down if no changes
          if (!changed) {
            interval = Math.min(interval * 1.5, 60_000); // Cap at 60s
          } else {
            interval = 30_000; // Reset on change
          }
        }
      } catch {
        interval = Math.min(interval * 2, 120_000); // Back off on error
      }

      timeoutId = setTimeout(poll, interval);
    }

    poll();
    return () => clearTimeout(timeoutId);
  }, [token]);

  return { status, lastUpdated };
}
```

**Polling endpoint:** `GET /api/v1/portal/status?token={jwt}` — returns application status, current stage label (candidate-visible), and `updated_at` timestamp. Lightweight response (~200 bytes).

### 6.4 Withdrawal

```typescript
// Server Action: withdraw application
async function withdrawApplication(token: string) {
  const payload = await verifyCandidateToken(token);
  if (payload.scope !== 'status') throw new Error('Invalid token scope');

  const supabase = createServiceClient();
  const { data: app } = await supabase
    .from('applications')
    .select('status')
    .eq('id', payload.application_id)
    .single();

  if (app.status !== 'active') throw new Error('Application is not active');

  await supabase
    .from('applications')
    .update({
      status: 'withdrawn',
      withdrawn_at: new Date().toISOString(),
    })
    .eq('id', payload.application_id);

  // Route through workflow engine (D12 §8.3) — handles offer voiding, notifications, search sync
  await inngest.send({
    name: 'workflow/application-withdrawn',
    data: {
      organization_id: payload.organization_id,
      application_id: payload.application_id,
      candidate_id: payload.candidate_id,
    },
  });
}
```

## 7. Interview Self-Scheduling (G-023 Resolution)

### 7.1 Candidate Flow

```
1. Recruiter enables self-scheduling on an interview (D07 §4.3)
2. Candidate receives email with schedule link (scope: 'schedule', 7-day expiry)
3. Candidate clicks link → /careers/{slug}/schedule/{interview_id}?token=...
4. Page queries interviewer availability via Nylas free/busy
5. Candidate selects a 30-minute slot from available times
6. System creates calendar event (Nylas) + updates interview status
7. Confirmation page + confirmation email with ICS attachment
```

### 7.2 Time Slot Picker

```typescript
// Server Component: fetch and display available slots
async function getAvailableSlots(interviewId: string, token: string) {
  const payload = await verifyCandidateToken(token);
  if (payload.scope !== 'schedule') throw new Error('Invalid token scope');

  const supabase = createServiceClient();
  const { data: interview } = await supabase
    .from('interviews')
    .select('*, interviewer:user_profiles!interviewer_id(*)')
    .eq('id', interviewId)
    .single();

  if (interview.status !== 'scheduled') {
    throw new Error('Interview is not available for scheduling');
  }

  // Query Nylas free/busy for the next 7 days
  const now = new Date();
  const end = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const freeBusy = await nylas.calendars.getFreeBusy({
    identifier: interview.nylas_grant_id,
    requestBody: {
      emails: [interview.interviewer.email],
      startTime: Math.floor(now.getTime() / 1000),
      endTime: Math.floor(end.getTime() / 1000),
    },
  });

  // Generate 30-min slots within business hours (9am-5pm org timezone)
  // Exclude busy periods + 15-min buffer between slots
  return generateAvailableSlots(freeBusy, interview, now, end);
}
```

### 7.3 Slot Selection

```typescript
// Server Action: candidate books a slot
async function bookInterviewSlot(input: {
  interviewId: string;
  token: string;
  startTime: string; // ISO 8601
  endTime: string;
}) {
  const payload = await verifyCandidateToken(input.token);

  const supabase = createServiceClient();

  // Re-check availability (race condition protection)
  const isAvailable = await checkSlotAvailable(
    input.interviewId,
    input.startTime,
    input.endTime
  );
  if (!isAvailable) {
    throw new Error('This time slot is no longer available. Please select another.');
  }

  // Check reschedule limit (max 3)
  const { count } = await supabase
    .from('audit_logs')
    .select('id', { count: 'exact', head: true })
    .eq('record_id', input.interviewId)
    .eq('table_name', 'interviews')
    .eq('action', 'UPDATE');

  if ((count ?? 0) >= 3) {
    throw new Error('Maximum reschedule limit reached. Please contact the recruiter.');
  }

  // Create Nylas calendar event
  const event = await nylas.events.create({
    identifier: interview.nylas_grant_id,
    requestBody: {
      title: `Interview: ${candidate.full_name} — ${job.title}`,
      when: {
        startTime: Math.floor(new Date(input.startTime).getTime() / 1000),
        endTime: Math.floor(new Date(input.endTime).getTime() / 1000),
      },
      participants: [
        { email: interviewer.email },
        { email: candidate.email },
      ],
    },
  });

  // Update interview record
  await supabase
    .from('interviews')
    .update({
      status: 'confirmed',
      scheduled_start: input.startTime,
      scheduled_end: input.endTime,
      calendar_event_id: event.data.id,
    })
    .eq('id', input.interviewId);

  // Send confirmation emails
  await inngest.send({
    name: 'notification/dispatch',
    data: {
      organization_id: payload.organization_id,
      event_type: 'interview.scheduled',
      payload: {
        interview_id: input.interviewId,
        application_id: payload.application_id,
        candidate_id: payload.candidate_id,
        start_time: input.startTime,
        end_time: input.endTime,
      },
    },
  });
}
```

### 7.4 Self-Scheduling Constraints

| Constraint | Value | Source |
|-----------|-------|--------|
| Slot duration | 30 minutes | D07 §4.3 |
| Buffer between slots | 15 minutes | D07 §4.3 |
| Link expiry | 7 days | D07 §4.3 |
| Max reschedules | 3 | D07 §4.3 |
| Available window | Next 7 days from link click | D07 §4.3 |
| Business hours | 9am–5pm in org timezone | Org `timezone` field |
| Conflict resolution | First-come-first-served | Re-check on booking |

### 7.5 Plan Gating

Self-scheduling is available on **Growth+** plans only. Starter plan candidates receive a "the recruiter will contact you" message instead of the time slot picker.

## 8. Public Job Search (G-029 Resolution)

### 8.1 Typesense Scoped API Key

Each organization gets a scoped Typesense API key that restricts search to their published jobs only.

```typescript
// Key generation (on org creation or admin request)
async function generateTypesenseSearchKey(orgId: string): Promise<string> {
  const client = new Typesense.Client({ /* admin config */ });

  const scopedKey = client.keys().generateScopedSearchKey(
    process.env.TYPESENSE_SEARCH_ONLY_KEY!,
    {
      filter_by: `organization_id:=${orgId} && status:=open`,
      expires_at: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60, // 90 days
    }
  );

  // Store in organizations table for retrieval
  await supabaseAdmin
    .from('organizations')
    .update({
      metadata: supabaseAdmin.rpc('jsonb_set_key', {
        target: 'metadata',
        key: 'typesense_search_key',
        value: JSON.stringify(scopedKey),
      }),
    })
    .eq('id', orgId);

  return scopedKey;
}
```

### 8.2 Key Rotation

- **Automatic:** Keys expire after 90 days. Inngest cron regenerates keys 7 days before expiry.
- **Manual:** Admin can regenerate via Settings → Integrations. Old key becomes invalid immediately.
- **Storage:** Scoped key stored in `organizations.metadata.typesense_search_key`. Not sensitive — scoped keys can only search, not write.

### 8.3 Client-Side Search

```typescript
// Career page client component
'use client';

import TypesenseInstantSearchAdapter from 'typesense-instantsearch-adapter';

function JobSearch({ searchKey, orgId }: { searchKey: string; orgId: string }) {
  const adapter = new TypesenseInstantSearchAdapter({
    server: {
      apiKey: searchKey,
      nodes: [{ host: process.env.NEXT_PUBLIC_TYPESENSE_HOST!, port: 443, protocol: 'https' }],
    },
    additionalSearchParameters: {
      query_by: 'title,description,department,location,skills',
      sort_by: '_text_match:desc,published_at:desc',
    },
  });

  return (
    <InstantSearch searchClient={adapter.searchClient} indexName="job_openings">
      <SearchBox placeholder="Search jobs..." />
      <RefinementList attribute="department" />
      <RefinementList attribute="location" />
      <RefinementList attribute="employment_type" />
      <Hits hitComponent={JobCard} />
    </InstantSearch>
  );
}
```

### 8.4 Search Fallback

If Typesense is unavailable, fall back to a server-side PostgreSQL query:

```sql
SELECT id, title, department, location, employment_type, salary_min, salary_max, slug
FROM job_openings
WHERE organization_id = $1
  AND status = 'open'
  AND deleted_at IS NULL
  AND ($2 = '' OR full_name ILIKE '%' || $2 || '%' OR title ILIKE '%' || $2 || '%')
ORDER BY published_at DESC
LIMIT 50;
```

## 9. Candidate Email Delivery (G-026 Resolution)

### 9.1 Email Context

Candidate emails are dispatched by D08's notification system but require special handling because candidates have no ATS login:

1. **Each email includes a magic link** with a scoped token (§3).
2. **No unsubscribe link** — candidates don't have notification preferences. All emails are transactional (triggered by recruiter actions), not marketing.
3. **Sender identity:** `{org_name} Careers <noreply@{org_domain}>` (or system domain if no custom domain).

### 9.2 Email Templates

| Event | Subject | Magic Link Scope | Key Variables |
|-------|---------|-----------------|---------------|
| `candidate.application_received` | "Your application for {{job.title}} has been received" | `status` | `candidate.name`, `job.title`, `organization.name` |
| `candidate.interview_scheduled` | "Interview scheduled: {{job.title}}" | `status` | `interview.date`, `interview.time`, `interview.duration`, `interview.meeting_url` |
| `candidate.interview_cancelled` | "Interview update: {{job.title}}" | `status` | `candidate.name`, `job.title`, `organization.name` |
| `candidate.offer_sent` | "You have an offer from {{organization.name}}" | `offer` | `offer.title`, `offer.expiry_date`, `action_url` (Dropbox Sign link) |
| `candidate.rejected` | "Update on your application to {{organization.name}}" | `status` | `candidate.name`, `job.title`, `organization.name` |

### 9.3 Email Generation Flow

```typescript
// Within Inngest notification dispatcher (D08 pattern)
async function sendCandidateEmail(
  event: CandidateEmailEvent,
  org: Organization,
  candidate: Candidate,
  application: Application,
) {
  // 1. Generate magic link token
  const token = await generateCandidateToken({
    application_id: application.id,
    candidate_id: candidate.id,
    organization_id: org.id,
    scope: event.scope,
  });

  const portalUrl = `https://careers.${org.slug}.example.com/portal?token=${token}`;

  // 2. Resolve email template variables
  const variables = {
    candidate: { name: candidate.full_name, email: candidate.email },
    job: { title: application.job_title, department: application.department },
    organization: { name: org.name, logo_url: resolveTheme(org.branding_config).logo_url },
    action_url: portalUrl,
    ...event.extra_variables, // interview details, offer details, etc.
  };

  // 3. Send via Resend (D08 §3.2)
  await resend.emails.send({
    from: `${org.name} Careers <noreply@${org.custom_domain || 'mail.example.com'}>`,
    to: candidate.email,
    subject: renderTemplate(event.subject_template, variables),
    react: CandidateEmailTemplate({ ...variables, event_type: event.type }),
  });
}
```

## 10. Rate Limiting (G-013 Resolution)

### 10.1 Public Endpoint Limits

Public career page endpoints require rate limiting to prevent scraping and abuse. These are **not** plan-gated (career page is free for all plans) but use fixed limits.

| Endpoint | Limit | Window | Key |
|----------|-------|--------|-----|
| `GET /careers/{slug}` (job listing) | 60 req | 1 minute | IP |
| `GET /careers/{slug}/jobs/{slug}` (job detail) | 60 req | 1 minute | IP |
| `POST /api/v1/portal/apply` (application submit) | 5 req | 1 hour | IP + email |
| `GET /api/v1/portal/status` (polling) | 30 req | 1 minute | Token |
| `POST /api/v1/portal/schedule` (book slot) | 10 req | 1 hour | Token |
| `GET /api/v1/portal/availability` (free/busy) | 20 req | 1 minute | Token |
| `GET /api/v1/search/jobs/public` (Typesense proxy) | 120 req | 1 minute | IP |

### 10.2 Implementation

```typescript
// Using @upstash/ratelimit (D02 pattern)
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const portalLimiter = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(60, '1 m'),
  prefix: 'portal',
});

const applyLimiter = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, '1 h'),
  prefix: 'apply',
});

// In API route handler
export async function POST(request: NextRequest) {
  const ip = request.ip ?? request.headers.get('x-forwarded-for') ?? 'unknown';
  const body = await request.json();
  const key = `${ip}:${body.email}`;

  const { success, remaining } = await applyLimiter.limit(key);
  if (!success) {
    return NextResponse.json(
      { type: 'rate_limit', title: 'Too many applications', status: 429 },
      { status: 429, headers: { 'Retry-After': '3600' } }
    );
  }
  // ... process application
}
```

### 10.3 Anti-Scraping

- **ISR caching:** Job listings are served from edge cache (60s TTL) — scrapers hit the CDN, not the database.
- **No pagination beyond 100 jobs:** Public listing endpoint returns max 100 results. Organizations with 100+ open jobs use search/filter to narrow.
- **Bot detection:** `robots.txt` allows indexing of career pages but disallows `/api/` routes. No CAPTCHA on application form (friction too high for conversion) — rate limiting is sufficient.

## 11. GDPR Data Management

### 11.1 Data Erasure Request

```typescript
// Server Action: candidate requests data erasure
async function requestDataErasure(token: string) {
  const payload = await verifyCandidateToken(token);
  if (payload.scope !== 'status') throw new Error('Invalid token scope');

  // Queue erasure via Inngest (not immediate — allows 48-hour cooling period)
  await inngest.send({
    name: 'gdpr/erasure-requested',
    data: {
      organization_id: payload.organization_id,
      candidate_id: payload.candidate_id,
      requested_at: new Date().toISOString(),
    },
    // 48-hour delay for cooling period
    ts: new Date(Date.now() + 48 * 60 * 60 * 1000).getTime(),
  });

  // Send confirmation email immediately
  await inngest.send({
    name: 'notification/dispatch',
    data: {
      organization_id: payload.organization_id,
      event_type: 'candidate.erasure_requested',
      payload: {
        candidate_id: payload.candidate_id,
        scheduled_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      },
    },
  });

  return { scheduled_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString() };
}
```

### 11.2 Erasure Execution

After the 48-hour cooling period, the Inngest function calls `erase_candidate()` (D01 §GDPR). This:
1. Anonymizes the candidate record (`full_name = 'REDACTED'`, etc.)
2. Soft-deletes all related applications, notes, scorecards, interviews, offers
3. Deletes candidate encryption keys (crypto-shred audit logs)
4. Logs erasure in `gdpr_erasure_log`
5. Deletes files from Supabase Storage (resume, cover letter)

### 11.3 Cancellation

During the 48-hour cooling period, the candidate can cancel erasure by clicking a link in the confirmation email. This sends a cancellation event that the Inngest function checks before executing.

## 12. API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/portal/jobs` | None (public) | List open jobs for an org (ISR-cached) |
| GET | `/api/v1/portal/jobs/:slug` | None (public) | Job detail (ISR-cached) |
| POST | `/api/v1/portal/apply` | None (rate-limited) | Submit application |
| POST | `/api/v1/portal/upload` | None (rate-limited) | Upload resume file (multipart) |
| GET | `/api/v1/portal/status` | Candidate token | Application status + timeline |
| POST | `/api/v1/portal/withdraw` | Candidate token | Withdraw application |
| GET | `/api/v1/portal/availability/:interviewId` | Candidate token (`schedule`) | Available interview slots |
| POST | `/api/v1/portal/schedule/:interviewId` | Candidate token (`schedule`) | Book interview slot |
| GET | `/api/v1/portal/offer/:offerId` | Candidate token (`offer`) | Offer details + e-sign redirect |
| POST | `/api/v1/portal/erasure` | Candidate token (`status`) | Request GDPR data erasure |
| POST | `/api/v1/portal/erasure/cancel` | Candidate token (`status`) | Cancel pending erasure |
| GET | `/api/v1/search/jobs/public` | None (rate-limited) | Typesense-proxied public job search |

## 13. Inngest Functions

| Function ID | Trigger Event | Purpose |
|-------------|---------------|---------|
| `portal-typesense-key-rotation` | `cron: 0 0 * * *` (daily) | Check and regenerate expiring Typesense scoped keys |
| `portal-gdpr-erasure` | `gdpr/erasure-requested` (delayed 48h) | Execute candidate erasure after cooling period |
| `portal-resume-parse` | `portal/application-submitted` | Parse uploaded resume → update `resume_parsed`, `resume_text`, generate embedding |

## 14. UI Components

| Component | Location | Description |
|-----------|----------|-------------|
| `CareerLayout` | Career page wrapper | Applies org branding (colors, font, logo), responsive shell |
| `JobSearchBar` | Career page | Typesense-powered search with typeahead |
| `JobGrid` | Career page | Responsive grid of job cards with department/location badges |
| `JobDetailPage` | Job detail | Full job description, skills, salary, "Apply" CTA |
| `ApplicationForm` | Apply page | Multi-field form with file upload, custom fields, GDPR consent |
| `StatusTracker` | Portal (authenticated) | Pipeline progress bar + timeline + withdrawal action |
| `TimeSlotPicker` | Self-scheduling page | Calendar view of available 30-min slots |
| `ConfirmationPage` | Post-apply | Success message + "check your email" prompt |

## 15. Edge Cases

### 15.1 Expired Magic Link

If token is expired, show a friendly message: "This link has expired. Check your email for a newer link, or contact the recruiter." No re-authentication flow — the system sends a new email on the next status change.

### 15.2 Multiple Applications

A candidate can have multiple applications across different jobs (different `job_opening_id`). Each application has its own magic link tokens. The status page shows the application specific to the token used.

### 15.3 Organization Slug Change

If an org changes their slug, existing career page URLs break. `proxy.ts` middleware handles redirects from old slug to new slug via a 301.

### 15.4 Job Closed After Application Started

If a job closes while a candidate is filling the form, the `POST /apply` endpoint checks `job_openings.status = 'open'` and returns an error. The form shows: "This position is no longer accepting applications."

### 15.5 Concurrent Self-Scheduling

Two candidates selecting the same interview slot: first `POST /schedule` wins. Second request re-checks availability and returns an error with updated slots. The UI auto-refreshes the slot picker.

### 15.6 Candidate Reapplies After Rejection

If a candidate was rejected from Job A and applies to Job B, a new application is created linked to the existing candidate record. The rejected application remains in history. No restrictions on reapplication to different jobs.

## 16. Security Considerations

- **No ATS credentials for candidates:** Magic link tokens are the sole authentication mechanism. Tokens are signed JWTs with short expiry, never stored in the database.
- **Token leakage mitigation:** Tokens are embedded in URL query parameters (not path segments) to prevent referer header leakage. All portal pages set `Referrer-Policy: no-referrer`.
- **File upload validation:** Resume files are validated by MIME type and file extension. No executable files accepted. Supabase Storage scans for malware if enabled.
- **XSS prevention:** `career_page_header_html` is sanitized with DOMPurify. All user-provided content is escaped in templates.
- **CSRF protection:** Application form includes a CSRF token validated server-side. The token is generated per-page-load and tied to no session (stateless CSRF via double-submit cookie).
- **Rate limiting:** All public endpoints are rate-limited (§10). Application submission is rate-limited by IP + email to prevent spam.
- **No cross-candidate data access:** Token payload includes `application_id` — the endpoint only returns data for that specific application. No enumeration possible.
- **Supabase Storage isolation:** Resume files stored in org-scoped paths. Signed URLs with 1-hour expiry for internal access. No public bucket access.
