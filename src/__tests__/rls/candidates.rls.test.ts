/**
 * RLS Tests: candidates
 * D24 §6.2 — generator pattern
 *
 * Policies (migration 009, cross-cut 013 adds hiring_manager to INSERT):
 *   SELECT: is_org_member — all roles
 *   INSERT: owner, admin, recruiter, hiring_manager
 *   UPDATE: owner, admin, recruiter
 *   DELETE: owner, admin only
 */

import { TENANT_A, TENANT_B } from "@/__fixtures__/golden-tenant";
import { generateRLSTests } from "./rls-test-generator";

generateRLSTests({
  table: "candidates",
  tenantARecordId: TENANT_A.candidates.alice.id,
  tenantBRecordId: TENANT_B.candidates.dave.id,
  sampleInsert: {
    organization_id: TENANT_A.org.id,
    full_name: "RLS Test Candidate",
    email: `rls-test-${Date.now()}@example.com`,
    source: "Direct",
  },
  sampleUpdate: { current_title: "RLS Tester" },
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
      allowed: ["SELECT", "INSERT"],
      denied: ["UPDATE", "DELETE"],
    },
    {
      email: TENANT_A.users.interviewer.email,
      role: "interviewer",
      allowed: ["SELECT"],
      denied: ["INSERT", "UPDATE", "DELETE"],
    },
  ],
});
