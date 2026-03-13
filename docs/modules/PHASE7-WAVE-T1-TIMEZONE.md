# Phase 7 Wave T1 — Timezone Support

> **ID:** Wave T1
> **Status:** Complete (2026-03-13)
> **Priority:** P1
> **Created:** 2026-03-13
> **Depends on:** D01 (schema), D07 (interviews), D08 (notifications), D05 (design system)
> **ADR:** None required (no new tables, no architectural change — plumbing layer)

---

## 1. Problem Statement

Eligeo is a global ATS. Interview panels and candidates may be in different countries and timezones. Currently:

- All timestamps are stored as `TIMESTAMPTZ` (UTC) — **correct**.
- `organizations.timezone` and `user_profiles.timezone` columns exist (IANA strings, default `'UTC'`) — **correct but unused**.
- All 26+ UI display locations use `toLocaleDateString("en-US")` or `toLocaleString(undefined, ...)` — **browser-local, no org/user timezone awareness**.
- Email templates receive raw ISO strings — **no timezone formatting**.
- Interview scheduling uses `<input type="datetime-local">` — **no timezone indicator or cross-timezone awareness**.

### Real-world failure scenario

Recruiter in NYC schedules interview for "2:00 PM". Interviewer in Bangalore sees "2:00 PM" rendered in their browser's local time (IST). Neither knows the other's timezone. Candidate in London gets an email with a raw ISO string. Everyone shows up at different times.

---

## 2. Solution

### Library: `@date-fns/tz` (date-fns v4 timezone module)

| Criteria | Assessment |
|----------|------------|
| Bundle size | ~5 KB (delegates to `Intl.DateTimeFormat`) |
| DST handling | Correct — uses OS timezone database via browser API |
| Tree-shakeable | Yes |
| Compatibility | date-fns v4 (already installed) |
| Maintenance | Active, official date-fns ecosystem |

### Architecture pattern

```
Storage:      TIMESTAMPTZ (UTC) — no change
Scheduling:   Capture user's IANA timezone → display timezone label → store UTC
Display:      Read user_profiles.timezone (fallback: org timezone, fallback: UTC)
                → convert UTC → render in user's local timezone
Emails:       Dual timezone: recipient's timezone + UTC in parentheses
              e.g., "Tuesday, March 18 at 10:00 AM IST (4:30 AM UTC)"
```

---

## 3. Scope

### 3.1 Install dependency

```bash
npm install @date-fns/tz
```

### 3.2 Core utility — `src/lib/datetime.ts`

Pure functions, no side effects, fully unit-testable:

```typescript
// Format a UTC date in a specific IANA timezone
formatInTz(date: Date | string, tz: string, style: "short" | "long" | "datetime" | "time"): string

// Format for email: dual timezone display
formatForEmail(date: Date | string, recipientTz: string): string
// → "Tue, Mar 18, 2026 at 10:00 AM IST (4:30 AM UTC)"

// Convert a local datetime-local input value to UTC Date
localInputToUtc(localDateTimeString: string, sourceTz: string): Date

// Get user's effective timezone (user pref > org default > 'UTC')
resolveTimezone(userTz: string | null, orgTz: string | null): string
```

### 3.3 Timezone context — server → client

Create a `TimezoneProvider` or pass timezone as a prop from server components:

- Server component reads `user_profiles.timezone` + `organizations.timezone`
- Passes resolved timezone to client components
- Client components use `formatInTz()` instead of raw `toLocaleString()`

### 3.4 UI retrofit — 13 display files

Replace all `toLocaleDateString()` / `toLocaleString()` calls with `formatInTz()`:

| File | Current | After |
|------|---------|-------|
| `candidates/[id]/interview-card.tsx` | `toLocaleString(undefined, ...)` | `formatInTz(date, userTz, "datetime")` |
| `interviews/page.tsx` | `toLocaleString(undefined, ...)` | `formatInTz(date, userTz, "datetime")` |
| `offers/[id]/page.tsx` | `toLocaleDateString("en-US", ...)` | `formatInTz(date, userTz, "short")` |
| `approvals/page.tsx` | `toLocaleDateString("en-US", ...)` | `formatInTz(date, userTz, "short")` |
| `candidates/[id]/candidate-notes.tsx` | `toLocaleDateString("en-US", ...)` | `formatInTz(date, userTz, "datetime")` |
| `dashboard/daily-briefing-card.tsx` | `toLocaleTimeString([], ...)` | `formatInTz(date, userTz, "time")` |
| `careers/[slug]/status/page.tsx` | `toLocaleDateString("en-US", ...)` | `formatInTz(date, orgTz, "long")` |
| `billing/plan-card.tsx` | `toLocaleDateString("en-US", ...)` | `formatInTz(date, userTz, "short")` |
| `billing/trial-banner.tsx` | `new Date(trialEndsAt)` comparison | No display change (server-side UTC comparison is correct) |
| `schedule-interview-modal.tsx` | `<input type="datetime-local">` | Add timezone label + convert to UTC on submit |

### 3.5 Interview scheduling — timezone indicator

- Display user's timezone next to the datetime-local input: "Scheduling in **America/New_York** (EDT)"
- On form submit, convert local input to UTC using `localInputToUtc()`
- On interview cards, show timezone abbreviation: "Mar 18, 2:00 PM EDT"

### 3.6 Email template dates

- In Inngest notification functions, pre-format `interview.date` and `interview.time` using `formatForEmail(scheduledAt, recipientTz)` before passing to `renderTemplate()`
- Result: "Tue, Mar 18, 2026 at 10:00 AM IST (4:30 AM UTC)" in every interview email

### 3.7 User profile settings — timezone selector

- Add IANA timezone dropdown to user profile/settings page
- Pre-populate from `Intl.DateTimeFormat().resolvedOptions().timeZone` (browser detection)
- Store to `user_profiles.timezone`

### 3.8 Org settings — default timezone

- Add timezone selector to org settings page
- Used as fallback when user hasn't set their own timezone

---

## 4. What's NOT in scope

- **No migration.** Timezone columns already exist.
- **No Intl polyfill.** All target browsers support `Intl.DateTimeFormat` with timezone.
- **No i18n locale changes.** Locale formatting (D21) is a separate concern. T1 is timezone only.
- **No calendar integration changes.** Nylas sync (v2.0) will use the same UTC storage pattern.

---

## 5. Test Plan

### Unit tests (~12)

| Test | Category |
|------|----------|
| `formatInTz` — UTC to America/New_York (EST) | Core |
| `formatInTz` — UTC to Asia/Kolkata (IST, +5:30 offset) | Core |
| `formatInTz` — DST transition (spring forward) | Edge case |
| `formatInTz` — DST transition (fall back) | Edge case |
| `formatForEmail` — dual timezone output | Core |
| `formatForEmail` — UTC recipient (no duplicate) | Edge case |
| `localInputToUtc` — EST local to UTC | Core |
| `localInputToUtc` — IST local to UTC | Core |
| `localInputToUtc` — during DST gap (spring forward, 2:30 AM doesn't exist) | Edge case |
| `resolveTimezone` — user pref wins over org | Priority |
| `resolveTimezone` — org fallback when user is null | Priority |
| `resolveTimezone` — UTC fallback when both null | Priority |

### Integration (manual verification)

- Schedule interview in one timezone, view in another
- Email preview shows dual timezone format
- Career portal shows org timezone (not logged-in user's)

---

## 6. Files to create/modify

### New files (2)
- `src/lib/datetime.ts` — core utility
- `src/__tests__/datetime.test.ts` — unit tests

### Modified files (~15)
- `package.json` — add `@date-fns/tz`
- `src/app/(app)/candidates/[id]/interview-card.tsx`
- `src/app/(app)/candidates/[id]/schedule-interview-modal.tsx`
- `src/app/(app)/candidates/[id]/candidate-notes.tsx`
- `src/app/(app)/interviews/page.tsx`
- `src/app/(app)/offers/[id]/page.tsx`
- `src/app/(app)/approvals/page.tsx`
- `src/app/(app)/dashboard/daily-briefing-card.tsx`
- `src/app/(public)/careers/[slug]/status/page.tsx`
- `src/components/billing/plan-card.tsx`
- `src/inngest/functions/notifications/interview-reminder.ts` (or equivalent)
- `src/lib/notifications/render-template.ts` (if interview dates need pre-formatting)
- User profile settings page (timezone selector)
- Org settings page (default timezone selector)

---

## 7. ADR-011 Compliance

No new AI feature in this wave — T1 is infrastructure. ADR-011 is not triggered. The command bar already handles interview scheduling via intents; timezone awareness will flow through the same code paths.

---

## 8. Estimated effort

- Core utility + tests: ~30 min
- UI retrofit (13 files): ~45 min
- Settings UI (timezone selector): ~20 min
- Email formatting: ~15 min
- Verification: ~10 min
- **Total: ~2 hours (half session)**
