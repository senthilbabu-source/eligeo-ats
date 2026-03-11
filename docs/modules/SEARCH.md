# Search Architecture

> **ID:** D10
> **Status:** Review
> **Priority:** P1
> **Last updated:** 2026-03-10
> **Depends on:** D01 (schema — `candidates`, `job_openings`, `applications`, `skills`, `candidate_skills`, `job_required_skills`, `ai_usage_logs`), D02 (API patterns), D03 (billing — AI credit gating, `ai_matching` feature flag)
> **Depended on by:** D09 (Candidate Portal — job search), D16 (Performance — search caching), D17 (Analytics — search metrics)
> **Last validated against deps:** 2026-03-10
> **Architecture decisions assumed:** ADR-001 (Supabase client), ADR-003 (HNSW vector indexes), ADR-006 (soft delete), ADR-008 (enums)

---

## 1. Overview

Search Architecture covers three search paradigms: full-text search (Typesense), semantic/AI matching (pgvector), and structured filtering (PostgreSQL). These compose together to power candidate discovery, job search, and AI-driven matching. The system syncs PostgreSQL data to Typesense for fast faceted search while keeping pgvector in-database for cosine similarity matching.

**Scope:**
- In scope: Typesense collection schemas, Postgres→Typesense sync pipeline, faceted search, pgvector semantic matching, AI credit weighting, embedding lifecycle (create/update/invalidate), search API, skill-based matching.
- Out of scope: Search analytics dashboards (D17), search result caching (D16), candidate portal job search UI (D09).

## 2. User Stories

| ID | Role | Story | Acceptance Criteria |
|----|------|-------|---------------------|
| US-01 | Recruiter | Search candidates by name, skills, or keywords | Given I type in the search bar, when results appear, then candidates are ranked by relevance with highlighted matches |
| US-02 | Recruiter | Filter candidates by facets (location, skills, stage, source) | Given search results, when I apply facet filters, then results narrow instantly with updated facet counts |
| US-03 | Recruiter | Find AI-matched candidates for a job opening | Given a job with an embedding, when I click "Find Matches", then top candidates are ranked by cosine similarity score |
| US-04 | Candidate | Search open jobs on career page | Given the public career page, when I search by keyword/location, then matching open jobs appear with facet filters |
| US-05 | Recruiter | See skill-match score between candidate and job | Given a candidate profile and a job, when I view the match, then a skill overlap score is displayed |
| US-06 | Admin | Manage search index health | Given the admin dashboard, when I view search health, then I see sync lag, document counts, and index status |

## 3. Architecture

### 3.1 Two-Engine Design

```
┌─────────────────┐      ┌──────────────────┐
│   PostgreSQL     │      │    Typesense      │
│  (source of      │─sync─│  (search engine)  │
│   truth)         │      │                   │
│                  │      │  • Full-text       │
│  • pgvector      │      │  • Faceted search  │
│  • HNSW index    │      │  • Typo tolerance  │
│  • Cosine sim.   │      │  • Geo search      │
│  • Skill match   │      │  • Instant results  │
└─────────────────┘      └──────────────────┘
         │                         │
         ▼                         ▼
   AI Matching              Text Search
  (Pro+ plans)            (All plans)
```

**Why two engines:**
- **Typesense** excels at full-text search with typo tolerance, faceted filtering, and sub-10ms query latency. PostgreSQL `pg_trgm` can't match this at scale.
- **pgvector** keeps embeddings in the same database as the data, enabling RLS-scoped AI queries without exporting PII to external vector DBs.

### 3.2 Data Flow

```
INSERT/UPDATE on candidates/jobs
        │
        ▼
  audit_trigger_func()  ──→  audit_logs (D01)
        │
        ▼
  Database webhook (pg_net)
        │
        ▼
  Inngest: search/sync-document
        │
        ├──→ Typesense: upsert document
        └──→ (if content changed) Inngest: search/generate-embedding
                    │
                    ▼
              OpenAI Embedding API [VERIFY]
                    │
                    ▼
              UPDATE candidate/job embedding column
```

## 4. Typesense Collections

### 4.1 Candidates Collection

```typescript
const candidatesCollection: CollectionSchema = {
  name: 'candidates',
  fields: [
    { name: 'id', type: 'string' },
    { name: 'organization_id', type: 'string', facet: false },
    { name: 'full_name', type: 'string', sort: true },
    { name: 'email', type: 'string' },
    { name: 'current_title', type: 'string', optional: true },
    { name: 'current_company', type: 'string', optional: true },
    { name: 'location', type: 'string', optional: true, facet: true },
    { name: 'skills', type: 'string[]', facet: true },
    { name: 'source_name', type: 'string', optional: true, facet: true },
    { name: 'stage', type: 'string', optional: true, facet: true },  // current pipeline stage
    { name: 'status', type: 'string', facet: true },  // active/archived
    { name: 'created_at', type: 'int64', sort: true },
    { name: 'updated_at', type: 'int64', sort: true },
  ],
  default_sorting_field: 'updated_at',
  token_separators: ['-', '_'],  // Handle hyphenated names/skills
};
```

### 4.2 Jobs Collection

```typescript
const jobsCollection: CollectionSchema = {
  name: 'jobs',
  fields: [
    { name: 'id', type: 'string' },
    { name: 'organization_id', type: 'string', facet: false },
    { name: 'title', type: 'string', sort: true },
    { name: 'department', type: 'string', optional: true, facet: true },
    { name: 'location', type: 'string', optional: true, facet: true },
    { name: 'location_type', type: 'string', facet: true },
    { name: 'employment_type', type: 'string', facet: true },
    { name: 'status', type: 'string', facet: true },
    { name: 'required_skills', type: 'string[]', facet: true },
    { name: 'salary_min', type: 'float', optional: true },
    { name: 'salary_max', type: 'float', optional: true },
    { name: 'published_at', type: 'int64', optional: true, sort: true },
    { name: 'created_at', type: 'int64', sort: true },
  ],
  default_sorting_field: 'created_at',
};
```

### 4.3 Tenant Isolation in Typesense

Every Typesense document includes `organization_id`. All search queries apply `filter_by: organization_id:=${orgId}` server-side — never from the client. This mirrors PostgreSQL RLS at the search layer.

**Public career page exception:** Job search on career pages filters by `organization_id` + `status:=open` without requiring authentication. This is the only unauthenticated Typesense query path.

## 5. Sync Pipeline

### 5.1 Real-Time Sync via Inngest

```typescript
// Inngest function: search/sync-document
export const searchSyncDocument = inngest.createFunction(
  { id: 'search-sync-document', retries: 3 },
  { event: 'search/sync-document' },
  async ({ event, step }) => {
    const { table, record_id, action } = event.data;

    if (action === 'DELETE') {
      await step.run('delete-from-typesense', async () => {
        const collection = table === 'candidates' ? 'candidates' : 'jobs';
        await typesense.collections(collection).documents(record_id).delete();
      });
      return;
    }

    // Fetch full record from Postgres (service role — bypass RLS)
    const record = await step.run('fetch-record', async () => {
      if (table === 'candidates') return fetchCandidateForIndex(record_id);
      if (table === 'job_openings') return fetchJobForIndex(record_id);
    });

    if (!record || record.deleted_at) {
      // Soft-deleted: remove from Typesense
      await step.run('remove-soft-deleted', async () => {
        const collection = table === 'candidates' ? 'candidates' : 'jobs';
        await typesense.collections(collection).documents(record_id).delete()
          .catch(() => {}); // Ignore if not found
      });
      return;
    }

    await step.run('upsert-typesense', async () => {
      const collection = table === 'candidates' ? 'candidates' : 'jobs';
      const document = transformForTypesense(table, record);
      await typesense.collections(collection).documents().upsert(document);
    });
  }
);
```

### 5.2 Sync Triggers

| Source Table | Trigger | Syncs To |
|-------------|---------|----------|
| `candidates` | INSERT, UPDATE, soft-DELETE | `candidates` collection |
| `job_openings` | INSERT, UPDATE, soft-DELETE | `jobs` collection |
| `candidate_skills` | INSERT, DELETE | Re-sync parent `candidates` document (skill array update) |
| `job_required_skills` | INSERT, DELETE | Re-sync parent `jobs` document (required_skills array) |
| `applications` | stage change | Re-sync `candidates` document (current stage facet) |

### 5.3 Full Re-index

For initial setup or disaster recovery. Inngest function paginates through all records:

```typescript
// Inngest function: search/full-reindex
export const searchFullReindex = inngest.createFunction(
  { id: 'search-full-reindex', retries: 0 },
  { event: 'search/full-reindex' },
  async ({ event, step }) => {
    const { collection } = event.data;  // 'candidates' or 'jobs'
    // 1. Drop and recreate collection
    // 2. Paginate through all records (1000 per batch)
    // 3. Batch upsert via Typesense import API
    // 4. Emit search/reindex-complete event
  }
);
```

### 5.4 Sync Health Monitoring

- **Sync lag:** Measured by comparing `audit_logs.performed_at` of latest mutation vs. Typesense document `updated_at`. Alert if lag > 60 seconds.
- **Document count:** Periodically compare `COUNT(*)` in Postgres vs. Typesense collection stats. Alert if drift > 1%.
- **Dead letter:** Failed sync events after 3 retries are logged to `ai_usage_logs` with `action = 'search_sync_failure'` for monitoring.

## 6. AI Matching (pgvector)

### 6.1 Embedding Model

- **Model:** OpenAI `text-embedding-3-small` (1536 dimensions) [VERIFY]
- **Index type:** HNSW per ADR-003: `WITH (m = 16, ef_construction = 64)`
- **Columns:** `candidates.candidate_embedding` and `job_openings.job_embedding` (both `vector(1536)`)

### 6.2 Embedding Generation

Embeddings are generated for:

| Entity | Input Text | Trigger |
|--------|-----------|---------|
| Candidate | `resume_text` + `skills[]` + `current_title` + `current_company` | Resume upload, profile edit, skill change |
| Job | `title` + `description` + required skills names | Job creation, description edit, skill change |

```typescript
// Inngest function: search/generate-embedding
export const searchGenerateEmbedding = inngest.createFunction(
  { id: 'search-generate-embedding', retries: 2 },
  { event: 'search/generate-embedding' },
  async ({ event, step }) => {
    const { entity_type, entity_id, org_id, text } = event.data;

    // 1. Check AI credit availability (D03 pattern)
    const credited = await step.run('check-credit', async () => {
      const action = entity_type === 'candidate' ? 'candidate_match' : 'candidate_match';
      return consumeAiCredit(org_id, action);
    });
    if (!credited) return { skipped: true, reason: 'no_credits' };

    // 2. Generate embedding [VERIFY]
    const embedding = await step.run('generate', async () => {
      const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text.slice(0, 8191),  // Model max tokens
      });
      return response.data[0].embedding;
    });

    // 3. Store embedding
    await step.run('store', async () => {
      const table = entity_type === 'candidate' ? 'candidates' : 'job_openings';
      const column = entity_type === 'candidate' ? 'candidate_embedding' : 'job_embedding';
      await supabaseAdmin.from(table)
        .update({ [column]: embedding })
        .eq('id', entity_id);
    });
  }
);
```

### 6.3 Stale Embedding Handling (G-016 Resolution)

**Decision:** Re-embed on content change. No TTL-based expiry.

Embeddings become stale when the source text changes. Re-embedding is triggered by:

| Change | Triggers Re-embed | Why |
|--------|-------------------|-----|
| `resume_text` updated (new resume upload) | ✅ Yes | Primary content changed |
| `skills[]` modified (add/remove skill) | ✅ Yes | Skills are part of embedding input |
| `current_title` or `current_company` changed | ✅ Yes | Part of embedding input |
| `full_name`, `email`, `phone` changed | ❌ No | Not part of embedding input |
| `location` changed | ❌ No | Location is a structured filter, not semantic |

**Detection:** The sync pipeline (§5.1) compares the embedding-relevant fields before and after the update. If any embedding-input field changed, it emits `search/generate-embedding` in addition to the Typesense sync. This is done in the `fetchCandidateForIndex` function which tracks a hash of embedding-input fields.

**Cost control:** Re-embedding consumes 1 AI credit (D03 metering). If the organization has no credits remaining, the old embedding is kept (stale but functional). A `stale_embedding` flag is not stored — instead, the `updated_at` on the candidate vs. the embedding generation timestamp in `ai_usage_logs` can be compared if needed.

### 6.4 AI Credit Weights (G-017 Resolution)

**Decision:** Differentiated weights per action.

| Action | Credits | Rationale |
|--------|---------|-----------|
| `resume_parse` | 2 | LLM-intensive: structured extraction from unstructured text |
| `candidate_match` | 1 | Embedding generation (single API call) |
| `job_description_generate` | 3 | LLM-intensive: creative generation with multiple sections |
| `email_draft` | 1 | Short-form LLM generation |
| `feedback_summarize` | 1 | Moderate LLM: summarize structured scorecard data |

The `consumeAiCredit(org_id, action)` function now consumes N credits based on action weight:

```typescript
// lib/billing/ai-credits.ts
const CREDIT_WEIGHTS: Record<string, number> = {
  resume_parse: 2,
  candidate_match: 1,
  job_description_generate: 3,
  email_draft: 1,
  feedback_summarize: 1,
};

async function consumeAiCredit(orgId: string, action: string): Promise<boolean> {
  const weight = CREDIT_WEIGHTS[action] ?? 1;
  const { data } = await supabaseAdmin.rpc('consume_ai_credits', {
    p_org_id: orgId,
    p_amount: weight,
  });
  return data !== null;
}
```

```sql
-- Updated atomic credit consumption (replaces D03's single-increment version)
CREATE OR REPLACE FUNCTION consume_ai_credits(p_org_id UUID, p_amount INTEGER DEFAULT 1)
RETURNS INTEGER AS $$
  UPDATE organizations
  SET ai_credits_used = ai_credits_used + p_amount
  WHERE id = p_org_id AND ai_credits_used + p_amount <= ai_credits_limit
  RETURNING ai_credits_used;
$$ LANGUAGE sql;
```

### 6.5 Matching Query

The `match_candidates_for_job()` function (D01 §AI Functions) returns top N candidates by cosine similarity. D10 adds a composite scoring layer:

```typescript
interface MatchResult {
  candidateId: string;
  semanticScore: number;    // 0–1, from pgvector cosine similarity
  skillScore: number;       // 0–1, skill overlap ratio
  compositeScore: number;   // weighted combination
  matchedSkills: string[];  // skills in common
  missingSkills: string[];  // required but not on candidate
}

// Composite score = 0.6 * semanticScore + 0.4 * skillScore
```

**Skill score calculation:**

```sql
-- Skill overlap between candidate and job
SELECT
  COUNT(*) FILTER (WHERE cs.skill_id IS NOT NULL)::FLOAT /
  NULLIF(COUNT(*)::FLOAT, 0) AS skill_score,
  array_agg(s.name) FILTER (WHERE cs.skill_id IS NOT NULL) AS matched_skills,
  array_agg(s.name) FILTER (WHERE cs.skill_id IS NULL) AS missing_skills
FROM job_required_skills jrs
JOIN skills s ON s.id = jrs.skill_id
LEFT JOIN candidate_skills cs ON cs.skill_id = jrs.skill_id
  AND cs.candidate_id = $candidate_id AND cs.deleted_at IS NULL
WHERE jrs.job_id = $job_id AND jrs.deleted_at IS NULL;
```

## 7. Search API

### 7.1 Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/search/candidates` | JWT | Faceted candidate search (Typesense) |
| GET | `/api/v1/search/jobs` | JWT | Faceted job search (Typesense) |
| GET | `/api/v1/search/jobs/public` | None | Public career page job search (org_id required in query) |
| POST | `/api/v1/search/match` | JWT | AI candidate matching for a job (pgvector, Pro+) |
| GET | `/api/v1/search/match/:jobId/:candidateId` | JWT | Individual match score (semantic + skill) |
| GET | `/api/v1/search/health` | JWT (admin) | Sync lag, document counts, index status |

### 7.2 Request/Response Schemas

```typescript
// GET /api/v1/search/candidates
const CandidateSearchSchema = z.object({
  q: z.string().max(200).optional(),  // Free-text query
  filter_skills: z.array(z.string()).optional(),
  filter_location: z.string().optional(),
  filter_source: z.string().optional(),
  filter_stage: z.string().optional(),
  sort_by: z.enum(['relevance', 'updated_at', 'full_name']).default('relevance'),
  page: z.number().int().min(1).default(1),
  per_page: z.number().int().min(1).max(100).default(25),
});

// POST /api/v1/search/match
const AiMatchSchema = z.object({
  job_id: z.string().uuid(),
  similarity_threshold: z.number().min(0).max(1).default(0.6),
  max_results: z.number().int().min(1).max(100).default(50),
});

// Match response
const MatchResultSchema = z.object({
  results: z.array(z.object({
    candidate_id: z.string().uuid(),
    full_name: z.string(),
    semantic_score: z.number(),
    skill_score: z.number(),
    composite_score: z.number(),
    matched_skills: z.array(z.string()),
    missing_skills: z.array(z.string()),
  })),
  credits_remaining: z.number(),
  job_id: z.string().uuid(),
});
```

## 8. Inngest Functions

| Function ID | Trigger | What It Does |
|-------------|---------|-------------|
| `search-sync-document` | `search/sync-document` | Upserts/deletes document in Typesense |
| `search-generate-embedding` | `search/generate-embedding` | Generates OpenAI embedding, stores in pgvector column |
| `search-full-reindex` | `search/full-reindex` | Drops + recreates Typesense collection, bulk imports |
| `search-sync-health-check` | `cron: */5 * * * *` (every 5 min) | Checks sync lag + document count drift, alerts if unhealthy |

## 9. UI Components

| Component | Location | Description |
|-----------|----------|-------------|
| `GlobalSearch` | Header search bar | Typesense instant search with keyboard shortcuts (Cmd+K) |
| `CandidateSearchResults` | Candidates page | Faceted results with skill/location/source/stage filters |
| `JobSearchResults` | Jobs page (internal) | Faceted results with department/location/type filters |
| `AiMatchPanel` | Job detail → AI Matches tab | Ranked candidate list with composite scores, skill overlap badges |
| `MatchScoreCard` | Candidate profile → per-job | Semantic + skill score breakdown for a specific job |
| `SearchHealthDashboard` | Admin → Search Health | Sync lag gauge, document counts, reindex button |

## 10. Edge Cases

### 10.1 Typesense Unavailable

If Typesense is down, search degrades gracefully:
- Full-text search falls back to PostgreSQL `pg_trgm` (slower, no facets, but functional)
- Inngest sync events queue up and replay when Typesense recovers
- AI matching (pgvector) is unaffected — it's in-database

### 10.2 Embedding Generation Fails

If OpenAI API is unavailable:
- Inngest retries 2 times with exponential backoff
- If all retries fail, candidate/job keeps its previous embedding (or NULL if first time)
- No embedding = excluded from AI matching results (D01 function: `candidate_embedding IS NOT NULL`)

### 10.3 Candidate with No Resume

Candidates without `resume_text` get embeddings generated from `skills[]` + `current_title` + `current_company` only. If all are empty, no embedding is generated. These candidates won't appear in AI matches but remain searchable via Typesense full-text search.

### 10.4 Cross-Org Data Leakage Prevention

- **Typesense:** `organization_id` filter applied server-side on every query. No client-side filter override possible.
- **pgvector:** `match_candidates_for_job()` function has `match_organization_id` parameter, enforced in WHERE clause.
- **Public search:** Only `status = 'open'` jobs visible. No candidate data exposed.

### 10.5 High-Volume Bulk Import

During CSV import (D19), sync events would flood Typesense. Mitigation:
- Bulk import emits a single `search/full-reindex` event instead of per-record syncs
- Individual sync events are deduplicated by Inngest (same `record_id` within 5 seconds = one sync)

### 10.6 GDPR Erasure Impact

When `erase_candidate()` runs (D01 ADR-010):
- `candidate_embedding` is set to NULL (part of anonymization)
- Typesense document is deleted via `search/sync-document` triggered by the UPDATE audit event
- No residual search data remains

## 11. Plan Gating

| Feature | Starter | Growth | Pro | Enterprise |
|---------|---------|--------|-----|------------|
| Full-text search (Typesense) | ✅ | ✅ | ✅ | ✅ |
| Faceted filtering | ✅ | ✅ | ✅ | ✅ |
| Skill-based matching (SQL) | ✅ | ✅ | ✅ | ✅ |
| AI semantic matching (pgvector) | ❌ | ❌ | ✅ | ✅ |
| AI credit pool | 0 | 100/mo | 500/mo | Custom |

AI matching gated by `hasFeature(org, 'ai_matching')` — Pro + Enterprise only per D03.

## 12. Security Considerations

- **Typesense API key:** Scoped search-only key generated per organization. Admin key stored in environment variables, never exposed to client.
- **Embedding data:** Embeddings are mathematical vectors, not reversible to source text. GDPR safe — but cleared on erasure regardless.
- **Public job search:** Rate-limited per D02 (500 req/min for public endpoints). No candidate PII exposed.
- **AI credit atomicity:** `consume_ai_credits()` is atomic SQL — no double-spending possible even under concurrent requests.
