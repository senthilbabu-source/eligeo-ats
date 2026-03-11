/**
 * RLS Tests: pipeline_templates + pipeline_stages
 * D24 §6.2 — generator pattern, full 5 roles × 4 ops
 *
 * Both tables share the same policy pattern (migration 007):
 *   SELECT: is_org_member — all roles
 *   INSERT: owner, admin, recruiter
 *   UPDATE: owner, admin, recruiter
 *   DELETE: owner, admin, recruiter
 */

import { TENANT_A } from "@/__fixtures__/golden-tenant";
import { generateRLSTests } from "./rls-test-generator";

generateRLSTests({
  table: "pipeline_templates",
  tenantARecordId: TENANT_A.pipeline.template.id,
  sampleInsert: {
    organization_id: TENANT_A.org.id,
    name: "RLS Test Pipeline",
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
  table: "pipeline_stages",
  tenantARecordId: TENANT_A.pipeline.stages.applied.id,
  sampleInsert: {
    organization_id: TENANT_A.org.id,
    pipeline_template_id: TENANT_A.pipeline.template.id,
    name: "RLS Test Stage",
    stage_type: "screening",
    stage_order: 99,
  },
  sampleUpdate: { name: "Updated Stage Name" },
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
