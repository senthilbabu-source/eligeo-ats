/**
 * RLS Tests: candidate_sources + rejection_reasons
 * D24 §6.2 — generator pattern, full 5 roles × 4 ops
 *
 * Both tables share the same policy pattern (migration 006):
 *   SELECT: is_org_member — all roles
 *   INSERT: owner, admin, recruiter
 *   UPDATE: owner, admin only
 *   DELETE: owner, admin only
 */

import { TENANT_A } from "@/__fixtures__/golden-tenant";
import { generateRLSTests } from "./rls-test-generator";

generateRLSTests({
  table: "candidate_sources",
  tenantARecordId: "11111111-6003-4000-a000-000000000001", // "Referral" source from seed
  sampleInsert: {
    organization_id: TENANT_A.org.id,
    name: "RLS Test Source",
    is_system: false,
  },
  sampleUpdate: { name: "Updated Source" },
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
      allowed: ["SELECT", "INSERT"],
      denied: ["UPDATE", "DELETE"],
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

generateRLSTests({
  table: "rejection_reasons",
  tenantARecordId: "11111111-6004-4000-a000-000000000001", // "Not qualified" from seed
  sampleInsert: {
    organization_id: TENANT_A.org.id,
    name: "RLS Test Reason",
    is_system: false,
  },
  sampleUpdate: { name: "Updated Reason" },
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
      allowed: ["SELECT", "INSERT"],
      denied: ["UPDATE", "DELETE"],
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
