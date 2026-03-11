/**
 * RLS Tests: talent_pools + talent_pool_members
 * D24 §6.2 — generator pattern, full 5 roles × 4 ops
 *
 * talent_pools (migration 012):
 *   SELECT: is_org_member — all roles
 *   INSERT: owner, admin, recruiter
 *   UPDATE: owner, admin, recruiter
 *   DELETE: owner, admin only
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
  table: "talent_pools",
  tenantARecordId: "11111111-6005-4000-a000-000000000001", // "Strong Engineers" from seed
  sampleInsert: {
    organization_id: TENANT_A.org.id,
    name: "RLS Test Pool",
    created_by: TENANT_A.users.owner.id,
  },
  sampleUpdate: { description: "Updated by RLS test" },
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
