"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { assertCan } from "@/lib/constants/roles";

// ── Create Pool ────────────────────────────────────────────

const createPoolSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

export async function createPool(_prev: unknown, formData: FormData) {
  const session = await requireAuth();
  assertCan(session.orgRole, "candidates:create");

  const parsed = createPoolSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
  });

  if (!parsed.success) {
    return { error: "Invalid input. Name is required (max 100 chars)." };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("talent_pools")
    .insert({
      organization_id: session.orgId,
      name: parsed.data.name,
      description: parsed.data.description,
      created_by: session.userId,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "A talent pool with this name already exists." };
    }
    return { error: "Failed to create talent pool." };
  }

  revalidatePath("/talent-pools");
  return { success: true, id: data.id };
}

// ── Delete Pool ────────────────────────────────────────────

export async function deletePool(poolId: string) {
  const session = await requireAuth();
  assertCan(session.orgRole, "candidates:create");

  const supabase = await createClient();

  const { error } = await supabase
    .from("talent_pools")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", poolId)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null);

  if (error) {
    return { error: "Failed to delete talent pool." };
  }

  revalidatePath("/talent-pools");
  return { success: true };
}

// ── Add Member ─────────────────────────────────────────────

export async function addMember(poolId: string, candidateId: string, notes?: string) {
  const session = await requireAuth();
  assertCan(session.orgRole, "candidates:create");

  const supabase = await createClient();

  // Verify pool is in org
  const { data: pool } = await supabase
    .from("talent_pools")
    .select("id")
    .eq("id", poolId)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .single();

  if (!pool) {
    return { error: "Talent pool not found." };
  }

  const { error } = await supabase
    .from("talent_pool_members")
    .insert({
      organization_id: session.orgId,
      talent_pool_id: poolId,
      candidate_id: candidateId,
      added_by: session.userId,
      notes,
    });

  if (error) {
    if (error.code === "23505") {
      return { error: "Candidate is already in this pool." };
    }
    return { error: "Failed to add candidate to pool." };
  }

  revalidatePath(`/talent-pools/${poolId}`);
  return { success: true };
}

// ── Remove Member ──────────────────────────────────────────

export async function removeMember(memberId: string, poolId: string) {
  const session = await requireAuth();
  assertCan(session.orgRole, "candidates:create");

  const supabase = await createClient();

  const { error } = await supabase
    .from("talent_pool_members")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", memberId)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null);

  if (error) {
    return { error: "Failed to remove candidate from pool." };
  }

  revalidatePath(`/talent-pools/${poolId}`);
  return { success: true };
}
