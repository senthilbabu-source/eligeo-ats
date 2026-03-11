# Real-Time Features

> **ID:** D11
> **Status:** Review
> **Priority:** P1
> **Last updated:** 2026-03-10
> **Depends on:** D01 (schema — all tables with real-time interest), D02 (API patterns), D08 (Notifications — in-app delivery channel)
> **Depended on by:** D08 (Notifications — Realtime broadcast for in-app notifications), D09 (Candidate Portal — live application status), D16 (Performance — Realtime connection pooling)
> **Last validated against deps:** 2026-03-10
> **Architecture decisions assumed:** ADR-001 (Supabase client), ADR-006 (soft delete), ADR-007 (audit)

---

## 1. Overview

Real-Time Features defines how the ATS delivers live updates to connected clients using Supabase Realtime. This covers channel architecture, subscription patterns, tenant isolation, optimistic UI, presence tracking, and connection management. The system uses Supabase Realtime's three primitives: Broadcast (ephemeral messages), Presence (online status), and Postgres Changes (database-driven).

**Scope:**
- In scope: Channel naming convention, table subscriptions (Postgres Changes), broadcast channels (notifications), presence tracking, optimistic UI patterns, tenant isolation, connection lifecycle, reconnection strategy.
- Out of scope: WebSocket infrastructure (Supabase-managed), video/audio streaming, candidate portal real-time (D09 scope), real-time analytics dashboards (D17).

## 2. User Stories

| ID | Role | Story | Acceptance Criteria |
|----|------|-------|---------------------|
| US-01 | Recruiter | See candidate card move in real time on kanban board | Given another recruiter moves a candidate, when I'm viewing the same job board, then the card animates to the new column without refresh |
| US-02 | Recruiter | See live notification count update | Given a new event occurs, when I'm on any page, then the notification bell badge increments without refresh |
| US-03 | Hiring Manager | See when other team members are viewing the same candidate | Given I open a candidate profile, when another user is viewing it, then I see their avatar in a presence indicator |
| US-04 | Interviewer | See scorecard submission status update live | Given I'm on the interview detail page, when another interviewer submits their scorecard, then the status updates without refresh |
| US-05 | Recruiter | See new applications appear in real time | Given I'm viewing the application list, when a new application is submitted, then it appears at the top of the list |
| US-06 | Admin | See team member online status | Given I'm on the team page, when team members come online/offline, then their status indicators update live |

## 3. Supabase Realtime Primitives

| Primitive | Use Case | Delivery | Persistence |
|-----------|----------|----------|-------------|
| **Postgres Changes** | Database mutations → live UI updates | Server-push on INSERT/UPDATE/DELETE | Backed by WAL — reliable |
| **Broadcast** | Ephemeral notifications, typing indicators | Client-to-client or server-to-client | None — fire-and-forget |
| **Presence** | Online status, "who's viewing this" | Sync state across clients | In-memory — lost on disconnect |

## 4. Channel Architecture (G-027 Resolution)

### 4.1 Channel Naming Convention

All channels follow a strict naming pattern for tenant isolation and scoping:

```
{scope}:{organization_id}:{resource}[:{resource_id}]
```

| Channel Pattern | Primitive | Purpose |
|----------------|-----------|---------|
| `org:{org_id}:notifications:{user_id}` | Broadcast | Per-user in-app notifications (D08) |
| `org:{org_id}:applications` | Postgres Changes | Application list updates (new, stage change) |
| `org:{org_id}:job:{job_id}:board` | Postgres Changes | Kanban board live updates for a specific job |
| `org:{org_id}:candidate:{candidate_id}` | Postgres Changes | Candidate profile live updates |
| `org:{org_id}:interview:{interview_id}` | Postgres Changes | Interview detail updates (scorecard submissions) |
| `org:{org_id}:presence:page:{page_path}` | Presence | Who's viewing this page |
| `org:{org_id}:presence:candidate:{candidate_id}` | Presence | Who's viewing this candidate |

### 4.2 Tenant Isolation

**Every channel includes `organization_id`.** This is enforced at two levels:

1. **Server-side (RLS):** Postgres Changes channels use Supabase's built-in RLS enforcement. Only rows the user can see via RLS policies trigger change events. No additional filtering needed — D01's `is_org_member()` + `deleted_at IS NULL` policies handle it.

2. **Client-side (subscription):** The `organization_id` in the channel name is derived server-side from the JWT claims (`org_id`), never from client input. The Supabase client library is initialized with the user's JWT, and Realtime automatically scopes based on auth.

```typescript
// Client subscription pattern — org_id from session, never user input
const channel = supabase.channel(`org:${session.org_id}:applications`);
```

### 4.3 Authorization

Supabase Realtime respects RLS policies automatically for Postgres Changes. For Broadcast and Presence channels, authorization is handled by:

- **Channel name validation:** Server-side middleware validates that the `org_id` in the channel name matches the user's JWT `org_id` claim. Mismatched subscriptions are rejected.
- **Broadcast send authorization:** Only server-side code (Inngest functions, Server Actions) sends broadcast messages. Client-side broadcast send is disabled via Realtime channel config.

## 5. Table Subscriptions (Postgres Changes)

### 5.1 Subscribed Tables

Not all 39 tables need real-time subscriptions. Only tables where UI needs live updates:

| Table | Events | Filter | UI Consumer |
|-------|--------|--------|-------------|
| `applications` | INSERT, UPDATE | `organization_id = org_id` | Application list, kanban board |
| `application_stage_history` | INSERT | `organization_id = org_id` | Kanban board (card movement animation) |
| `interviews` | INSERT, UPDATE | `organization_id = org_id` | Interview list, interview detail |
| `scorecard_submissions` | INSERT | `organization_id = org_id` | Interview detail (scorecard status) |
| `offers` | UPDATE | `organization_id = org_id` | Offer list (status changes) |
| `notes` | INSERT | `organization_id = org_id` | Activity feed on candidate profile |
| `candidates` | INSERT, UPDATE | `organization_id = org_id` | Candidate list |

### 5.2 Tables NOT Subscribed

| Table | Reason |
|-------|--------|
| `audit_logs` | High volume, append-only. Not consumer-facing. |
| `ai_usage_logs` | Background, no live UI need. |
| `scorecard_ratings` | Parent `scorecard_submissions` INSERT is sufficient signal. |
| `scorecard_categories/attributes` | Template changes are infrequent admin actions — page refresh acceptable. |
| `offer_templates`, `pipeline_templates` | Settings changes — low frequency, no live UI need. |
| `files` | Upload completion signaled by application/candidate UPDATE. |
| `custom_field_*` | Low frequency settings changes. |
| `webhook_endpoints`, `api_keys` | Admin settings only. |
| `notification_preferences` | Per-user settings — no broadcast need. |
| `talent_pool_*` | Pool membership changes are batch operations, not live-critical. |
| `skills`, `candidate_skills`, `job_required_skills` | Skill changes reflected via candidate/job UPDATE. |

### 5.3 Subscription Setup

```typescript
// Example: kanban board subscription for a specific job
function useKanbanRealtime(jobId: string, orgId: string) {
  useEffect(() => {
    const channel = supabase
      .channel(`org:${orgId}:job:${jobId}:board`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'application_stage_history',
          filter: `organization_id=eq.${orgId}` },
        (payload) => {
          // Animate card from old stage to new stage
          handleStageChange(payload.new);
        }
      )
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'applications',
          filter: `organization_id=eq.${orgId}` },
        (payload) => {
          // Add new application card to first stage
          handleNewApplication(payload.new);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [jobId, orgId]);
}
```

## 6. Broadcast Channels

### 6.1 Notification Broadcast

Per D08, in-app notifications are delivered via broadcast (not Postgres Changes) because there's no `notifications` table.

```typescript
// Server-side: send notification to user's channel (from Inngest function)
await supabaseAdmin.channel(`org:${orgId}:notifications:${userId}`)
  .send({
    type: 'broadcast',
    event: 'notification',
    payload: {
      event_type: 'scorecard.submitted',
      title: 'New scorecard submitted',
      body: 'Jane Doe submitted a scorecard for John Smith',
      action_url: '/interviews/abc-123',
      created_at: new Date().toISOString(),
    },
  });
```

```typescript
// Client-side: subscribe to personal notification channel
function useNotifications(orgId: string, userId: string) {
  useEffect(() => {
    const channel = supabase
      .channel(`org:${orgId}:notifications:${userId}`)
      .on('broadcast', { event: 'notification' }, (payload) => {
        // Show toast notification
        showToast(payload.payload);
        // Increment unread badge
        incrementUnreadCount();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [orgId, userId]);
}
```

### 6.2 Typing Indicators (Future)

Reserved channel pattern for future implementation:
- `org:{org_id}:typing:note:{resource_id}` — shows "X is typing..." when composing a note on a candidate

Not implemented in MVP. Channel pattern reserved.

## 7. Presence

### 7.1 Page-Level Presence

Track which users are viewing a specific candidate profile, enabling "Jane is also viewing this candidate" indicators.

```typescript
function useCandidatePresence(orgId: string, candidateId: string, currentUser: User) {
  const [viewers, setViewers] = useState<PresenceUser[]>([]);

  useEffect(() => {
    const channel = supabase
      .channel(`org:${orgId}:presence:candidate:${candidateId}`)
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresenceUser>();
        setViewers(Object.values(state).flat().filter(u => u.id !== currentUser.id));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            id: currentUser.id,
            name: currentUser.name,
            avatar_url: currentUser.avatar_url,
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => { supabase.removeChannel(channel); };
  }, [orgId, candidateId]);

  return viewers;
}
```

### 7.2 Team Online Status

Global presence channel for the organization. Shows online/offline status on team pages and in @mention autocomplete.

- Channel: `org:{org_id}:presence:team`
- Track on app load, untrack on window close/logout
- Presence state includes: `{ id, name, avatar_url, role, last_active_page }`

### 7.3 Presence Limits

- Maximum 100 concurrent users per presence channel (Supabase limit)
- For organizations with 100+ active users, fall back to polling `/api/v1/team/online` every 30 seconds
- Candidate-level presence limited to 10 viewers displayed (UI constraint, not technical)

## 8. Optimistic UI

### 8.1 Pattern

For all mutations that have real-time subscriptions, apply changes optimistically before server confirmation:

```typescript
// Optimistic stage move on kanban board
async function moveCandidate(applicationId: string, newStageId: string) {
  // 1. Optimistic: update local state immediately
  updateBoardState(applicationId, newStageId);

  try {
    // 2. Server: call Server Action
    await moveApplicationStage({ applicationId, stageId: newStageId });
    // 3. Real-time event arrives — ignored because state already matches
  } catch (error) {
    // 4. Rollback: revert to previous state
    rollbackBoardState(applicationId);
    showErrorToast('Failed to move candidate');
  }
}
```

### 8.2 Deduplication

When an optimistic update is followed by a Realtime event for the same mutation:

1. **Match by ID:** Compare `payload.new.id` with the optimistically updated record
2. **Skip if matching:** If the Realtime payload matches the optimistic state, no re-render
3. **Apply if different:** If another user's change arrives, apply it (may override optimistic state — last-write-wins)

This is handled by a `useRealtimeSync` hook that maintains a `pendingOptimistic` set of record IDs.

### 8.3 Conflict Resolution

**Last-write-wins** for all entities. No operational transforms or CRDTs. Conflicts are rare in ATS workflows (users typically work on different candidates). When conflicts occur:

- Supabase Realtime delivers the final server state
- UI re-renders to match server state
- A subtle toast: "This record was updated by [user]. Your view has been refreshed."

## 9. Connection Management

### 9.1 Connection Lifecycle

```
Page Load → Authenticate → Subscribe to channels → Handle events
     │                                                    │
     └──→ Token refresh (Supabase auto) ──→ Re-subscribe ─┘
     │                                                    │
     └──→ Network loss → Reconnect with backoff ──────────┘
     │
     └──→ Page unload → Unsubscribe all → Close connection
```

### 9.2 Reconnection Strategy

Supabase Realtime handles reconnection automatically with exponential backoff. Additional ATS-level handling:

- **On reconnect:** Re-fetch current state from API to catch events missed during disconnection. Don't rely on Realtime delivering missed events — it's best-effort.
- **Stale state indicator:** If disconnected for > 10 seconds, show a subtle banner: "Reconnecting... Data may be stale." Auto-dismiss on reconnect.
- **Max channels per client:** Limit to 10 concurrent Realtime channels per browser tab. Unsubscribe from channels when navigating away from their pages.

### 9.3 Channel Cleanup

```typescript
// Global channel manager — ensures cleanup on route change
class ChannelManager {
  private channels: Map<string, RealtimeChannel> = new Map();

  subscribe(name: string, config: ChannelConfig): RealtimeChannel {
    // Unsubscribe existing if same name
    this.unsubscribe(name);
    const channel = supabase.channel(name);
    // Apply config...
    channel.subscribe();
    this.channels.set(name, channel);
    return channel;
  }

  unsubscribe(name: string): void {
    const channel = this.channels.get(name);
    if (channel) {
      supabase.removeChannel(channel);
      this.channels.delete(name);
    }
  }

  unsubscribeAll(): void {
    this.channels.forEach((ch) => supabase.removeChannel(ch));
    this.channels.clear();
  }
}
```

## 10. API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/team/online` | JWT | Polling fallback for online status (100+ user orgs) |
| GET | `/api/v1/realtime/health` | JWT (admin) | Connection stats, channel counts, subscription health |

Realtime channels are established client-side via Supabase JS client — no custom API endpoints needed for subscriptions. The two endpoints above are supplementary.

## 11. UI Components

| Component | Location | Description |
|-----------|----------|-------------|
| `RealtimeProvider` | App root layout | Initializes Supabase Realtime, manages global channels (notifications, team presence) |
| `NotificationBell` | Global header | Subscribes to personal notification broadcast channel (D08) |
| `PresenceAvatars` | Candidate profile header | Shows avatars of other users viewing the same candidate |
| `OnlineIndicator` | Team list, @mention dropdown | Green/gray dot for online/offline status |
| `StaleDataBanner` | Any page with Realtime | Shows "Reconnecting..." banner when disconnected > 10s |
| `KanbanRealtimeSync` | Job board | Handles optimistic moves + incoming Realtime stage changes |

## 12. Edge Cases

### 12.1 User in Multiple Tabs

Each tab maintains its own Supabase Realtime connection. Channels deduplicate server-side — same user subscribing twice to the same channel is fine. Presence tracks per-connection, so a user may appear "online" in presence twice. UI deduplicates by `user_id`.

### 12.2 Organization Switch

On org switch (ADR-005 `last_active_org_id` update + JWT refresh):
1. `ChannelManager.unsubscribeAll()` — tear down all channels for old org
2. JWT refreshes with new `org_id` claim
3. Re-subscribe to channels for new org

### 12.3 Soft-Deleted Records

Postgres Changes fires on UPDATE even when `deleted_at` is set. Client-side filter: if `payload.new.deleted_at !== null`, remove the item from the UI list.

### 12.4 High-Volume Events

During bulk operations (e.g., moving 50 candidates):
- Postgres Changes fires 50 events
- Client-side batches UI updates using `requestAnimationFrame` — accumulate changes for 100ms, then apply all at once
- Prevents 50 sequential re-renders

### 12.5 Realtime Unavailable

If Supabase Realtime is down:
- App continues to function normally — just without live updates
- Users see stale data until they manually refresh
- No error state — graceful degradation. The `StaleDataBanner` only shows during active disconnection, not when Realtime never connected.

## 13. Security Considerations

- **Channel names are server-derived:** `org_id` comes from JWT claims, not user input. Cross-tenant subscription is impossible.
- **RLS on Postgres Changes:** Supabase enforces RLS on all change events. A user only receives events for rows they can SELECT.
- **Broadcast authorization:** Only server-side code can send to broadcast channels. Client `send` is disabled in channel config.
- **Presence data:** Only non-sensitive data in presence payload (name, avatar, role). No email, no permissions.
- **Connection limits:** Supabase plan-level connection limits prevent abuse. ATS enforces 10 channels per client as additional guard.
