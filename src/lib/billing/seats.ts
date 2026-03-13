/**
 * Seat management utilities for billing.
 *
 * Local checks (no Stripe calls). Stripe seat sync is in Wave B5-3.
 */

import { getPlanLimits } from "./plans";

// ── Seat Limit Check (D03 §7.2) ────────────────────────────

export interface SeatCheckResult {
  allowed: boolean;
  seats_used: number;
  seats_included: number;
  seats_extra: number;
  requires_billing: boolean;
  error?: string;
}

/**
 * Check if an organization can add a seat.
 *
 * Logic:
 * - If max_seats is -1 (unlimited), always allowed.
 * - If under included seats, allowed without billing.
 * - If at/over included seats, allowed but requires billing (extra seat).
 * - If no stripe_customer_id and over limit, blocked.
 */
export function checkSeatLimit(
  plan: string,
  currentSeatCount: number,
  hasStripeCustomer: boolean,
): SeatCheckResult {
  const limits = getPlanLimits(plan);
  const included = limits.max_seats;

  // Unlimited seats
  if (included === -1) {
    return {
      allowed: true,
      seats_used: currentSeatCount,
      seats_included: -1,
      seats_extra: 0,
      requires_billing: false,
    };
  }

  const extra = Math.max(0, currentSeatCount - included);
  const nextCount = currentSeatCount + 1;

  // Under included limit — always allowed
  if (nextCount <= included) {
    return {
      allowed: true,
      seats_used: currentSeatCount,
      seats_included: included,
      seats_extra: extra,
      requires_billing: false,
    };
  }

  // Over included limit — need billing
  if (!hasStripeCustomer) {
    return {
      allowed: false,
      seats_used: currentSeatCount,
      seats_included: included,
      seats_extra: extra,
      requires_billing: true,
      error: "Seat limit reached. Add a payment method to add extra seats.",
    };
  }

  // Has billing — extra seat will be charged
  return {
    allowed: true,
    seats_used: currentSeatCount,
    seats_included: included,
    seats_extra: extra + 1,
    requires_billing: true,
  };
}

/**
 * Calculate the number of extra (billable) seats.
 */
export function calculateExtraSeats(
  plan: string,
  currentSeatCount: number,
): number {
  const limits = getPlanLimits(plan);
  if (limits.max_seats === -1) return 0;
  return Math.max(0, currentSeatCount - limits.max_seats);
}

/**
 * Calculate seat usage as a percentage (0–100).
 * Returns 0 for unlimited plans.
 */
export function seatUsagePercent(
  plan: string,
  currentSeatCount: number,
): number {
  const limits = getPlanLimits(plan);
  if (limits.max_seats === -1) return 0;
  return Math.min(100, Math.round((currentSeatCount / limits.max_seats) * 100));
}
