# D02 — Endpoint Inventory

> Sub-document of [API-SPECIFICATION.md](../API-SPECIFICATION.md)

---

## Core CRUD

| Method | Path | Auth | Module | Description |
|--------|------|------|--------|-------------|
| GET | `/v1/candidates` | JWT/Key | D01 | List candidates (paginated) |
| POST | `/v1/candidates` | JWT/Key | D01 | Create candidate |
| GET | `/v1/candidates/:id` | JWT/Key | D01 | Get candidate |
| PATCH | `/v1/candidates/:id` | JWT/Key | D01 | Update candidate |
| DELETE | `/v1/candidates/:id` | JWT/Key | D01 | Soft-delete candidate |
| GET | `/v1/job-openings` | JWT/Key | D01 | List jobs |
| POST | `/v1/job-openings` | JWT/Key | D01 | Create job |
| GET | `/v1/job-openings/:id` | JWT/Key | D01 | Get job |
| PATCH | `/v1/job-openings/:id` | JWT/Key | D01 | Update job |
| DELETE | `/v1/job-openings/:id` | JWT | D01 | Soft-delete job (admin only) |
| GET | `/v1/applications` | JWT/Key | D01 | List applications |
| POST | `/v1/applications` | JWT/Key | D01 | Create application |
| GET | `/v1/applications/:id` | JWT/Key | D01 | Get application |
| PATCH | `/v1/applications/:id` | JWT | D01 | Update application |

## Module-Specific

| Method | Path | Auth | Module | Description |
|--------|------|------|--------|-------------|
| POST | `/v1/applications/:id/move-stage` | JWT | D12 | Move to pipeline stage |
| GET | `/v1/interviews` | JWT/Key | D07 | List interviews |
| POST | `/v1/interviews` | JWT | D07 | Schedule interview |
| GET | `/v1/scorecards` | JWT | D07 | List scorecard submissions |
| POST | `/v1/scorecards` | JWT | D07 | Submit scorecard |
| GET | `/v1/offers` | JWT/Key | D06 | List offers |
| POST | `/v1/offers` | JWT | D06 | Create offer |
| POST | `/v1/offers/:id/approve` | JWT | D06 | Approve offer |
| POST | `/v1/offers/:id/send` | JWT | D06 | Send to candidate |
| GET | `/v1/talent-pools` | JWT/Key | D01 | List talent pools |
| POST | `/v1/talent-pools/:id/members` | JWT | D01 | Add to pool |
| GET | `/v1/notes` | JWT | D01 | List notes |
| POST | `/v1/notes` | JWT | D01 | Create note |
| POST | `/v1/files` | JWT | D01 | Upload file |
| GET | `/v1/files/:id/download` | JWT/Key | D01 | Download (signed URL) |
| GET | `/v1/pipelines` | JWT/Key | D01 | List pipeline templates |

## Search & AI

| Method | Path | Auth | Module | Description |
|--------|------|------|--------|-------------|
| GET | `/v1/search/candidates` | JWT | D10 | Full-text + faceted search |
| GET | `/v1/search/jobs` | JWT | D10 | Job search |
| POST | `/v1/ai/match-candidates` | JWT | D10 | Semantic candidate matching |
| POST | `/v1/ai/parse-resume` | JWT | D01 | Parse uploaded resume |

## Settings & Admin

| Method | Path | Auth | Module | Description |
|--------|------|------|--------|-------------|
| GET | `/v1/organization` | JWT | D01 | Get org settings |
| PATCH | `/v1/organization` | JWT | D01 | Update org (owner/admin) |
| GET | `/v1/members` | JWT | D01 | List org members |
| POST | `/v1/members/invite` | JWT | D01 | Invite member |
| GET | `/v1/api-keys` | JWT | D01 | List API keys |
| POST | `/v1/api-keys` | JWT | D01 | Create API key |
| DELETE | `/v1/api-keys/:id` | JWT | D01 | Revoke API key |
| GET | `/v1/webhook-endpoints` | JWT | D01 | List webhooks |
| POST | `/v1/webhook-endpoints` | JWT | D01 | Create webhook |
| GET | `/v1/audit-logs` | JWT | D01 | List audit log (admin) |

---

*50+ endpoints. Module docs (D06-D12) define detailed request/response schemas for their endpoints.*
