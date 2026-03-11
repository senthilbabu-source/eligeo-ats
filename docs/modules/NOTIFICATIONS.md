# Notification System

> **ID:** D08
> **Status:** Review
> **Priority:** P1
> **Last updated:** 2026-03-10
> **Depends on:** D01 (schema — `notes`, `email_templates`, `notification_preferences`, `webhook_endpoints`), D02 (API patterns, webhook outbound §8), D03 (billing — `webhook_outbound` feature flag), D05 (design — toast, badge components)
> **Depended on by:** D06 (offer email triggers), D07 (interview email triggers), D09 (Candidate Portal — candidate-facing notifications), D11 (Real-Time — Supabase Realtime channels)
> **Last validated against deps:** 2026-03-10
> **Architecture decisions assumed:** ADR-001 (Supabase client), ADR-006 (soft delete), ADR-007 (audit), ADR-008 (enums)

---

## 1. Overview

The Notification System handles all internal (in-app + email) and external (webhook outbound) event delivery across the ATS. It covers the full notification lifecycle: event emission, preference-aware routing, template rendering, delivery, and read-state tracking. In-app notifications use Supabase Realtime; emails use React Email + Resend [VERIFY]; webhook outbound follows D02 §8.

**Scope:**
- In scope: Event catalog, in-app notifications (Realtime), transactional emails (templates + delivery), @mention notifications, webhook outbound delivery + health management, user notification preferences, digest mode, notification API.
- Out of scope: Marketing emails, SMS/push notifications (future), candidate-facing notifications (D09), real-time presence (D11).

## 2. User Stories

| ID | Role | Story | Acceptance Criteria |
|----|------|-------|---------------------|
| US-01 | Recruiter | Receive in-app notification when a scorecard is submitted | Given a scorecard is submitted, when I'm on any ATS page, then a toast appears and badge count increments |
| US-02 | Hiring Manager | Receive email when an offer needs my approval | Given I'm next in the approval chain, when the previous approver approves, then I receive an email with approve/reject links |
| US-03 | Interviewer | Receive notification when mentioned in a note | Given someone @mentions me in a note, when the note is saved, then I get an in-app + email notification (per my preferences) |
| US-04 | Admin | Configure webhook endpoints for external integrations | Given I'm an admin, when I create a webhook endpoint, then events I subscribe to are delivered to my URL with HMAC signatures |
| US-05 | Recruiter | Customize which notifications I receive and how | Given I'm on the notification settings page, when I toggle channels per event type, then future notifications respect my preferences |
| US-06 | Recruiter | View and manage notification history | Given I have unread notifications, when I open the notification panel, then I see all notifications with mark-as-read functionality |
| US-07 | Admin | Get alerted when a webhook endpoint is failing | Given a webhook has 5+ consecutive failures, when the 10th failure occurs, then I'm notified and the endpoint is auto-disabled |

## 3. Architecture

### 3.1 Notification Flow

```
Event Source ──→ Inngest Event ──→ notification/dispatch
                                      │
                         ┌────────────┼────────────┐
                         ▼            ▼            ▼
                    In-App        Email        Webhook
                  (Realtime)   (React Email)  (Outbound)
                         │            │            │
                    Preference   Preference   Feature Gate
                     Check        Check      (webhook_outbound)
                         │            │            │
                    Supabase      Resend        HTTP POST
                   broadcast()   send()       + HMAC sign
```

All notifications flow through a single Inngest dispatch function that:
1. Looks up the recipient's `notification_preferences` for the event type
2. Routes to the appropriate channel(s): `in_app`, `email`, `both`, or `none`
3. For webhook: checks `hasFeature(org, 'webhook_outbound')` then fans out to all active endpoints subscribed to the event

### 3.2 In-App Notification Storage

No dedicated `notifications` table in D01 — in-app notifications are delivered via Supabase Realtime broadcast (ephemeral) and stored client-side in the user's local state. Persistent notification history is derived from event sources (audit logs, notes, etc.) rather than duplicated into a notification table.

**Decision rationale:** A notifications table would duplicate data already in audit_logs and domain tables. Instead:
- **Unread badge count:** Maintained per-user in a lightweight `notification_badges` Supabase Realtime channel (org-scoped, user-filtered)
- **Notification panel:** Queries recent events from source tables (scorecards submitted, offers pending, mentions) with a unified view layer
- **Read state:** Tracked via `last_read_at` timestamp on `notification_preferences` (one per user per org). Events after this timestamp are "unread."

### 3.3 Email Delivery

Transactional emails are rendered with React Email and sent via Resend [VERIFY].

**Template variable syntax (G-015 resolution):**

Handlebars-style `{{variable}}` syntax with dot notation for nested access:

```typescript
// Template variables — consistent across all email templates
interface TemplateVariables {
  candidate: { name: string; email: string };
  job: { title: string; department?: string; location?: string };
  organization: { name: string; logo_url?: string };
  recruiter: { name: string; email: string };
  // Context-specific (vary by email category)
  interview?: { date: string; time: string; duration: string; type: string; meeting_url?: string };
  offer?: { title: string; start_date?: string; expiry_date?: string };
  action_url?: string;  // Primary CTA link
}
```

**Rendering pipeline:**
1. Load `email_templates` row by `category` + `organization_id`
2. If no org template, fall back to system template (`is_system = TRUE`)
3. Replace `{{variable.path}}` with values from `TemplateVariables`
4. Pass rendered HTML to React Email component for layout wrapping (header, footer, branding)
5. Send via Resend with org-specific `from` address (or system default)

The `merge_fields` TEXT[] column on `email_templates` declares which variables a template expects — used for validation in the template editor UI.

### 3.4 @Mention Notifications (G-014 Resolution)

**Decision:** Inngest event, not Supabase Realtime or direct insert.

When a note with `mentions` is saved:
1. `notes` INSERT trigger fires `audit_trigger_func()` (D01 pattern)
2. A Supabase database webhook (pg_net) fires an Inngest event: `note/created` with the note payload
3. Inngest `notification-mention-dispatch` function:
   - Extracts `mentions` array (user UUIDs) from the note
   - For each mentioned user: dispatches `notification/dispatch` with `event_type = 'mention'`
   - Standard preference routing applies

**Why Inngest, not Realtime:** Mentions need email delivery (the user might not be online). Supabase Realtime only handles live-connected clients. Inngest ensures reliable delivery with retries.

## 4. Event Catalog

Every notification-worthy event in the ATS, with source and default channels.

### 4.1 Recruiter & Team Events

| Event Type | Source | Default Channel | Description |
|-----------|--------|-----------------|-------------|
| `application.new` | Application created | both | New application received for a job |
| `application.stage_changed` | Stage move | in_app | Candidate moved to a new pipeline stage |
| `scorecard.submitted` | D07 | both | Interviewer submitted a scorecard |
| `scorecard.all_complete` | D07 | email | All scorecards for an application are in |
| `interview.scheduled` | D07 | both | New interview scheduled |
| `interview.cancelled` | D07 | both | Interview cancelled |
| `interview.feedback_overdue` | D07 cron | email | Feedback deadline passed without submission |
| `interview.no_show` | D07 | both | Candidate/interviewer marked no-show |
| `offer.approval_requested` | D06 | email | You have an offer to approve |
| `offer.approved` | D06 | both | Your offer was approved |
| `offer.rejected` | D06 | both | Your offer was rejected by an approver |
| `offer.signed` | D06 | both | Candidate signed the offer |
| `offer.declined` | D06 | both | Candidate declined the offer |
| `offer.expired` | D06 cron | in_app | Offer passed its expiry date |
| `mention` | Notes | both | Someone @mentioned you in a note |
| `note.reply` | Notes | in_app | Someone replied to your note thread |

### 4.2 Admin Events

| Event Type | Source | Default Channel | Description |
|-----------|--------|-----------------|-------------|
| `webhook.failing` | Webhook health | email | Webhook endpoint has 5+ consecutive failures |
| `webhook.disabled` | D02 §8 | email | Webhook auto-disabled after 10 failures |
| `subscription.past_due` | D03 | email | Payment failed, subscription entering dunning |
| `subscription.canceled` | D03 | email | Subscription canceled (voluntary or dunning end) |
| `ai_credits.exhausted` | D03 | both | Organization AI credits depleted for the month |
| `member.invited` | Org management | email | New team member invited |
| `member.removed` | Org management | both | Team member removed from organization |

### 4.3 Candidate Events (delivered via D09 Candidate Portal)

These events are defined here for completeness but delivered through the candidate portal (D09), not the internal notification system:

| Event Type | Delivery | Description |
|-----------|----------|-------------|
| `candidate.application_received` | Email | Application confirmation |
| `candidate.interview_scheduled` | Email | Interview details + calendar invite |
| `candidate.interview_cancelled` | Email | Interview cancellation notice |
| `candidate.offer_sent` | Email (via Dropbox Sign) | Offer for e-signature |
| `candidate.rejected` | Email | Rejection notification (configurable delay) |

## 5. Webhook Outbound

### 5.1 Delivery Flow

Per D02 §8, webhook outbound is feature-gated by `webhook_outbound` flag (Growth+ plans per D03).

```typescript
// Inngest function: notification/webhook-deliver
export const webhookDeliver = inngest.createFunction(
  { id: 'notification/webhook-deliver', retries: 5 },
  { event: 'notification/webhook-deliver' },
  async ({ event, step }) => {
    const { endpoint_id, payload, event_type } = event.data;

    const endpoint = await step.run('load-endpoint', async () => {
      // Service role — bypass RLS for background delivery
      return supabaseAdmin.from('webhook_endpoints')
        .select('*')
        .eq('id', endpoint_id)
        .eq('is_active', true)
        .single();
    });

    if (!endpoint.data) return { skipped: true, reason: 'endpoint_inactive' };

    const signature = computeHmacSignature(endpoint.data.secret, payload);

    const response = await step.run('deliver', async () => {
      return fetch(endpoint.data.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-ATS-Signature': signature,
          'X-ATS-Event': event_type,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),  // 10s timeout
      });
    });

    await step.run('update-health', async () => {
      if (response.ok) {
        // Reset failure count on success
        await supabaseAdmin.from('webhook_endpoints')
          .update({ failure_count: 0, last_triggered_at: new Date(), last_status_code: response.status })
          .eq('id', endpoint_id);
      } else {
        // Increment failure count
        await supabaseAdmin.rpc('increment_webhook_failure', { endpoint_id });
      }
    });
  }
);
```

### 5.2 Webhook Re-enablement (G-021 Resolution)

**Decision:** Manual re-enablement only, with admin notification before and after disable.

Flow:
1. **At 5 consecutive failures:** Send `webhook.failing` notification to org admins. Endpoint stays active.
2. **At 10 consecutive failures:** Auto-disable endpoint (`is_active = false`). Send `webhook.disabled` notification to org admins with instructions to check endpoint URL and re-enable.
3. **Re-enablement:** Admin manually re-enables via Settings → Webhooks. On re-enable, `failure_count` resets to 0.
4. **No auto-retry:** Disabled endpoints do not auto-re-enable. Rationale: if an endpoint failed 10 times, automatic retry is likely to fail again and wastes resources. Manual intervention ensures the underlying issue is fixed.

```sql
-- Helper function for atomic failure increment + auto-disable
CREATE OR REPLACE FUNCTION increment_webhook_failure(p_endpoint_id UUID)
RETURNS INTEGER AS $$
DECLARE
  new_count INTEGER;
BEGIN
  UPDATE webhook_endpoints
  SET failure_count = failure_count + 1,
      last_triggered_at = NOW(),
      is_active = CASE WHEN failure_count + 1 >= 10 THEN FALSE ELSE is_active END
  WHERE id = p_endpoint_id AND deleted_at IS NULL
  RETURNING failure_count INTO new_count;
  RETURN new_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## 6. Notification Preferences

### 6.1 Data Model

Per D01, `notification_preferences` has `UNIQUE(user_id, event_type)` with `channel` options: `in_app`, `email`, `both`, `none`.

**Default behavior:** If no preference row exists for a user + event_type, the system uses the default channel from the Event Catalog (§4). Preferences are lazy-created — only materialized when a user explicitly changes from default.

### 6.2 Preference Lookup

```typescript
async function getNotificationChannel(
  userId: string,
  orgId: string,
  eventType: string,
  defaultChannel: 'in_app' | 'email' | 'both'
): Promise<'in_app' | 'email' | 'both' | 'none'> {
  const { data } = await supabaseAdmin
    .from('notification_preferences')
    .select('channel')
    .eq('user_id', userId)
    .eq('event_type', eventType)
    .eq('deleted_at', null)  // soft-delete filter (RLS adds this too)
    .maybeSingle();
  return data?.channel ?? defaultChannel;
}
```

### 6.3 Digest Mode

Users can opt into daily digest emails instead of per-event emails. When digest is enabled for an event type, the `channel` is set to `in_app` (immediate in-app, email batched).

**Digest delivery:**
- Inngest cron: `0 8 * * *` (8 AM UTC daily)
- Collects all events from the past 24 hours for digest-enabled event types
- Renders a single digest email with grouped sections per event type
- Skips if no events occurred

## 7. API Endpoints

### 7.1 Notification Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/notifications` | JWT | List recent notifications (unified view from source tables) |
| POST | `/api/v1/notifications/read` | JWT | Mark notifications as read (updates `last_read_at`) |
| GET | `/api/v1/notifications/unread-count` | JWT | Get unread notification count |

### 7.2 Notification Preference Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/notification-preferences` | JWT | Get all preferences for current user |
| PUT | `/api/v1/notification-preferences/:eventType` | JWT | Set channel for an event type |
| DELETE | `/api/v1/notification-preferences/:eventType` | JWT | Reset to default (soft-delete preference row) |

### 7.3 Email Template Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/email-templates` | JWT | List templates (filterable by `category`) |
| POST | `/api/v1/email-templates` | JWT | Create custom template |
| GET | `/api/v1/email-templates/:id` | JWT | Get template detail with merge field list |
| PATCH | `/api/v1/email-templates/:id` | JWT | Update template |
| DELETE | `/api/v1/email-templates/:id` | JWT | Soft-delete (system templates cannot be deleted) |
| POST | `/api/v1/email-templates/:id/preview` | JWT | Render template with sample data |

### 7.4 Webhook Endpoint Management

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/webhook-endpoints` | JWT | List webhook endpoints (owner/admin only) |
| POST | `/api/v1/webhook-endpoints` | JWT | Create webhook endpoint |
| PATCH | `/api/v1/webhook-endpoints/:id` | JWT | Update endpoint (URL, events, re-enable) |
| DELETE | `/api/v1/webhook-endpoints/:id` | JWT | Soft-delete endpoint |
| POST | `/api/v1/webhook-endpoints/:id/test` | JWT | Send test payload to endpoint |

### 7.5 Request/Response Schemas

```typescript
// PUT /api/v1/notification-preferences/:eventType
const SetPreferenceSchema = z.object({
  channel: z.enum(['in_app', 'email', 'both', 'none']),
});

// POST /api/v1/webhook-endpoints
const CreateWebhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.string()).min(1),
});
// Response includes `secret` (shown once, never returned again)

// POST /api/v1/email-templates
const CreateEmailTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  subject: z.string().min(1).max(200),
  body_html: z.string().min(1),
  body_text: z.string().optional(),
  category: z.enum(['interview_invite', 'rejection', 'offer', 'follow_up', 'nurture', 'custom']),
  merge_fields: z.array(z.string()).default([]),
});

// POST /api/v1/email-templates/:id/preview
const PreviewTemplateSchema = z.object({
  variables: z.record(z.unknown()),  // Sample TemplateVariables
});
```

## 8. Inngest Functions

| Function ID | Trigger | What It Does |
|-------------|---------|-------------|
| `notification/dispatch` | `notification/dispatch` | Routes notification to channels based on user preferences |
| `notification/send-email` | `notification/send-email` | Renders email template + sends via Resend |
| `notification/send-in-app` | `notification/send-in-app` | Broadcasts via Supabase Realtime to user's channel |
| `notification/mention-dispatch` | `note/created` | Extracts mentions from note, dispatches per-user notifications |
| `notification/webhook-deliver` | `notification/webhook-deliver` | Delivers webhook payload with HMAC signature + health tracking |
| `notification/webhook-fanout` | `notification/webhook-fanout` | For a given event, fans out to all active subscribed endpoints |
| `notification/digest` | `cron: 0 8 * * *` | Collects digest-enabled events from past 24h, sends batched email |

## 9. UI Components

| Component | Location | Description |
|-----------|----------|-------------|
| `NotificationBell` | Global header | Badge with unread count, opens notification panel |
| `NotificationPanel` | Slide-over from bell | Scrollable list of recent notifications with mark-as-read |
| `NotificationToast` | Global overlay | Toast popup for real-time notifications (uses Supabase Realtime) |
| `NotificationPreferences` | Settings → Notifications | Per-event-type channel toggles (in-app / email / both / none) |
| `EmailTemplateEditor` | Settings → Email Templates | WYSIWYG editor with merge field insertion + preview |
| `WebhookManager` | Settings → Webhooks | Endpoint CRUD, event subscription checkboxes, health status |
| `WebhookHealthBadge` | Webhook list item | Green/yellow/red indicator based on `failure_count` |

## 10. Edge Cases

### 10.1 Notification Preference Not Set

Default channel from Event Catalog §4 is used. No preference row is created until the user explicitly changes it.

### 10.2 Email Template Missing

If no org-specific template exists for a category, fall back to system template (`is_system = TRUE`). System templates are seeded on organization creation and cannot be deleted (RLS enforced: `is_system = FALSE` check on DELETE policy).

### 10.3 Webhook Endpoint URL Unreachable

Inngest retries 5 times with exponential backoff. After all retries fail for a single delivery, `failure_count` increments by 1 (not 5 — only the final failure counts). At 5 failures: warning notification. At 10: auto-disable.

### 10.4 User Removed from Organization

On `member.removed` event:
- All future notifications to the removed user are skipped (RLS prevents access)
- Their `notification_preferences` remain (soft-deleted if membership is soft-deleted)
- Active webhook endpoints they created remain active (owned by org, not user)

### 10.5 Bulk Operations

When a recruiter moves 50 candidates at once (bulk stage change):
- A single `notification/bulk-stage-change` event is emitted (not 50 individual events)
- Notification renders as "50 candidates moved to Interview stage" (grouped)
- Webhook outbound sends one payload with array of changes (not 50 individual webhooks)

### 10.6 Self-Notification Suppression

Users never receive notifications for their own actions. The dispatch function checks `actor_id !== recipient_id` and skips if equal.

### 10.7 Rate Limiting on Notifications

In-app: no limit (Realtime broadcast is cheap). Email: maximum 50 emails per user per hour (prevent inbox flooding from bulk operations). Webhook: maximum 1000 deliveries per endpoint per hour (per D02 rate limiting).

## 11. Security Considerations

- **Webhook secrets:** Generated server-side (crypto.randomBytes(32)), stored in `webhook_endpoints.secret`, shown to admin once at creation. Used for HMAC-SHA256 signing of payloads.
- **Email template injection:** `{{variable}}` replacement uses strict allowlist from `merge_fields`. Unknown variables render as empty string, not raw template syntax. HTML in variable values is escaped.
- **Notification data leakage:** In-app notifications delivered via Supabase Realtime use org-scoped + user-filtered channels. No cross-org or cross-user leakage possible.
- **Webhook payload sanitization:** Sensitive fields (candidate SSN, DEI data, encryption keys) are never included in webhook payloads. Payload schema is documented per event type.
