/**
 * Billing Zod schemas and types.
 * Response schemas from D03 §9.1.
 */

import { z } from "zod";

// ── API Response Schemas (D03 §9.1) ─────────────────────────

export const BillingPlanResponseSchema = z.object({
  plan: z.enum(["starter", "growth", "pro", "enterprise"]),
  seats_used: z.number(),
  seats_included: z.number(),
  seats_extra: z.number(),
  ai_credits_used: z.number(),
  ai_credits_limit: z.number(),
  features: z.record(z.string(), z.boolean()),
  billing_cycle: z.enum(["monthly", "annual"]).nullable(),
  current_period_end: z.string().datetime().nullable(),
  cancel_at_period_end: z.boolean(),
});

export type BillingPlanResponse = z.infer<typeof BillingPlanResponseSchema>;

export const BillingUsageResponseSchema = z.object({
  ai_credits_used: z.number(),
  ai_credits_limit: z.number(),
  ai_credits_remaining: z.number(),
  usage_by_action: z.array(
    z.object({
      action: z.string(),
      count: z.number(),
      total_cost_cents: z.number(),
    }),
  ),
  period_start: z.string().datetime(),
  period_end: z.string().datetime(),
});

export type BillingUsageResponse = z.infer<typeof BillingUsageResponseSchema>;

// ── Checkout Session Request ────────────────────────────────

export const CheckoutSessionRequestSchema = z.object({
  price_id: z.string().min(1),
  seat_count: z.number().int().positive().optional(),
});

export type CheckoutSessionRequest = z.infer<typeof CheckoutSessionRequestSchema>;

// ── Subscription Status (maps to organizations.subscription_status) ──

export const SUBSCRIPTION_STATUSES = [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];
