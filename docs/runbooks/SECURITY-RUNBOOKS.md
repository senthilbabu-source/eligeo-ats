# Security Runbooks

> **ID:** D18
> **Status:** Review
> **Priority:** P2
> **Last updated:** 2026-03-10
> **Depends on:** D14 (Observability — alerting, health endpoints), D15 (CI/CD — rollback procedures)
> **Depended on by:** — (terminal document)
> **Last validated against deps:** 2026-03-10

---

## 1. Overview

Security Runbooks defines the operational procedures for disaster recovery, database restoration, security incident response, and secret rotation. Each runbook is a step-by-step guide with severity classification, escalation paths, and resolution verification.

## 2. Runbook Index

| # | Runbook | Trigger | Severity | RTO |
|---|---------|---------|----------|-----|
| R-01 | Service Outage | Health endpoint down | P1 | 15 min |
| R-02 | Database Restoration | Data corruption / accidental deletion | P1 | 30 min |
| R-03 | Security Incident | Unauthorized access / data breach | P1 | Immediate |
| R-04 | Secret Rotation | Compromised credentials | P1-P2 | 1 hour |
| R-05 | Deployment Rollback | Bad deploy causing errors | P2 | 5 min |
| R-06 | Third-Party Service Failure | Stripe/Nylas/Resend/Typesense down | P3 | N/A (degrade) |

## 3. R-01: Service Outage

### Trigger
BetterUptime alert: `/api/health` returning non-200 for > 2 minutes.

### Steps

1. **Identify scope** (2 min)
   ```bash
   # Check Vercel deployment status
   vercel ls --prod

   # Check Supabase status
   curl -s https://<project>.supabase.co/rest/v1/ -H "apikey: <anon_key>"

   # Check health endpoints
   curl -s https://eligeo.io/api/health
   curl -s https://eligeo.io/api/health/ready
   ```

2. **If application down (Vercel):**
   - Check Vercel dashboard for deployment errors
   - Rollback: `vercel rollback --target production` (R-05)
   - If Vercel platform issue: check [status.vercel.com](https://status.vercel.com)

3. **If database down (Supabase):**
   - Check Supabase dashboard → Database → Health
   - Check connection pool saturation
   - If Supabase platform issue: check [status.supabase.com](https://status.supabase.com)
   - If connection exhaustion: restart PgBouncer via Supabase dashboard

4. **If Redis down (Upstash):**
   - Rate limiting fails open (allows all requests)
   - Caching returns misses (direct DB queries)
   - No immediate action needed — service degrades gracefully
   - Check [status.upstash.com](https://status.upstash.com)

### Resolution Verification
- `/api/health` returns 200
- `/api/health/ready` returns 200 with all components `healthy`
- Sentry error rate returns to baseline

---

## 4. R-02: Database Restoration

### Trigger
Data corruption detected, accidental bulk deletion, or bad migration.

### Steps

1. **Assess damage scope** (5 min)
   ```sql
   -- Check affected rows
   SELECT COUNT(*) FROM <table> WHERE <condition>;

   -- Check audit logs for the destructive action
   SELECT * FROM audit_logs
   WHERE table_name = '<table>'
     AND action = 'DELETE'
     AND performed_at > NOW() - INTERVAL '1 hour'
   ORDER BY performed_at DESC;
   ```

2. **If single record/table (soft-deleted):**
   ```sql
   -- Restore soft-deleted records
   UPDATE <table> SET deleted_at = NULL WHERE id IN (...);
   ```

3. **If data corruption (bad migration):**
   - Deploy reverse migration (D15 §4.4)
   - Verify data integrity

4. **If beyond repair (PITR needed):**
   - Go to Supabase Dashboard → Database → Backups
   - Select Point-in-Time Recovery
   - Choose timestamp just before the incident
   - **WARNING:** PITR restores the entire database — coordinate with team
   - After restore: redeploy application to match restored schema

### Resolution Verification
- Affected records restored and accessible
- Application functioning normally
- Audit log entry created for the restoration action

---

## 5. R-03: Security Incident

### Trigger
- Sentry alert for unusual access pattern
- Customer report of unauthorized access
- Dependabot critical vulnerability alert
- Supabase auth anomaly

### Steps

1. **Contain** (immediate)
   - If credential compromise: rotate affected secrets immediately (R-04)
   - If active unauthorized access: disable affected user account
   - If API key leaked: revoke key in Supabase/provider dashboard

2. **Assess** (15 min)
   ```sql
   -- Check audit logs for the compromised user/key
   SELECT table_name, action, record_id, performed_at
   FROM audit_logs
   WHERE performed_by = '<user_id>'
     AND performed_at > '<incident_start>'
   ORDER BY performed_at;

   -- Check for data exfiltration
   SELECT * FROM audit_logs
   WHERE action = 'SELECT'  -- Note: audit trigger only captures mutations
     AND performed_at > '<incident_start>';
   ```

3. **Notify** (1 hour)
   - Internal: Engineering team + management
   - If PII affected: Legal team for GDPR/CCPA breach notification assessment
   - If customer data: Affected organizations within 72 hours (GDPR Article 33)

4. **Remediate**
   - Patch vulnerability if applicable
   - Rotate all potentially compromised secrets
   - Review and tighten RLS policies if bypass occurred
   - Deploy fix

5. **Post-mortem** (within 48 hours)
   - Timeline of events
   - Root cause analysis
   - Action items to prevent recurrence
   - Update runbooks if needed

### Resolution Verification
- All compromised credentials rotated
- Vulnerability patched and deployed
- Affected parties notified per regulatory requirements
- Post-mortem documented

---

## 6. R-04: Secret Rotation

### Trigger
Credential compromise, scheduled rotation, or employee departure.

### Rotation Procedures

| Secret | Steps |
|--------|-------|
| **Supabase Service Role Key** | 1. Generate new key in Supabase dashboard 2. Update Vercel env var 3. Redeploy 4. Verify API calls succeed |
| **Candidate Token Secret** | 1. Generate new secret 2. Update Vercel env var 3. Redeploy 4. Existing tokens become invalid (candidates get new links on next email) |
| **Stripe Keys** | 1. Roll key in Stripe dashboard 2. Update Vercel env var + webhook secret 3. Redeploy 4. Verify webhook delivery |
| **Inngest Keys** | 1. Regenerate in Inngest dashboard 2. Update Vercel env var 3. Redeploy 4. Verify function execution |
| **OpenAI API Key** | 1. Regenerate in OpenAI dashboard 2. Update Vercel env var 3. Redeploy 4. Verify embedding generation |
| **Resend API Key** | 1. Regenerate in Resend dashboard 2. Update Vercel env var 3. Redeploy 4. Verify email delivery |
| **Nylas API Key** | 1. Regenerate in Nylas dashboard 2. Update Vercel env var 3. Redeploy 4. Verify calendar sync |

### General Process

```bash
# 1. Generate new secret value
openssl rand -base64 32

# 2. Update in Vercel (production)
vercel env add SECRET_NAME production

# 3. Redeploy to pick up new env var
vercel deploy --prod

# 4. Verify health
curl -f https://eligeo.io/api/health/ready
```

---

## 7. R-05: Deployment Rollback

### Trigger
Error rate spike, broken functionality, or performance degradation after deployment.

### Steps

1. **Verify issue is deploy-related** (2 min)
   - Check Sentry for new error types matching deploy timestamp
   - Compare error rate before/after deploy in Vercel Analytics

2. **Application rollback** (< 1 min)
   ```bash
   vercel rollback --target production
   ```
   Or via Vercel Dashboard: Deployments → previous deployment → "Promote to Production"

3. **If migration was applied:**
   - Check if the migration is backward-compatible
   - If yes: rollback is safe, old code works with new schema
   - If no: deploy reverse migration immediately

4. **Post-rollback**
   - Investigate root cause
   - Fix in feature branch
   - Re-run CI checks
   - Redeploy when fixed

---

## 8. R-06: Third-Party Service Failure

### Degradation Matrix

| Service | Impact if Down | Degradation Strategy |
|---------|---------------|---------------------|
| **Stripe** | No billing changes, no new subscriptions | Existing features work. Queue billing events for retry. |
| **Nylas** | No calendar sync, no self-scheduling | Manual interview scheduling. Calendar events queued. |
| **Resend** | No transactional emails | In-app notifications still work (Realtime). Emails queued for retry via Inngest. |
| **Typesense** | No full-text search | Fallback to PostgreSQL ILIKE queries (D10 §fallback, D09 §8.4). |
| **OpenAI** | No AI matching, no resume parsing | Manual candidate review. Embeddings generated when service recovers. |
| **Upstash Redis** | No rate limiting, no caching | Fails open. Direct DB queries. Slightly higher latency. |

### Response
- No immediate action needed for graceful degradation
- Monitor provider status page
- Notify affected users if downtime exceeds 1 hour
- Inngest retries handle most recovery automatically

---

## 9. Escalation Path

| Level | Contact | When |
|-------|---------|------|
| L1 — On-call engineer | Slack `#alerts` | All P1-P3 alerts |
| L2 — Engineering lead | Phone/Slack | P1 not resolved in 15 min |
| L3 — CTO | Phone | P1 not resolved in 30 min, data breach |
| L4 — Legal | Email + phone | Data breach affecting PII |

## 10. Post-Incident Review Template

```markdown
## Incident Report: [Title]

**Date:** YYYY-MM-DD
**Duration:** X hours Y minutes
**Severity:** P1/P2/P3
**Impact:** [Description of user impact]

### Timeline
- HH:MM — Alert triggered
- HH:MM — Engineer acknowledged
- HH:MM — Root cause identified
- HH:MM — Fix deployed
- HH:MM — Monitoring confirmed resolution

### Root Cause
[Technical description]

### Action Items
- [ ] [Preventive measure 1]
- [ ] [Preventive measure 2]

### Lessons Learned
[What we'd do differently]
```
