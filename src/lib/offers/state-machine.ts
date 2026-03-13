/**
 * Pure offer state machine — all 11 transitions from D06 §3.3.
 * Zero DB dependency. Fully unit-testable.
 *
 * States: draft, pending_approval, approved, sent, signed, declined, expired, withdrawn
 * Terminal states: signed, declined, expired, withdrawn
 */

import type { OfferStatus } from "@/lib/types/ground-truth";

// ── Types ────────────────────────────────────────────────

export interface TransitionContext {
  /** Whether compensation JSONB is non-empty (has base_salary > 0) */
  hasCompensation: boolean;
  /** Number of approvers attached to this offer */
  approverCount: number;
  /** Whether all approvers have status = 'approved' */
  allApproved: boolean;
  /** Whether any approver has status = 'rejected' */
  anyRejected: boolean;
  /** Whether esign_provider is set on the offer */
  hasEsignProvider: boolean;
  /** Whether expiry_date is in the future (or null = no expiry) */
  expiryInFuture: boolean;
}

export type TransitionResult =
  | { ok: true; to: OfferStatus }
  | { ok: false; error: string };

// ── Constants ────────────────────────────────────────────

const TERMINAL_STATES: readonly OfferStatus[] = [
  "signed",
  "declined",
  "expired",
  "withdrawn",
];

/** States from which an offer can be withdrawn */
const WITHDRAWABLE_STATES: readonly OfferStatus[] = [
  "draft",
  "pending_approval",
  "approved",
  "sent",
];

// ── Transition Table ─────────────────────────────────────

type TransitionAction =
  | "submit"
  | "approve_chain_complete"
  | "reject"
  | "send"
  | "sign"
  | "decline"
  | "expire"
  | "withdraw";

interface TransitionDef {
  from: OfferStatus;
  to: OfferStatus;
  guard?: (ctx: TransitionContext) => string | null;
}

const TRANSITIONS: Record<TransitionAction, TransitionDef> = {
  submit: {
    from: "draft",
    to: "pending_approval",
    guard: (ctx) => {
      if (!ctx.hasCompensation) return "Compensation is required before submitting.";
      if (ctx.approverCount < 1) return "At least one approver is required.";
      if (!ctx.expiryInFuture) return "Expiry date must be in the future.";
      return null;
    },
  },
  approve_chain_complete: {
    from: "pending_approval",
    to: "approved",
    guard: (ctx) => {
      if (!ctx.allApproved) return "Not all approvers have approved.";
      return null;
    },
  },
  reject: {
    from: "pending_approval",
    to: "draft",
    guard: (ctx) => {
      if (!ctx.anyRejected) return "No approver has rejected.";
      return null;
    },
  },
  send: {
    from: "approved",
    to: "sent",
    guard: (ctx) => {
      if (!ctx.hasEsignProvider) return "E-sign provider is required to send an offer.";
      return null;
    },
  },
  sign: {
    from: "approved",
    to: "signed",
  },
  decline: {
    from: "approved",
    to: "declined",
  },
  expire: {
    from: "approved",
    to: "expired",
  },
  withdraw: {
    from: "sent", // placeholder — withdraw is special-cased below
    to: "withdrawn",
  },
};

// ── Public API ───────────────────────────────────────────

/**
 * Attempt a state transition.
 *
 * @param currentStatus - current offer status
 * @param action - the transition action to attempt
 * @param ctx - guard context (can be partial for actions without guards)
 * @returns TransitionResult with the new status or an error message
 */
export function transition(
  currentStatus: OfferStatus,
  action: TransitionAction,
  ctx: TransitionContext,
): TransitionResult {
  // Terminal states reject all transitions
  if (TERMINAL_STATES.includes(currentStatus)) {
    return { ok: false, error: `Cannot transition from terminal state '${currentStatus}'.` };
  }

  // Withdraw is special — allowed from any non-terminal state
  if (action === "withdraw") {
    if (!WITHDRAWABLE_STATES.includes(currentStatus)) {
      return { ok: false, error: `Cannot withdraw from '${currentStatus}'.` };
    }
    return { ok: true, to: "withdrawn" };
  }

  const def = TRANSITIONS[action];

  // Validate from-state
  if (currentStatus !== def.from) {
    return {
      ok: false,
      error: `Cannot '${action}' from '${currentStatus}'. Expected '${def.from}'.`,
    };
  }

  // Run guard if defined
  if (def.guard) {
    const guardError = def.guard(ctx);
    if (guardError) {
      return { ok: false, error: guardError };
    }
  }

  return { ok: true, to: def.to };
}

/**
 * Check if a status is terminal (no further transitions possible).
 */
export function isTerminal(status: OfferStatus): boolean {
  return TERMINAL_STATES.includes(status);
}

/**
 * Check if an offer can be withdrawn from its current status.
 */
export function canWithdraw(status: OfferStatus): boolean {
  return WITHDRAWABLE_STATES.includes(status);
}

/**
 * Get valid actions for a given status.
 */
export function validActions(status: OfferStatus): TransitionAction[] {
  if (TERMINAL_STATES.includes(status)) return [];

  const actions: TransitionAction[] = [];

  for (const [action, def] of Object.entries(TRANSITIONS) as [TransitionAction, TransitionDef][]) {
    if (action === "withdraw") {
      if (WITHDRAWABLE_STATES.includes(status)) actions.push("withdraw");
      continue;
    }
    if (def.from === status) {
      actions.push(action);
    }
  }

  return actions;
}

export type { TransitionAction };
