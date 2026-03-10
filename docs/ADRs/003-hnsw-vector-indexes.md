# ADR-003: HNSW for Vector Indexes (Not IVFFlat)

> **Status:** Accepted
> **Date:** 2026-03-10
> **Deciders:** Principal Architect
> **INDEX ID:** D04
> **Resolves:** AC-6 (IVFFlat vs HNSW for vector indexes on empty tables)

---

## Context

S3 §2.1 specifies `CREATE INDEX USING ivfflat ... WITH (lists = 100)` on the `candidates` and `jobs` tables for semantic search via pgvector. These tables start empty in every new tenant and in development/staging environments.

IVFFlat (Inverted File Flat) builds clusters from existing data at index creation time. On an empty table, it creates degenerate clusters. All subsequently inserted vectors land in one cluster, making search O(n) — equivalent to a sequential scan. The index must be rebuilt (`REINDEX`) after ~1,000+ rows exist to be effective.

This is a DDL decision that directly affects D01 (Complete Database Schema) — the index type appears in CREATE INDEX statements.

## Decision Drivers

- **Tables start empty.** Every new tenant, every staging/dev environment, every test suite begins with zero rows.
- **No maintenance burden.** Requiring a scheduled `REINDEX` after N rows is operational complexity that scales with tenant count.
- **Incremental builds.** New candidates/jobs are inserted continuously — the index must remain effective without rebuilds.
- **Query performance at scale.** At 100K+ vectors, the index must still provide sub-100ms search.

## Options Considered

### Option A: HNSW (Hierarchical Navigable Small World)

| Pros | Cons |
|------|------|
| Builds incrementally — works correctly from row 0 | Higher memory usage (~2-3x IVFFlat at same dataset size) |
| No rebuild/reindex needed after bulk inserts | Slower index build time on initial bulk loads |
| Better recall accuracy at equivalent speed | Index size on disk is larger |
| pgvector supports HNSW natively (`CREATE INDEX USING hnsw`) | Tuning parameters (`m`, `ef_construction`) less intuitive than IVFFlat's `lists` |

### Option B: IVFFlat (with deferred creation)

| Pros | Cons |
|------|------|
| Lower memory usage at scale | **Useless on empty tables** — must defer creation until ~1,000+ rows |
| Faster index build on large datasets | Requires operational pipeline: detect row threshold → create index → schedule rebuilds |
| More documentation and community knowledge | Per-tenant threshold detection adds complexity in multi-tenant system |
| | Recall degrades between rebuilds as data distribution shifts |

### Option C: IVFFlat (created at migration time, accept degradation)

| Pros | Cons |
|------|------|
| Simple — just create it in the migration | **Search is O(n) until sufficient data exists** — defeats the purpose |
| No operational pipeline needed | Degenerate index wastes storage and CPU |
| | Developers get false confidence that "the index is handling it" |

## Decision

**Chosen option: Option A (HNSW)**, because:

1. Tables start empty in every context (new tenant, dev, staging, test). An index that doesn't work on empty tables is a non-starter for a multi-tenant SaaS.
2. HNSW builds incrementally — every INSERT immediately benefits from the index. No threshold detection, no deferred creation, no scheduled rebuilds.
3. The memory overhead (2-3x) is acceptable given our scale targets and Supabase's managed PostgreSQL infrastructure.
4. pgvector's HNSW implementation is mature and production-ready.

**Option B rejected** because the operational complexity of per-tenant index lifecycle management is disproportionate to the memory savings, especially in early stages.

**Option C rejected** because it provides false confidence — the index exists but provides zero benefit until ~1,000 rows, at which point it needs a rebuild anyway.

## DDL Impact

D01 will use:

```sql
-- Instead of S3's:  CREATE INDEX USING ivfflat ... WITH (lists = 100)
-- Use:
CREATE INDEX idx_candidates_resume_embedding ON candidates
  USING hnsw (resume_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX idx_jobs_description_embedding ON job_openings
  USING hnsw (description_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

Parameters: `m = 16` (connections per layer, default), `ef_construction = 64` (build-time search width, default). These can be tuned later without schema changes — only `ef_search` (query-time parameter) needs adjustment as data grows.

## Consequences

### Positive

- Vector search works correctly from the first row inserted
- Zero operational overhead — no rebuild pipelines, no threshold monitoring
- Better recall accuracy than IVFFlat at equivalent query speed
- Simpler D01 schema — index DDL is straightforward with no caveats

### Negative

- ~2-3x memory usage compared to IVFFlat at equivalent dataset size (mitigation: Supabase Pro plan provides sufficient memory for our scale targets; monitor via D14 Observability)
- Slower initial bulk import if migrating large datasets (mitigation: acceptable for D19 Data Migration — import is a one-time operation per tenant)

### Neutral

- Both HNSW and IVFFlat support the same distance operators (`vector_cosine_ops`, `vector_l2_ops`, `vector_ip_ops`)

## References

- [S3] Enterprise Multi-Tenant ATS Pre-Plan, §2.1 (vector index DDL)
- [PLAN.md] Decisions Registry, AC-6
- [JOURNEY-LOG] P-10: Vector indexes on empty tables are worse than no index
- pgvector documentation: HNSW index parameters

---

*Recorded: 2026-03-10*
