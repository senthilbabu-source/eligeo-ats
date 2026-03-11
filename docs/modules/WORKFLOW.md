# Workflow & State Machine

> **ID:** D12
> **Status:** Review
> **Priority:** P1
> **Last updated:** 2026-03-10
> **Depends on:** D01 (schema — pipeline_stages, applications, application_stage_history, talent_pools), D07 (interviews — completion signals), D08 (notifications — event dispatch), D10 (search — Typesense sync on stage change)
> **Depended on by:** D09 (Candidate Portal — application status polling), D16 (Performance — bulk transition optimization), D17 (Analytics — pipeline throughput metrics)
> **Last validated against deps:** 2026-03-10
> **Architecture decisions assumed:** ADR-001 (Supabase client + Inngest), ADR-006 (soft delete), ADR-007 (audit), ADR-008 (CHECK enums)

---

## 1. Overview

Workflow & State Machine defines how candidates move through the hiring pipeline, what automation rules execute at each stage transition, and how the system enforces valid state changes. This covers the `auto_actions` JSONB schema, stage transition validation, auto-advance rules, talent pool automation, SLA enforcement, and the Inngest functions that orchestrate background workflow execution.

**Scope:**
- In scope: Stage transition state machine, `auto_actions` JSONB specification, auto-advance triggers, talent pool automation rules (G-018), interview completion auto-advance (G-025), SLA timers, bulk operations, rejection/withdrawal flows.
- Out of scope: Pipeline template CRUD (D01 schema), kanban board UI (D05 Design), real-time board updates (D11), candidate portal status (D09).

## 2. User Stories

| ID | Role | Story | Acceptance Criteria |
|----|------|-------|---------------------|
| US-01 | Recruiter | Move a candidate to the next pipeline stage | Given I drag a card on the kanban board, then the candidate's `current_stage_id` updates, `application_stage_history` is appended, and `auto_actions` for the new stage fire |
| US-02 | Recruiter | Auto-advance candidates after all interviews complete | Given all interviews for an application are `completed` and all scorecards submitted, when auto-advance is enabled on the stage, then the candidate moves to the next stage automatically |
| US-03 | Admin | Configure auto-actions on a pipeline stage | Given I'm editing a pipeline template, when I add an auto-action (e.g., send email, add to pool), then it saves to the `auto_actions` JSONB column |
| US-04 | Recruiter | Reject a candidate with a reason | Given I reject a candidate, then `status` changes to `rejected`, `rejected_at` is set, `rejection_reason_id` is populated, and the rejection notification fires |
| US-05 | Recruiter | Auto-add rejected candidates to a talent pool | Given auto-pool rules exist for a rejection stage, when a candidate is rejected, then they're added to the configured talent pool automatically |
| US-06 | Admin | Set SLA timers on pipeline stages | Given an SLA is configured, when a candidate exceeds the time limit in a stage, then the assigned recruiter receives a notification |
| US-07 | Recruiter | Bulk-move candidates across stages | Given I select multiple candidates, when I bulk-move them, then all transitions fire sequentially with audit trails |
| US-08 | Recruiter | Move a candidate backward in the pipeline | Given I need to re-screen a candidate, when I move them to an earlier stage, then the transition is logged with a reason |

## 3. State Machine

### 3.1 Application Status

The `applications.status` field tracks the disposition outcome — it is **not** the stage position.

```
                    ┌─────────┐
                    │  active  │◄──── (initial state on application creation)
                    └────┬─────┘
                         │
            ┌────────────┼────────────┐
            │            │            │
            ▼            ▼            ▼
       ┌────────┐  ┌──────────┐  ┌───────────┐
       │ hired  │  │ rejected │  │ withdrawn │
       └────────┘  └──────────┘  └───────────┘
         (terminal)   (terminal)   (terminal)
```

**Transitions:**
- `active → hired` — Offer accepted. Sets `hired_at`. Only from stages with `stage_type = 'offer'` or `'hired'`.
- `active → rejected` — Rejected at any stage. Sets `rejected_at`, `rejection_reason_id`. Requires `rejection_reason_id`.
- `active → withdrawn` — Candidate withdraws. Sets `withdrawn_at`. Can happen at any stage.
- Terminal → active — **Not allowed.** Reactivation requires a new application.

### 3.2 Stage Transitions

Candidates with `status = 'active'` can move between non-terminal pipeline stages. The stage position is tracked by `current_stage_id`.

**Validation rules:**
1. Application `status` must be `'active'` — terminal applications cannot move.
2. Target stage must belong to the same `pipeline_template_id` as the job's pipeline.
3. Forward moves require no special permission — any team member with application update access.
4. Backward moves are allowed — logged with a mandatory `reason` field.
5. Skip stages allowed — moving from stage 1 to stage 4 is valid (common for internal referrals).
6. Terminal stages (`is_terminal = TRUE`) trigger status change — moving to a `hired` stage sets `status = 'hired'`, moving to `rejected` sets `status = 'rejected'`.

### 3.3 Transition Function

```typescript
// Server Action: move application to a new stage
'use server';

interface MoveApplicationInput {
  applicationId: string;
  toStageId: string;
  reason?: string; // Required for backward moves
}

async function moveApplicationStage(input: MoveApplicationInput) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // 1. Fetch application + current stage + target stage
  const { data: app } = await supabase
    .from('applications')
    .select('*, current_stage:pipeline_stages!current_stage_id(*)')
    .eq('id', input.applicationId)
    .single();

  if (app.status !== 'active') throw new Error('Cannot move terminal application');

  const { data: targetStage } = await supabase
    .from('pipeline_stages')
    .select('*')
    .eq('id', input.toStageId)
    .single();

  // 2. Validate same pipeline
  if (app.current_stage.pipeline_template_id !== targetStage.pipeline_template_id) {
    throw new Error('Target stage must be in the same pipeline');
  }

  // 3. Require reason for backward moves
  const isBackward = targetStage.stage_order < app.current_stage.stage_order;
  if (isBackward && !input.reason) {
    throw new Error('Reason required for backward stage moves');
  }

  // 4. Determine terminal status change
  const statusUpdate: Record<string, unknown> = {
    current_stage_id: input.toStageId,
  };
  if (targetStage.is_terminal && targetStage.stage_type === 'hired') {
    statusUpdate.status = 'hired';
    statusUpdate.hired_at = new Date().toISOString();
  }
  // Rejection goes through rejectApplication(), not stage move

  // 5. Update application
  await supabase
    .from('applications')
    .update(statusUpdate)
    .eq('id', input.applicationId);

  // 6. Append stage history
  await supabase
    .from('application_stage_history')
    .insert({
      organization_id: app.organization_id,
      application_id: input.applicationId,
      from_stage_id: app.current_stage_id,
      to_stage_id: input.toStageId,
      transitioned_by: user.id,
      reason: input.reason ?? null,
    });

  // 7. Fire workflow event for auto-actions
  await inngest.send({
    name: 'workflow/stage-changed',
    data: {
      organization_id: app.organization_id,
      application_id: input.applicationId,
      candidate_id: app.candidate_id,
      job_opening_id: app.job_opening_id,
      from_stage_id: app.current_stage_id,
      to_stage_id: input.toStageId,
      stage_type: targetStage.stage_type,
      auto_actions: targetStage.auto_actions,
      transitioned_by: user.id,
    },
  });
}
```

## 4. Auto-Actions (`auto_actions` JSONB Schema)

The `pipeline_stages.auto_actions` column stores an array of automation rules that fire when a candidate enters the stage.

### 4.1 Schema Definition

```typescript
interface AutoActions {
  actions: AutoAction[];
}

type AutoAction =
  | SendEmailAction
  | AddToPoolAction
  | NotifyTeamAction
  | SetSLAAction
  | WebhookAction
  | AutoAdvanceAction;

interface SendEmailAction {
  type: 'send_email';
  template_id: string;      // FK to email_templates.id
  recipient: 'candidate' | 'hiring_manager' | 'recruiter' | 'team';
  delay_minutes?: number;   // Optional delay before sending (default: 0)
}

interface AddToPoolAction {
  type: 'add_to_pool';
  talent_pool_id: string;   // FK to talent_pools.id
  condition?: 'always' | 'if_rejected';  // Default: 'always'
}

interface NotifyTeamAction {
  type: 'notify_team';
  recipients: ('hiring_manager' | 'recruiter' | 'team')[];
  message?: string;          // Custom message body (optional)
}

interface SetSLAAction {
  type: 'set_sla';
  hours: number;             // SLA deadline in hours from stage entry
  escalation: 'notify_recruiter' | 'notify_hiring_manager' | 'notify_admin';
}

interface WebhookAction {
  type: 'webhook';
  event_type: string;        // Custom event type for webhook delivery
}

interface AutoAdvanceAction {
  type: 'auto_advance';
  trigger: 'all_interviews_complete' | 'all_scorecards_submitted' | 'offer_signed';
  target_stage_id?: string;  // Specific stage to advance to (default: next by stage_order)
}
```

### 4.2 JSON Example

```json
{
  "actions": [
    {
      "type": "send_email",
      "template_id": "tpl-phone-screen-invite",
      "recipient": "candidate",
      "delay_minutes": 0
    },
    {
      "type": "notify_team",
      "recipients": ["hiring_manager"],
      "message": "New candidate reached phone screen stage"
    },
    {
      "type": "set_sla",
      "hours": 72,
      "escalation": "notify_recruiter"
    },
    {
      "type": "auto_advance",
      "trigger": "all_scorecards_submitted"
    }
  ]
}
```

### 4.3 Validation

Auto-actions are validated on save (pipeline template update), not at runtime:

```typescript
// Zod schema for auto_actions validation
const autoActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('send_email'),
    template_id: z.string().uuid(),
    recipient: z.enum(['candidate', 'hiring_manager', 'recruiter', 'team']),
    delay_minutes: z.number().int().min(0).max(10080).optional(), // Max 7 days
  }),
  z.object({
    type: z.literal('add_to_pool'),
    talent_pool_id: z.string().uuid(),
    condition: z.enum(['always', 'if_rejected']).default('always'),
  }),
  z.object({
    type: z.literal('notify_team'),
    recipients: z.array(z.enum(['hiring_manager', 'recruiter', 'team'])).min(1),
    message: z.string().max(500).optional(),
  }),
  z.object({
    type: z.literal('set_sla'),
    hours: z.number().int().min(1).max(720), // Max 30 days
    escalation: z.enum(['notify_recruiter', 'notify_hiring_manager', 'notify_admin']),
  }),
  z.object({
    type: z.literal('webhook'),
    event_type: z.string().max(100),
  }),
  z.object({
    type: z.literal('auto_advance'),
    trigger: z.enum(['all_interviews_complete', 'all_scorecards_submitted', 'offer_signed']),
    target_stage_id: z.string().uuid().optional(),
  }),
]);

const autoActionsSchema = z.object({
  actions: z.array(autoActionSchema).max(10), // Max 10 actions per stage
});
```

## 5. Auto-Advance (G-025 Resolution)

When all scheduled interviews for an application reach `completed` status and all scorecards are submitted, the workflow engine optionally auto-advances the candidate to the next pipeline stage.

### 5.1 Trigger Mechanism

```
Interview completed → scorecard submitted → Inngest: "interview/scorecard-submitted"
                                                    ↓
                                        Check: all interviews for this application completed?
                                        Check: all scorecards submitted?
                                                    ↓ (both true)
                                        Check: current stage has auto_advance action?
                                                    ↓ (yes)
                                        Execute stage transition (system user)
```

### 5.2 Inngest Function

```typescript
export const workflowAutoAdvance = inngest.createFunction(
  { id: 'workflow/auto-advance', retries: 3 },
  { event: 'interview/scorecard-submitted' },
  async ({ event, step }) => {
    const { application_id, organization_id } = event.data;

    // Step 1: Check if all interviews are complete
    const allComplete = await step.run('check-interviews', async () => {
      const supabase = createServiceClient();
      const { data: interviews } = await supabase
        .from('interviews')
        .select('id, status')
        .eq('application_id', application_id)
        .is('deleted_at', null);

      if (!interviews?.length) return false;

      const allInterviewsComplete = interviews.every(
        (i) => i.status === 'completed' || i.status === 'cancelled'
      );
      if (!allInterviewsComplete) return false;

      // Check all non-cancelled interviews have scorecards
      const activeInterviewIds = interviews
        .filter((i) => i.status === 'completed')
        .map((i) => i.id);

      const { data: scorecards } = await supabase
        .from('scorecard_submissions')
        .select('interview_id')
        .in('interview_id', activeInterviewIds)
        .is('deleted_at', null);

      const submittedInterviewIds = new Set(scorecards?.map((s) => s.interview_id));
      return activeInterviewIds.every((id) => submittedInterviewIds.has(id));
    });

    if (!allComplete) return { skipped: true, reason: 'not_all_complete' };

    // Step 2: Check if current stage has auto-advance configured
    const advanceTarget = await step.run('check-auto-advance', async () => {
      const supabase = createServiceClient();
      const { data: app } = await supabase
        .from('applications')
        .select('current_stage_id, status, job_opening_id')
        .eq('id', application_id)
        .single();

      if (app.status !== 'active') return null;

      const { data: stage } = await supabase
        .from('pipeline_stages')
        .select('auto_actions, pipeline_template_id, stage_order')
        .eq('id', app.current_stage_id)
        .single();

      const actions = (stage.auto_actions as AutoActions)?.actions ?? [];
      const autoAdvance = actions.find(
        (a) => a.type === 'auto_advance' &&
          (a.trigger === 'all_interviews_complete' || a.trigger === 'all_scorecards_submitted')
      );

      if (!autoAdvance) return null;

      // Determine target stage
      if (autoAdvance.target_stage_id) {
        return autoAdvance.target_stage_id;
      }

      // Default: next stage by stage_order
      const { data: nextStage } = await supabase
        .from('pipeline_stages')
        .select('id')
        .eq('pipeline_template_id', stage.pipeline_template_id)
        .gt('stage_order', stage.stage_order)
        .is('deleted_at', null)
        .order('stage_order', { ascending: true })
        .limit(1)
        .single();

      return nextStage?.id ?? null;
    });

    if (!advanceTarget) return { skipped: true, reason: 'no_auto_advance_configured' };

    // Step 3: Execute the stage transition as system user
    await step.run('advance-stage', async () => {
      const supabase = createServiceClient();

      await supabase.rpc('set_config', {
        setting: 'app.performed_by',
        value: '00000000-0000-0000-0000-000000000000', // System user UUID
      });

      const { data: app } = await supabase
        .from('applications')
        .select('current_stage_id, organization_id')
        .eq('id', application_id)
        .single();

      await supabase
        .from('applications')
        .update({ current_stage_id: advanceTarget })
        .eq('id', application_id);

      await supabase
        .from('application_stage_history')
        .insert({
          organization_id: app.organization_id,
          application_id,
          from_stage_id: app.current_stage_id,
          to_stage_id: advanceTarget,
          transitioned_by: '00000000-0000-0000-0000-000000000000',
          reason: 'Auto-advanced: all interviews complete and scorecards submitted',
        });

      // Fire stage-changed event to trigger new stage's auto-actions
      await inngest.send({
        name: 'workflow/stage-changed',
        data: {
          organization_id: app.organization_id,
          application_id,
          from_stage_id: app.current_stage_id,
          to_stage_id: advanceTarget,
          transitioned_by: '00000000-0000-0000-0000-000000000000',
          is_auto_advance: true,
        },
      });
    });

    return { advanced: true, application_id, target_stage_id: advanceTarget };
  }
);
```

### 5.3 Auto-Advance Safeguards

- **Infinite loop prevention:** If `is_auto_advance = true` in the stage-changed event, auto-advance actions on the *new* stage do NOT fire immediately. Only manual actions (send_email, notify_team) fire. This prevents cascading auto-advances across multiple stages.
- **Terminal stage guard:** Auto-advance never targets a terminal stage (`is_terminal = TRUE`). If the next stage is terminal, auto-advance is skipped and the recruiter is notified to take manual action.
- **Stale check:** Before executing the advance, re-read the application's current stage. If it has already moved (another user moved it while the function was running), skip.

## 6. Talent Pool Automation (G-018 Resolution)

### 6.1 Auto-Pool Rules

Talent pool automation is configured via `add_to_pool` auto-actions on pipeline stages — specifically on rejection or terminal stages. There is no separate "pool rules" table; the rules live in the `auto_actions` JSONB of the stage where the trigger occurs.

**Patterns:**

| Scenario | Configuration |
|----------|--------------|
| All rejected candidates → "Future Opportunities" pool | Add `add_to_pool` action with `condition: 'always'` on the `rejected` stage |
| Silver medalists (rejected at offer stage) → "Strong Candidates" pool | Add `add_to_pool` action on the offer-stage's rejection flow |
| Hired candidates → "Alumni" pool | Add `add_to_pool` action with `condition: 'always'` on the `hired` terminal stage |

### 6.2 Pool Membership Execution

```typescript
// Within workflow/stage-changed Inngest handler
async function executeAddToPool(
  action: AddToPoolAction,
  context: StageChangeContext
) {
  // If condition is 'if_rejected', only execute on rejection transitions
  if (action.condition === 'if_rejected' && context.stage_type !== 'rejected') {
    return;
  }

  const supabase = createServiceClient();

  // Check if candidate is already in the pool (idempotent)
  const { data: existing } = await supabase
    .from('talent_pool_members')
    .select('id')
    .eq('talent_pool_id', action.talent_pool_id)
    .eq('candidate_id', context.candidate_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (existing) return; // Already in pool

  await supabase.from('talent_pool_members').insert({
    organization_id: context.organization_id,
    talent_pool_id: action.talent_pool_id,
    candidate_id: context.candidate_id,
    added_by: context.transitioned_by, // System user if auto-advance
    notes: `Auto-added on stage transition to "${context.stage_name}"`,
  });
}
```

### 6.3 Rejection Flow with Pool Automation

```typescript
// Server Action: reject an application
async function rejectApplication(input: {
  applicationId: string;
  rejectionReasonId: string;
  rejectionNotes?: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: app } = await supabase
    .from('applications')
    .select('*, current_stage:pipeline_stages!current_stage_id(*)')
    .eq('id', input.applicationId)
    .single();

  if (app.status !== 'active') throw new Error('Application is not active');

  // 1. Update application status
  await supabase
    .from('applications')
    .update({
      status: 'rejected',
      rejected_at: new Date().toISOString(),
      rejection_reason_id: input.rejectionReasonId,
      rejection_notes: input.rejectionNotes ?? null,
    })
    .eq('id', input.applicationId);

  // 2. Fire rejection event (triggers pool automation + notification)
  await inngest.send({
    name: 'workflow/application-rejected',
    data: {
      organization_id: app.organization_id,
      application_id: input.applicationId,
      candidate_id: app.candidate_id,
      job_opening_id: app.job_opening_id,
      stage_id: app.current_stage_id,
      stage_type: app.current_stage.stage_type,
      rejection_reason_id: input.rejectionReasonId,
      auto_actions: app.current_stage.auto_actions,
      rejected_by: user.id,
    },
  });
}
```

## 7. SLA Enforcement

### 7.1 SLA Timer Creation

When a candidate enters a stage with a `set_sla` auto-action, an Inngest delayed event is scheduled:

```typescript
// Within workflow/stage-changed handler
async function executeSLA(action: SetSLAAction, context: StageChangeContext) {
  // Schedule a delayed check
  await inngest.send({
    name: 'workflow/sla-check',
    data: {
      organization_id: context.organization_id,
      application_id: context.application_id,
      stage_id: context.to_stage_id,
      escalation: action.escalation,
      created_at: new Date().toISOString(),
    },
    // Inngest delayed delivery
    ts: new Date(Date.now() + action.hours * 60 * 60 * 1000).getTime(),
  });
}
```

### 7.2 SLA Check Function

```typescript
export const workflowSLACheck = inngest.createFunction(
  { id: 'workflow/sla-check', retries: 2 },
  { event: 'workflow/sla-check' },
  async ({ event, step }) => {
    const { application_id, stage_id, escalation, organization_id } = event.data;

    // Check if application is still in the same stage
    const stillInStage = await step.run('check-stage', async () => {
      const supabase = createServiceClient();
      const { data: app } = await supabase
        .from('applications')
        .select('current_stage_id, status')
        .eq('id', application_id)
        .single();

      return app?.status === 'active' && app?.current_stage_id === stage_id;
    });

    if (!stillInStage) return { skipped: true, reason: 'application_moved' };

    // Fire escalation notification
    await step.run('escalate', async () => {
      await inngest.send({
        name: 'notification/dispatch',
        data: {
          organization_id,
          event_type: 'sla.breached',
          payload: {
            application_id,
            stage_id,
            escalation_target: escalation,
          },
        },
      });
    });

    return { escalated: true, application_id, escalation };
  }
);
```

### 7.3 SLA Cancellation

SLA timers are **not explicitly cancelled** when a candidate moves out of a stage. Instead, the SLA check function is idempotent — it re-checks whether the application is still in the same stage before escalating. If the candidate has moved, the function returns early. This avoids tracking SLA timer IDs.

## 8. Workflow Execution Engine

### 8.1 Stage-Changed Handler

The central Inngest function that orchestrates all auto-actions:

```typescript
export const workflowStageChanged = inngest.createFunction(
  { id: 'workflow/stage-changed', retries: 3 },
  { event: 'workflow/stage-changed' },
  async ({ event, step }) => {
    const {
      organization_id, application_id, candidate_id,
      to_stage_id, auto_actions, is_auto_advance,
    } = event.data;

    // Parse auto-actions
    const parsed = autoActionsSchema.safeParse(auto_actions ?? { actions: [] });
    if (!parsed.success) {
      console.error('Invalid auto_actions', parsed.error);
      return { error: 'invalid_auto_actions' };
    }

    const results: Record<string, unknown>[] = [];

    for (const action of parsed.data.actions) {
      // Skip auto-advance if this was itself an auto-advance (loop prevention)
      if (is_auto_advance && action.type === 'auto_advance') continue;

      const result = await step.run(`action-${action.type}`, async () => {
        switch (action.type) {
          case 'send_email':
            return executeSendEmail(action, event.data);
          case 'add_to_pool':
            return executeAddToPool(action, event.data);
          case 'notify_team':
            return executeNotifyTeam(action, event.data);
          case 'set_sla':
            return executeSLA(action, event.data);
          case 'webhook':
            return executeWebhook(action, event.data);
          case 'auto_advance':
            // Auto-advance actions register a listener, they don't execute immediately
            return { registered: true, trigger: action.trigger };
          default:
            return { skipped: true, reason: 'unknown_action_type' };
        }
      });

      results.push({ type: action.type, result });
    }

    // Emit notification event for the stage change itself
    await step.run('notify-stage-change', async () => {
      await inngest.send({
        name: 'notification/dispatch',
        data: {
          organization_id,
          event_type: 'application.stage_changed',
          payload: {
            application_id,
            candidate_id,
            to_stage_id,
          },
        },
      });
    });

    // Trigger Typesense sync for updated application
    await step.run('sync-search', async () => {
      await inngest.send({
        name: 'search/candidate-updated',
        data: { organization_id, candidate_id },
      });
    });

    return { actions_executed: results.length, results };
  }
);
```

### 8.2 Rejection Handler

```typescript
export const workflowRejection = inngest.createFunction(
  { id: 'workflow/rejection', retries: 3 },
  { event: 'workflow/application-rejected' },
  async ({ event, step }) => {
    const { organization_id, application_id, candidate_id, auto_actions } = event.data;

    // Execute pool actions with 'if_rejected' condition
    const parsed = autoActionsSchema.safeParse(auto_actions ?? { actions: [] });
    if (parsed.success) {
      for (const action of parsed.data.actions) {
        if (action.type === 'add_to_pool') {
          await step.run(`pool-${action.talent_pool_id}`, async () => {
            await executeAddToPool(action, { ...event.data, stage_type: 'rejected' });
          });
        }
      }
    }

    // Send rejection notification to candidate
    await step.run('notify-rejection', async () => {
      await inngest.send({
        name: 'notification/dispatch',
        data: {
          organization_id,
          event_type: 'application.rejected',
          payload: { application_id, candidate_id },
        },
      });
    });

    // Sync search index
    await step.run('sync-search', async () => {
      await inngest.send({
        name: 'search/candidate-updated',
        data: { organization_id, candidate_id },
      });
    });
  }
);
```

### 8.3 Withdrawal Handler

When a candidate withdraws (via Candidate Portal D09), the workflow engine processes cleanup:

```typescript
export const workflowWithdrawal = inngest.createFunction(
  { id: 'workflow/application-withdrawn', retries: 3 },
  { event: 'workflow/application-withdrawn' },
  async ({ event, step }) => {
    const { organization_id, application_id, candidate_id } = event.data;

    // Step 1: Update application status
    await step.run('update-status', async () => {
      const supabase = createServiceClient();
      await supabase.rpc('set_local_org', { org_id: organization_id });
      await supabase.from('applications')
        .update({ status: 'withdrawn', withdrawn_at: new Date().toISOString() })
        .eq('id', application_id);
    });

    // Step 2: Void any pending offers
    await step.run('void-pending-offers', async () => {
      const supabase = createServiceClient();
      await supabase.rpc('set_local_org', { org_id: organization_id });
      const { data: offers } = await supabase.from('offers')
        .select('id, status')
        .eq('application_id', application_id)
        .in('status', ['draft', 'pending_approval', 'approved', 'sent'])
        .is('deleted_at', null);

      for (const offer of offers ?? []) {
        await inngest.send({
          name: 'ats/offer.withdrawn',
          data: { organization_id, offer_id: offer.id, reason: 'candidate_withdrawn' },
        });
      }
    });

    // Step 3: Notify relevant team members
    await step.run('notify-withdrawal', async () => {
      await inngest.send({
        name: 'notification/dispatch',
        data: {
          organization_id,
          event_type: 'application.withdrawn',
          payload: { application_id, candidate_id },
        },
      });
    });

    // Step 4: Sync search index
    await step.run('sync-search', async () => {
      await inngest.send({
        name: 'search/candidate-updated',
        data: { organization_id, candidate_id },
      });
    });
  }
);
```

**Trigger:** The Candidate Portal (D09) sends `workflow/application-withdrawn` when a candidate withdraws. This ensures withdrawals route through the workflow engine rather than only firing a notification event.

---

## 9. Bulk Operations

### 9.1 Bulk Stage Move

```typescript
// Server Action: bulk move applications
async function bulkMoveApplications(input: {
  applicationIds: string[];
  toStageId: string;
  reason?: string;
}) {
  if (input.applicationIds.length > 50) {
    throw new Error('Maximum 50 applications per bulk move');
  }

  // Process sequentially to maintain audit trail order
  const results: { id: string; success: boolean; error?: string }[] = [];

  for (const appId of input.applicationIds) {
    try {
      await moveApplicationStage({
        applicationId: appId,
        toStageId: input.toStageId,
        reason: input.reason ?? 'Bulk stage move',
      });
      results.push({ id: appId, success: true });
    } catch (error) {
      results.push({ id: appId, success: false, error: error.message });
    }
  }

  return results;
}
```

### 9.2 Bulk Reject

```typescript
async function bulkRejectApplications(input: {
  applicationIds: string[];
  rejectionReasonId: string;
  rejectionNotes?: string;
}) {
  if (input.applicationIds.length > 50) {
    throw new Error('Maximum 50 applications per bulk reject');
  }

  const results: { id: string; success: boolean; error?: string }[] = [];

  for (const appId of input.applicationIds) {
    try {
      await rejectApplication({
        applicationId: appId,
        rejectionReasonId: input.rejectionReasonId,
        rejectionNotes: input.rejectionNotes,
      });
      results.push({ id: appId, success: true });
    } catch (error) {
      results.push({ id: appId, success: false, error: error.message });
    }
  }

  return results;
}
```

### 9.3 Bulk Operation Limits

| Operation | Limit | Rationale |
|-----------|-------|-----------|
| Bulk stage move | 50 per request | Each fires Inngest events; 50 keeps queue manageable |
| Bulk reject | 50 per request | Each triggers notification + pool automation |
| Bulk pool add | 100 per request | Simple insert, no cascading events |

## 10. API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/applications/:id/move` | JWT | Move application to a new stage |
| POST | `/api/v1/applications/:id/reject` | JWT | Reject an application |
| POST | `/api/v1/applications/:id/withdraw` | JWT | Withdraw an application |
| POST | `/api/v1/applications/bulk/move` | JWT | Bulk move applications |
| POST | `/api/v1/applications/bulk/reject` | JWT | Bulk reject applications |
| GET | `/api/v1/applications/:id/history` | JWT | Get stage transition history |
| GET | `/api/v1/pipeline-stages/:id/auto-actions` | JWT | Get stage auto-actions |
| PUT | `/api/v1/pipeline-stages/:id/auto-actions` | JWT (admin) | Update stage auto-actions |
| GET | `/api/v1/applications/:id/sla` | JWT | Get SLA status for an application |

## 11. Inngest Functions

### Naming Convention (Global)

All Inngest function IDs use `module/action` format with forward-slash module separator and kebab-case actions:

| Module | Pattern | Example |
|--------|---------|---------|
| Workflow | `workflow/<action>` | `workflow/stage-changed` |
| Interview | `interview/<action>` | `interview/create-calendar-event` |
| Offers | `offers/<action>` | `offers/approval-notify` |
| Notification | `notification/<action>` | `notification/dispatch` |

This convention applies across all module docs (D06, D07, D08, D12).

### Function Registry

| Function ID | Trigger Event | Purpose |
|-------------|---------------|---------|
| `workflow/stage-changed` | `workflow/stage-changed` | Orchestrate all auto-actions on stage entry |
| `workflow/auto-advance` | `interview/scorecard-submitted` | Check & execute auto-advance after scorecard submission |
| `workflow/rejection` | `workflow/application-rejected` | Execute rejection flow (pool + notification + search sync) |
| `workflow/application-withdrawn` | `workflow/application-withdrawn` | Void pending offers, notify team, sync search on withdrawal |
| `workflow/sla-check` | `workflow/sla-check` (delayed) | Check if application is still in stage, escalate if breached |
| `workflow/send-email` | Internal step | Send auto-action email via Resend (D08 pattern) |
| `workflow/bulk-stage-move` | `workflow/bulk-move` | Process bulk moves with per-item error handling |

## 12. UI Components

| Component | Location | Description |
|-----------|----------|-------------|
| `PipelineEditor` | Settings → Pipeline Templates | Visual editor for stage order, types, and auto-actions |
| `AutoActionsPanel` | PipelineEditor stage detail | Configure auto-actions per stage (email, pool, SLA, etc.) |
| `StageTransitionModal` | Kanban board | Confirmation dialog with reason field for stage moves |
| `RejectionModal` | Kanban board, candidate detail | Rejection reason picker + optional notes |
| `BulkActionBar` | Application list | Toolbar for bulk move/reject with progress indicator |
| `SLABadge` | Kanban card, candidate detail | Visual indicator for SLA status (green/yellow/red) |
| `StageHistoryTimeline` | Candidate detail sidebar | Chronological log of all stage transitions |

## 13. Edge Cases

### 13.1 Deleted Stage References

When a pipeline stage is soft-deleted, existing applications with `current_stage_id` pointing to it remain valid (FK allows NULL via `ON DELETE SET NULL`). The UI shows a "Stage removed" indicator. Recruiters must manually move these applications to an active stage.

### 13.2 Pipeline Template Changes Mid-Hiring

Pipeline template edits (adding/removing/reordering stages) affect only **new** job openings that adopt the template. Existing jobs keep their pipeline snapshot. Each `job_openings.pipeline_template_id` FK is set at job creation time and not updated when the template changes.

### 13.3 Concurrent Stage Moves

Two users moving the same candidate simultaneously: last-write-wins via `UPDATE applications SET current_stage_id = ...`. Both transitions are logged in `application_stage_history`. The second move's `from_stage_id` may not match the first move's `to_stage_id` — this is expected and visible in the history timeline.

### 13.4 Auto-Action Failures

Individual auto-action failures do not block the stage transition. The transition itself is already committed. Auto-actions execute asynchronously via Inngest with retries. If an auto-action permanently fails (e.g., email template deleted), it's logged to `ai_usage_logs` as a workflow error and the admin is notified.

### 13.5 Withdrawal During Auto-Advance

If a candidate withdraws while an auto-advance Inngest function is in-flight, the function's stale-check (§5.3) detects `status !== 'active'` and aborts.

## 14. Plan Gating

| Feature | Starter | Growth | Pro | Enterprise |
|---------|---------|--------|-----|------------|
| Manual stage moves | ✅ | ✅ | ✅ | ✅ |
| Auto-actions (send_email) | ❌ | ✅ | ✅ | ✅ |
| Auto-actions (add_to_pool) | ❌ | ✅ | ✅ | ✅ |
| Auto-advance | ❌ | ❌ | ✅ | ✅ |
| SLA enforcement | ❌ | ❌ | ✅ | ✅ |
| Bulk operations | 10 | 25 | 50 | 50 |
| Custom webhook actions | ❌ | ❌ | ❌ | ✅ |

Plan checks enforced in Server Actions before executing auto-actions. Feature flag: `feature_flags->>'workflow_automation'` (boolean).

## 15. Security Considerations

- **Auto-actions execute server-side only:** All Inngest functions use `createServiceClient()` (service role). No client-side workflow execution.
- **System user for auto-advance:** `transitioned_by` is set to a well-known system UUID (`00000000-...`) for audit trail clarity. This UUID is not a real user — it's a sentinel value recognized by the audit log viewer.
- **Template ID validation:** `send_email` auto-actions validate that `template_id` belongs to the same organization at save time and at execution time.
- **Pool membership isolation:** `add_to_pool` verifies the `talent_pool_id` belongs to the same organization before inserting.
- **Bulk operation authorization:** Bulk endpoints verify the caller has `recruiter`+ role for all targeted applications (single RLS check via `organization_id`).
- **SLA data not client-facing:** SLA breach notifications go to internal team only. Candidates never see SLA information.
