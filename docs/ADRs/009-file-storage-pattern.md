# ADR-009: Supabase Storage with Metadata Table for File Management

> **Status:** Accepted
> **Date:** 2026-03-10
> **Deciders:** Principal Architect
> **INDEX ID:** D04
> **Resolves:** SCHEMA-4 (Decisions Registry in PLAN.md)

---

## Context

The ATS handles resumes, offer letters, profile photos, and attachments. S3 specifies Supabase Storage with a path convention `/{org_id}/resumes/{candidate_id}/{filename}` but provides no metadata table, no RLS on storage buckets, and no virus scanning integration.

D01 needs to know: do we store file URLs as columns on entity tables (e.g., `candidates.resume_url`), or do we create a centralized `files` table with metadata?

## Decision

**Centralized `files` metadata table + Supabase Storage for binary storage.**

### Why a `files` table instead of URL columns

1. **Multiple files per entity.** A candidate may upload multiple resume versions. A job may have multiple attachments. URL columns support only one file per field.
2. **File metadata.** Original filename, MIME type, file size, upload timestamp, uploaded_by — all need to be tracked for compliance and UX.
3. **Virus scan status.** Files must be scanned before they're accessible. A status column (`pending`, `clean`, `infected`) on the files table gates access.
4. **GDPR erasure.** When erasing a candidate's data, we need to find and delete all their files. A `files` table with `entity_type` + `entity_id` makes this a single query.

### Schema

```sql
CREATE TABLE files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  entity_type TEXT NOT NULL, -- 'candidate', 'job_opening', 'offer', 'application'
  entity_id UUID NOT NULL,
  file_category TEXT NOT NULL, -- 'resume', 'cover_letter', 'offer_letter', 'profile_photo', 'attachment'
  storage_path TEXT NOT NULL, -- Supabase Storage path: /{org_id}/{category}/{entity_id}/{filename}
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  scan_status TEXT NOT NULL DEFAULT 'pending' CHECK (scan_status IN ('pending', 'clean', 'infected')),
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ DEFAULT NULL
);
```

### Storage Bucket Structure

```
resumes/          -- Private bucket, RLS-protected
  {org_id}/
    {candidate_id}/
      {uuid}-{original_filename}

offer-letters/    -- Private bucket, RLS-protected
  {org_id}/
    {offer_id}/
      {uuid}-{original_filename}

profile-photos/   -- Private bucket, RLS-protected
  {org_id}/
    {user_or_candidate_id}/
      {uuid}-{original_filename}

career-site/      -- Public bucket for career page assets
  {org_id}/
    logo.png
    banner.jpg
```

### Virus Scanning

An Inngest function triggers on file upload (via Supabase Storage webhook or database trigger on `files` INSERT). It scans the file via ClamAV or a cloud scanning API, then updates `scan_status`. Files with `scan_status != 'clean'` are blocked from download by RLS policy.

## Consequences

### Positive

- All file metadata in one queryable table
- GDPR erasure: `DELETE FROM files WHERE entity_type = 'candidate' AND entity_id = ?` + delete from Storage
- Virus scanning gate prevents serving infected files
- Multiple files per entity without schema changes

### Negative

- Extra JOIN to get file URLs (mitigation: frequently accessed files like `resume_url` can be denormalized as a computed column or view)
- Supabase Storage bucket policies must be configured separately from database RLS (mitigation: documented in D01)

## References

- [S3] §5.1 (resume parsing pipeline references file storage path)
- Supabase Storage documentation for bucket policies

---

*Recorded: 2026-03-10*
