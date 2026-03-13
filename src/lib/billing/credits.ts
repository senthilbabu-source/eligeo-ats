/**
 * Billing-layer credit utilities.
 *
 * Core credit consumption lives in src/lib/ai/credits.ts (atomic RPC).
 * This module adds overage calculation and billing-specific helpers.
 */

import { AI_OVERAGE_PRICE_CENTS, AI_OVERAGE_UNIT } from "./plans";

// ── Overage Calculation (D03 §6.3) ──────────────────────────

export interface OverageResult {
  overage_credits: number;
  overage_units: number; // rounded up to nearest AI_OVERAGE_UNIT
  overage_cost_cents: number;
}

/**
 * Calculate AI credit overage for an organization.
 * Overage = credits used beyond the limit.
 * Billed at $5 per 100 credits (D03 §3.2), rounded up.
 */
export function calculateOverage(
  creditsUsed: number,
  creditsLimit: number,
): OverageResult {
  const overage = Math.max(0, creditsUsed - creditsLimit);
  const units = overage > 0 ? Math.ceil(overage / AI_OVERAGE_UNIT) : 0;
  const costCents = units * AI_OVERAGE_PRICE_CENTS;

  return {
    overage_credits: overage,
    overage_units: units,
    overage_cost_cents: costCents,
  };
}

/**
 * Check if an organization has available AI credits.
 * Pure function — no DB access.
 */
export function hasAvailableCredits(
  creditsUsed: number,
  creditsLimit: number,
): boolean {
  return creditsUsed < creditsLimit;
}

/**
 * Calculate credit usage as a percentage (0–100).
 * Returns 0 if limit is 0 (avoids division by zero).
 */
export function creditUsagePercent(
  creditsUsed: number,
  creditsLimit: number,
): number {
  if (creditsLimit <= 0) return creditsUsed > 0 ? 100 : 0;
  return Math.min(100, Math.round((creditsUsed / creditsLimit) * 100));
}
