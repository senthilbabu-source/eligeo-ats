/**
 * RLS Tests: job_openings
 * D24 §6.2 — generator pattern
 *
 * Policies (migration 008, cross-cut 013):
 *   SELECT: is_org_member — all roles
 *   INSERT: owner, admin, recruiter (NOT hiring_manager, NOT interviewer)
 *   UPDATE: owner, admin, recruiter
 *   DELETE: owner, admin only
 */

import { TENANT_A, TENANT_B } from "@/__fixtures__/golden-tenant";
import { generateRLSTests } from "./rls-test-generator";

generateRLSTests({
  table: "job_openings",
  tenantARecordId: TENANT_A.jobs.seniorEngineer.id,
  tenantBRecordId: undefined, // No Globex jobs in seed
  sampleInsert: {
    organization_id: TENANT_A.org.id,
    pipeline_template_id: TENANT_A.pipeline.template.id,
    title: "RLS Test Job",
    slug: `rls-test-job-${Date.now()}`,
    status: "draft",
    location_type: "remote",
    employment_type: "full_time",
  },
  sampleUpdate: { department: "RLS Test Dept" },
  roles: [
    {
      email: TENANT_A.users.owner.email,
      role: "owner",
      allowed: ["SELECT", "INSERT", "UPDATE", "DELETE"],
      denied: [],
    },
    {
      email: TENANT_A.users.admin.email,
      role: "admin",
      allowed: ["SELECT", "INSERT", "UPDATE", "DELETE"],
      denied: [],
    },
    {
      email: TENANT_A.users.recruiter.email,
      role: "recruiter",
      allowed: ["SELECT", "INSERT", "UPDATE"],
      denied: ["DELETE"],
    },
    {
      email: TENANT_A.users.hiringManager.email,
      role: "hiring_manager",
      allowed: ["SELECT"],
      denied: ["INSERT", "UPDATE", "DELETE"],
    },
    {
      email: TENANT_A.users.interviewer.email,
      role: "interviewer",
      allowed: ["SELECT"],
      denied: ["INSERT", "UPDATE", "DELETE"],
    },
  ],
});
