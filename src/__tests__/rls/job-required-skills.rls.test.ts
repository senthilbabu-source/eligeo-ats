/**
 * RLS Tests: job_required_skills
 * D24 §6.2 — generator pattern
 *
 * Policies (migration 010):
 *   SELECT: is_org_member — all roles
 *   INSERT: owner, admin, recruiter (NOT hiring_manager, NOT interviewer)
 *   UPDATE: owner, admin, recruiter
 *   DELETE: owner, admin, recruiter
 */

import { TENANT_A, TENANT_B } from "@/__fixtures__/golden-tenant";
import { generateRLSTests } from "./rls-test-generator";

generateRLSTests({
  table: "job_required_skills",
  tenantARecordId: "11111111-6008-4000-a000-000000000001",
  tenantBRecordId: TENANT_B.jobSkills.pythonRequired.id,
  sampleInsert: {
    organization_id: TENANT_A.org.id,
    // Use Product Manager job — has no required skills in seed, avoids UNIQUE (job_id, skill_id)
    // conflict. Generator inserts with a fresh UUID + cleanup after each test, sequential roles
    // don't conflict.
    job_id: TENANT_A.jobs.productManager.id,
    skill_id: "11111111-6006-4000-a000-000000000002", // React (TENANT_A seed skill)
    importance: "nice_to_have",
  },
  sampleUpdate: { importance: "nice_to_have" },
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
      allowed: ["SELECT", "INSERT", "UPDATE", "DELETE"],
      denied: [],
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
