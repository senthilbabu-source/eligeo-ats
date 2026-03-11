/**
 * RLS Tests: skills, candidate_skills, job_required_skills
 * D24 §6.2 — generator pattern, full 5 roles × 4 ops
 *
 * skills (migration 010):
 *   SELECT: is_org_member OR global (org_id NULL) — all roles
 *   INSERT: owner, admin, recruiter
 *   UPDATE: owner, admin only
 *   DELETE: owner, admin only
 *
 * candidate_skills (migration 010):
 *   SELECT: is_org_member — all roles
 *   INSERT: owner, admin, recruiter
 *   UPDATE: owner, admin, recruiter
 *   DELETE: owner, admin, recruiter
 *
 * job_required_skills (migration 010):
 *   SELECT: is_org_member — all roles
 *   INSERT: owner, admin, recruiter
 *   UPDATE: owner, admin, recruiter
 *   DELETE: owner, admin, recruiter
 */

import { TENANT_A } from "@/__fixtures__/golden-tenant";
import { generateRLSTests } from "./rls-test-generator";

generateRLSTests({
  table: "skills",
  tenantARecordId: "11111111-6006-4000-a000-000000000001",
  tenantBRecordId: "22222222-6006-4000-a000-000000000001",
  sampleInsert: {
    organization_id: TENANT_A.org.id,
    name: "RLS Test Skill",
    category: "tool",
    is_system: false,
  },
  sampleUpdate: { category: "other" },
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
  table: "candidate_skills",
  tenantARecordId: "11111111-6007-4000-a000-000000000001",
  sampleInsert: {
    organization_id: TENANT_A.org.id,
    candidate_id: TENANT_A.candidates.alice.id,
    skill_id: "11111111-6006-4000-a000-000000000002", // React skill
    proficiency: "intermediate",
    source: "self_reported",
  },
  sampleUpdate: { proficiency: "expert" },
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

generateRLSTests({
  table: "job_required_skills",
  tenantARecordId: "11111111-6008-4000-a000-000000000001",
  sampleInsert: {
    organization_id: TENANT_A.org.id,
    job_id: TENANT_A.jobs.seniorEngineer.id,
    skill_id: "11111111-6006-4000-a000-000000000002", // React skill
    importance: "nice_to_have",
  },
  sampleUpdate: { importance: "must_have" },
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
