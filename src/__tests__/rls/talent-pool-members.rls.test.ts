/**
 * RLS Tests: talent_pool_members
 * D24 §6.2 — generator pattern, full 5 roles × 4 ops
 *
 * talent_pool_members (migration 012):
 *   SELECT: is_org_member — all roles
 *   INSERT: owner, admin, recruiter
 *   UPDATE: owner, admin, recruiter
 *   DELETE: owner, admin, recruiter
 */

import { TENANT_A } from "@/__fixtures__/golden-tenant";
import { generateRLSTests } from "./rls-test-generator";

generateRLSTests({
  table: "talent_pool_members",
  tenantARecordId: "11111111-6009-4000-a000-000000000001",
  sampleInsert: {
    organization_id: TENANT_A.org.id,
    talent_pool_id: "11111111-6005-4000-a000-000000000001",
    candidate_id: TENANT_A.candidates.bob.id,
    added_by: TENANT_A.users.owner.id,
    notes: "RLS test member",
  },
  sampleUpdate: { notes: "Updated by RLS test" },
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
