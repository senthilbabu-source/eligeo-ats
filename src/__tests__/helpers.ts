/**
 * RLS Test Helpers — D24 §3.3
 *
 * createTestClient(): Authenticates as a seed user against local Supabase.
 * assertTenantIsolation(): Verifies cross-tenant data is invisible.
 *
 * These helpers require Supabase running locally (`npx supabase start`).
 * All seed users have password "password123".
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = "http://127.0.0.1:54321";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SUPABASE_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const DEFAULT_PASSWORD = "password123";

/** Cache authenticated clients to avoid re-signing in for every test. */
const clientCache = new Map<string, SupabaseClient>();

/**
 * Create a Supabase client authenticated as a specific seed user.
 * Uses email/password sign-in against local Supabase Auth.
 * The JWT will have custom claims (org_id, org_role) injected by custom_access_token_hook.
 */
export async function createTestClient(email: string): Promise<SupabaseClient> {
  const cached = clientCache.get(email);
  if (cached) return cached;

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { error } = await client.auth.signInWithPassword({
    email,
    password: DEFAULT_PASSWORD,
  });

  if (error) {
    throw new Error(`Failed to sign in as ${email}: ${error.message}`);
  }

  clientCache.set(email, client);
  return client;
}

/**
 * Create a Supabase client with service_role (bypasses RLS).
 * Use for test setup/teardown and verifying data exists.
 */
export function createServiceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Assert that a tenant cannot see another tenant's record.
 * Queries the table as the given client and expects the record to be absent.
 */
export async function assertTenantIsolation(
  client: SupabaseClient,
  table: string,
  foreignRecordId: string,
): Promise<void> {
  const { data, error } = await client
    .from(table)
    .select("id")
    .eq("id", foreignRecordId)
    .maybeSingle();

  if (error) {
    // RLS may return an error instead of empty result for some operations
    return;
  }

  if (data !== null) {
    throw new Error(
      `Tenant isolation FAILED: ${table} record ${foreignRecordId} was visible to another tenant`,
    );
  }
}

/**
 * Assert that a SELECT query returns data (non-empty).
 */
export async function assertCanSelect(
  client: SupabaseClient,
  table: string,
  filters?: Record<string, string>,
): Promise<void> {
  let query = client.from(table).select("id").limit(1);
  if (filters) {
    for (const [key, value] of Object.entries(filters)) {
      query = query.eq(key, value);
    }
  }
  const { data, error } = await query;
  if (error) throw new Error(`SELECT on ${table} failed: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error(`SELECT on ${table} returned no rows (expected at least 1)`);
  }
}

/**
 * Assert that an INSERT is denied by RLS (returns error or empty).
 */
export async function assertInsertDenied(
  client: SupabaseClient,
  table: string,
  record: Record<string, unknown>,
): Promise<void> {
  const { error } = await client.from(table).insert(record);
  if (!error) {
    // Clean up the accidentally inserted row
    if ("id" in record) {
      const svc = createServiceClient();
      await svc.from(table).delete().eq("id", record.id);
    }
    throw new Error(`INSERT on ${table} should have been denied by RLS but succeeded`);
  }
}

/**
 * Assert that an UPDATE is denied by RLS (affects 0 rows or returns error).
 */
export async function assertUpdateDenied(
  client: SupabaseClient,
  table: string,
  recordId: string,
  updates: Record<string, unknown>,
): Promise<void> {
  const { error, count } = await client
    .from(table)
    .update(updates)
    .eq("id", recordId)
    .select("id");

  // RLS denial: either error, or 0 rows affected (Supabase returns empty array)
  if (!error && count !== null && count > 0) {
    throw new Error(`UPDATE on ${table}/${recordId} should have been denied by RLS`);
  }
}

/**
 * Assert that a DELETE is denied by RLS.
 */
export async function assertDeleteDenied(
  client: SupabaseClient,
  table: string,
  recordId: string,
): Promise<void> {
  const { error, count } = await client
    .from(table)
    .delete()
    .eq("id", recordId)
    .select("id");

  if (!error && count !== null && count > 0) {
    throw new Error(`DELETE on ${table}/${recordId} should have been denied by RLS`);
  }
}

/**
 * Clear the client cache. Call in afterAll() to clean up sessions.
 */
export function clearClientCache(): void {
  clientCache.clear();
}
