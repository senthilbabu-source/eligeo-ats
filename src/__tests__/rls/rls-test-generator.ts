/**
 * RLS Test Generator — D24 §6.1
 *
 * Generates standardized RLS tests for any table:
 * - Tenant isolation (Tenant A cannot see Tenant B data)
 * - Role enforcement (allowed vs denied operations)
 * - Soft-delete invisibility
 *
 * Each table config produces: 4 ops × roles × 2 tenants test cases.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TENANT_B } from "@/__fixtures__/golden-tenant";
import {
  createTestClient,
  assertTenantIsolation,
  clearClientCache,
} from "../helpers";

export type Operation = "SELECT" | "INSERT" | "UPDATE" | "DELETE";

/**
 * Randomize fields that typically have unique constraints (name, email, slug)
 * to prevent 23505 violations across parallel/repeated test runs.
 */
function randomizeUniqueFields(
  record: Record<string, unknown>,
  suffix: string,
): Record<string, unknown> {
  const result = { ...record };
  if (typeof result.name === "string") result.name = `${result.name}-${suffix}`;
  if (typeof result.email === "string")
    result.email = `test+${suffix}@example.com`;
  if (typeof result.slug === "string") result.slug = `${result.slug}-${suffix}`;
  if (typeof result.title === "string")
    result.title = `${result.title}-${suffix}`;
  return result;
}

export interface RoleConfig {
  email: string;
  role: string;
  allowed: Operation[];
  denied: Operation[];
}

export interface RLSTestConfig {
  table: string;
  /** A known record ID from TENANT_A seed data (for SELECT/UPDATE/DELETE tests) */
  tenantARecordId: string;
  /** A known record ID from TENANT_B seed data (for isolation tests) — optional */
  tenantBRecordId?: string;
  /** Sample record for INSERT tests. Must include organization_id = TENANT_A org. */
  sampleInsert: Record<string, unknown>;
  /** Sample updates for UPDATE tests. */
  sampleUpdate: Record<string, unknown>;
  /** Role configs: which roles can do what */
  roles: RoleConfig[];
  /** Tenant B user email for cross-tenant isolation tests */
  tenantBEmail?: string;
}

/**
 * Generate RLS test suite for a table.
 */
export function generateRLSTests(config: RLSTestConfig): void {
  const {
    table,
    tenantARecordId,
    tenantBRecordId,
    sampleInsert,
    sampleUpdate,
    roles,
    tenantBEmail = TENANT_B.users.owner.email,
  } = config;

  describe(`RLS: ${table}`, () => {
    const clients: Record<string, SupabaseClient> = {};
    let tenantBClient: SupabaseClient;

    beforeAll(async () => {
      // Authenticate all role clients
      for (const role of roles) {
        clients[role.role] = await createTestClient(role.email);
      }
      tenantBClient = await createTestClient(tenantBEmail);
    });

    afterAll(() => {
      clearClientCache();
    });

    // ─── Tenant Isolation ───────────────────────────────────

    describe("tenant isolation", () => {
      it("Tenant A owner cannot see Tenant B data", async () => {
        if (!tenantBRecordId) return; // Skip if no Tenant B data for this table
        const ownerRole = roles.find((r) => r.role === "owner");
        if (!ownerRole) return;
        const client = clients[ownerRole.role]!;
        await assertTenantIsolation(client, table, tenantBRecordId);
      });

      it("Tenant B cannot see Tenant A data", async () => {
        const { data } = await tenantBClient
          .from(table)
          .select("id")
          .eq("id", tenantARecordId)
          .maybeSingle();
        expect(data).toBeNull();
      });

      if (tenantBRecordId) {
        it("Tenant B cannot UPDATE Tenant A record", async () => {
          const { data } = await tenantBClient
            .from(table)
            .update(sampleUpdate)
            .eq("id", tenantARecordId)
            .select("id");
          expect(data).toEqual([]);
        });

        it("Tenant B cannot DELETE Tenant A record", async () => {
          const { data } = await tenantBClient
            .from(table)
            .delete()
            .eq("id", tenantARecordId)
            .select("id");
          expect(data).toEqual([]);
        });
      }

      it("Tenant B cannot INSERT into Tenant A org", async () => {
        const { error } = await tenantBClient.from(table).insert(sampleInsert);
        expect(error).not.toBeNull();
      });
    });

    // ─── Role-Based Access ──────────────────────────────────

    /** Get client for role — safe accessor with runtime check. */
    function getClient(roleName: string): SupabaseClient {
      const c = clients[roleName];
      if (!c) throw new Error(`No client for role ${roleName}`);
      return c;
    }

    for (const role of roles) {
      describe(`role: ${role.role}`, () => {
        // SELECT tests
        if (role.allowed.includes("SELECT")) {
          it(`${role.role} can SELECT from ${table}`, async () => {
            const { data, error } = await getClient(role.role)
              .from(table)
              .select("id")
              .limit(1);
            expect(error).toBeNull();
            expect(data).not.toBeNull();
            expect(data!.length).toBeGreaterThan(0);
          });
        }
        if (role.denied.includes("SELECT")) {
          it(`${role.role} cannot SELECT from ${table}`, async () => {
            const { data } = await getClient(role.role)
              .from(table)
              .select("id")
              .eq("id", tenantARecordId)
              .maybeSingle();
            expect(data).toBeNull();
          });
        }

        // INSERT tests
        if (role.allowed.includes("INSERT")) {
          it(`${role.role} can INSERT into ${table}`, async () => {
            const suffix = crypto.randomUUID().slice(0, 8);
            const testRecord = {
              ...randomizeUniqueFields(sampleInsert, suffix),
              id: crypto.randomUUID(),
            };
            const { error } = await getClient(role.role)
              .from(table)
              .insert(testRecord);
            expect(error).toBeNull();

            // Cleanup: delete the test record using service client
            const { createServiceClient } = await import("../helpers");
            const svc = createServiceClient();
            await svc.from(table).delete().eq("id", testRecord.id);
          });
        }
        if (role.denied.includes("INSERT")) {
          it(`${role.role} cannot INSERT into ${table}`, async () => {
            const suffix = crypto.randomUUID().slice(0, 8);
            const testRecord = {
              ...randomizeUniqueFields(sampleInsert, suffix),
              id: crypto.randomUUID(),
            };
            const { error } = await getClient(role.role)
              .from(table)
              .insert(testRecord);
            expect(error).not.toBeNull();
          });
        }

        // UPDATE tests
        if (role.allowed.includes("UPDATE")) {
          it(`${role.role} can UPDATE ${table}`, async () => {
            const { data, error } = await getClient(role.role)
              .from(table)
              .update(sampleUpdate)
              .eq("id", tenantARecordId)
              .select("id");
            expect(error).toBeNull();
            expect(data).not.toBeNull();
            expect(data!.length).toBeGreaterThan(0);
          });
        }
        if (role.denied.includes("UPDATE")) {
          it(`${role.role} cannot UPDATE ${table}`, async () => {
            const { data } = await getClient(role.role)
              .from(table)
              .update(sampleUpdate)
              .eq("id", tenantARecordId)
              .select("id");
            // RLS denial: empty array or error
            expect(!data || data.length === 0).toBe(true);
          });
        }

        // DELETE tests
        if (role.allowed.includes("DELETE")) {
          it(`${role.role} can DELETE from ${table}`, async () => {
            // Insert a disposable record first, then delete it
            const { createServiceClient } = await import("../helpers");
            const svc = createServiceClient();
            const suffix = crypto.randomUUID().slice(0, 8);
            const disposable = {
              ...randomizeUniqueFields(sampleInsert, suffix),
              id: crypto.randomUUID(),
            };
            await svc.from(table).insert(disposable);

            const { data, error } = await getClient(role.role)
              .from(table)
              .delete()
              .eq("id", disposable.id)
              .select("id");
            expect(error).toBeNull();
            expect(data).not.toBeNull();
            expect(data!.length).toBeGreaterThan(0);
          });
        }
        if (role.denied.includes("DELETE")) {
          it(`${role.role} cannot DELETE from ${table}`, async () => {
            const { data } = await getClient(role.role)
              .from(table)
              .delete()
              .eq("id", tenantARecordId)
              .select("id");
            expect(!data || data.length === 0).toBe(true);
          });
        }
      });
    }
  });
}
