"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAuth } from "./session";
import { z } from "zod";

// ── Validation Schemas ─────────────────────────────────────

const signUpSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(128),
  fullName: z.string().min(1).max(255),
  orgName: z.string().min(1).max(255),
});

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

const inviteSchema = z.object({
  email: z.email(),
  role: z.enum(["admin", "recruiter", "hiring_manager", "interviewer"]),
});

// ── Sign Up ────────────────────────────────────────────────

export async function signUp(formData: FormData) {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    fullName: formData.get("fullName"),
    orgName: formData.get("orgName"),
  });

  if (!parsed.success) {
    return { error: "Invalid input. Please check all fields." };
  }

  const { email, password, fullName, orgName } = parsed.data;
  const supabase = await createClient();

  // 1. Create auth user (triggers handle_new_user → user_profiles row)
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
    },
  });

  if (authError || !authData.user) {
    return { error: authError?.message ?? "Sign up failed" };
  }

  // 2. Create organization (RLS allows INSERT with TRUE for signup flow)
  const slug = orgName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .insert({
      name: orgName,
      slug: slug || "org",
      plan: "starter",
      subscription_status: "trialing",
      trial_ends_at: new Date(
        Date.now() + 14 * 24 * 60 * 60 * 1000,
      ).toISOString(),
    })
    .select("id")
    .single();

  if (orgError || !org) {
    return { error: "Failed to create organization" };
  }

  // 3. Create membership as owner with last_active_org_id (ADR-005)
  const { error: memberError } = await supabase
    .from("organization_members")
    .insert({
      organization_id: org.id,
      user_id: authData.user.id,
      role: "owner",
      last_active_org_id: org.id,
      is_active: true,
    });

  if (memberError) {
    return { error: "Failed to set up organization membership" };
  }

  redirect("/dashboard");
}

// ── Login ──────────────────────────────────────────────────

export async function login(formData: FormData) {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "Invalid email or password" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { error: "Invalid email or password" };
  }

  redirect("/dashboard");
}

// ── Logout ─────────────────────────────────────────────────

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// ── Switch Organization (ADR-005) ──────────────────────────

export async function switchOrg(orgId: string) {
  const session = await requireAuth();
  const supabase = await createClient();

  // Update last_active_org_id on ALL memberships for this user
  // so current_user_org_id() picks the right org
  const { error } = await supabase
    .from("organization_members")
    .update({ last_active_org_id: orgId })
    .eq("user_id", session.userId)
    .eq("organization_id", orgId)
    .eq("is_active", true);

  if (error) {
    return { error: "Failed to switch organization" };
  }

  // Force JWT refresh so new org_id claim takes effect
  await supabase.auth.refreshSession();

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

// ── Invite Member ──────────────────────────────────────────

export async function inviteMember(formData: FormData) {
  const session = await requireAuth();

  // Only owner/admin can invite
  if (!["owner", "admin"].includes(session.orgRole)) {
    return { error: "You don't have permission to invite members" };
  }

  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    return { error: "Invalid email or role" };
  }

  const { email, role } = parsed.data;
  const supabase = await createClient();

  // Generate invite token
  const inviteToken = crypto.randomUUID();
  const expiresAt = new Date(
    Date.now() + 7 * 24 * 60 * 60 * 1000,
  ).toISOString();

  // Use service client to invite via Supabase Auth
  const serviceClient = createServiceClient();
  const { data: inviteData, error: inviteError } =
    await serviceClient.auth.admin.inviteUserByEmail(email);

  if (inviteError) {
    return { error: inviteError.message };
  }

  if (!inviteData.user) {
    return { error: "Failed to send invitation" };
  }

  // Create pending membership
  const { error: memberError } = await supabase
    .from("organization_members")
    .insert({
      organization_id: session.orgId,
      user_id: inviteData.user.id,
      role,
      is_active: false,
      invite_token: inviteToken,
      invite_expires_at: expiresAt,
    });

  if (memberError) {
    return { error: "Failed to create membership record" };
  }

  revalidatePath("/settings/members");
  return { success: true };
}

// ── Accept Invite ──────────────────────────────────────────

export async function acceptInvite(token: string) {
  const session = await requireAuth();
  const supabase = await createClient();

  // Find and activate the membership
  const { data: membership, error: findError } = await supabase
    .from("organization_members")
    .select("id, invite_expires_at")
    .eq("user_id", session.userId)
    .eq("invite_token", token)
    .eq("is_active", false)
    .is("deleted_at", null)
    .single();

  if (findError || !membership) {
    return { error: "Invalid or expired invitation" };
  }

  // Check expiry
  if (
    membership.invite_expires_at &&
    new Date(membership.invite_expires_at) < new Date()
  ) {
    return { error: "This invitation has expired" };
  }

  // Activate membership
  const { error: updateError } = await supabase
    .from("organization_members")
    .update({
      is_active: true,
      invite_token: null,
      invite_expires_at: null,
    })
    .eq("id", membership.id);

  if (updateError) {
    return { error: "Failed to accept invitation" };
  }

  revalidatePath("/", "layout");
  return { success: true };
}
