import { describe, it, expect } from "vitest";
import {
  transition,
  isTerminal,
  canWithdraw,
  validActions,
  type TransitionContext,
} from "@/lib/offers/state-machine";
import type { OfferStatus } from "@/lib/types/ground-truth";

// ── Helpers ────────────────────────────────────────────────

/** Default context that satisfies all guards */
function fullCtx(overrides?: Partial<TransitionContext>): TransitionContext {
  return {
    hasCompensation: true,
    approverCount: 1,
    allApproved: true,
    anyRejected: false,
    hasEsignProvider: true,
    expiryInFuture: true,
    ...overrides,
  };
}

// ── Terminal state checks ──────────────────────────────────

describe("isTerminal", () => {
  it("should identify signed as terminal", () => {
    expect(isTerminal("signed")).toBe(true);
  });

  it("should identify declined as terminal", () => {
    expect(isTerminal("declined")).toBe(true);
  });

  it("should identify expired as terminal", () => {
    expect(isTerminal("expired")).toBe(true);
  });

  it("should identify withdrawn as terminal", () => {
    expect(isTerminal("withdrawn")).toBe(true);
  });

  it("should not identify draft as terminal", () => {
    expect(isTerminal("draft")).toBe(false);
  });

  it("should not identify pending_approval as terminal", () => {
    expect(isTerminal("pending_approval")).toBe(false);
  });

  it("should not identify approved as terminal", () => {
    expect(isTerminal("approved")).toBe(false);
  });

  it("should not identify sent as terminal", () => {
    expect(isTerminal("sent")).toBe(false);
  });
});

// ── Withdraw eligibility ───────────────────────────────────

describe("canWithdraw", () => {
  // H4-2: "sent" removed — no path to sent without e-sign (Phase 5)
  it.each(["draft", "pending_approval", "approved"] as OfferStatus[])(
    "should allow withdraw from %s",
    (status) => {
      expect(canWithdraw(status)).toBe(true);
    },
  );

  it.each(["signed", "declined", "expired", "withdrawn", "sent"] as OfferStatus[])(
    "should not allow withdraw from %s",
    (status) => {
      expect(canWithdraw(status)).toBe(false);
    },
  );
});

// ── Valid transitions ──────────────────────────────────────

describe("transition — happy paths", () => {
  it("should transition draft -> pending_approval on submit", () => {
    const result = transition("draft", "submit", fullCtx());
    expect(result).toEqual({ ok: true, to: "pending_approval" });
  });

  it("should transition pending_approval -> approved on approve_chain_complete", () => {
    const result = transition("pending_approval", "approve_chain_complete", fullCtx());
    expect(result).toEqual({ ok: true, to: "approved" });
  });

  it("should transition pending_approval -> draft on reject", () => {
    const result = transition("pending_approval", "reject", fullCtx({ anyRejected: true }));
    expect(result).toEqual({ ok: true, to: "draft" });
  });

  // H4-2: send transition removed (Phase 5 — D06 §4.3)
  // sign/decline/expire now transition from approved directly

  it("should transition approved -> signed on sign", () => {
    const result = transition("approved", "sign", fullCtx());
    expect(result).toEqual({ ok: true, to: "signed" });
  });

  it("should transition approved -> declined on decline", () => {
    const result = transition("approved", "decline", fullCtx());
    expect(result).toEqual({ ok: true, to: "declined" });
  });

  it("should transition approved -> expired on expire", () => {
    const result = transition("approved", "expire", fullCtx());
    expect(result).toEqual({ ok: true, to: "expired" });
  });
});

// ── Withdraw from any non-terminal state ───────────────────

describe("transition — withdraw", () => {
  it.each(["draft", "pending_approval", "approved"] as OfferStatus[])(
    "should allow withdraw from %s",
    (status) => {
      const result = transition(status, "withdraw", fullCtx());
      expect(result).toEqual({ ok: true, to: "withdrawn" });
    },
  );

  it.each(["signed", "declined", "expired", "withdrawn"] as OfferStatus[])(
    "should reject withdraw from terminal state %s",
    (status) => {
      const result = transition(status, "withdraw", fullCtx());
      expect(result.ok).toBe(false);
    },
  );
});

// ── Guard conditions ───────────────────────────────────────

describe("transition — guard failures", () => {
  it("should reject submit without compensation", () => {
    const result = transition("draft", "submit", fullCtx({ hasCompensation: false }));
    expect(result).toEqual({ ok: false, error: "Compensation is required before submitting." });
  });

  it("should reject submit without approvers", () => {
    const result = transition("draft", "submit", fullCtx({ approverCount: 0 }));
    expect(result).toEqual({ ok: false, error: "At least one approver is required." });
  });

  it("should reject submit with expired expiry_date", () => {
    const result = transition("draft", "submit", fullCtx({ expiryInFuture: false }));
    expect(result).toEqual({ ok: false, error: "Expiry date must be in the future." });
  });

  it("should reject approve_chain_complete when not all approved", () => {
    const result = transition("pending_approval", "approve_chain_complete", fullCtx({ allApproved: false }));
    expect(result).toEqual({ ok: false, error: "Not all approvers have approved." });
  });

  it("should reject reject when no approver has rejected", () => {
    const result = transition("pending_approval", "reject", fullCtx({ anyRejected: false }));
    expect(result).toEqual({ ok: false, error: "No approver has rejected." });
  });
});

// ── Invalid from-state ─────────────────────────────────────

describe("transition — invalid from-state", () => {
  it("should reject submit from pending_approval", () => {
    const result = transition("pending_approval", "submit", fullCtx());
    expect(result.ok).toBe(false);
  });

  it("should reject approve_chain_complete from draft", () => {
    const result = transition("draft", "approve_chain_complete", fullCtx());
    expect(result.ok).toBe(false);
  });

  it("should reject sign from draft (must be approved)", () => {
    const result = transition("draft", "sign", fullCtx());
    expect(result.ok).toBe(false);
  });

  it("should reject all actions from signed (terminal)", () => {
    for (const action of ["submit", "approve_chain_complete", "reject", "sign", "decline", "expire"] as const) {
      const result = transition("signed", action, fullCtx());
      expect(result.ok).toBe(false);
    }
  });

  // H4-2: Verify "send" is no longer a valid action
  it("should not include send in validActions for approved", () => {
    const actions = validActions("approved");
    expect(actions).not.toContain("send");
  });
});

// ── validActions ───────────────────────────────────────────

describe("validActions", () => {
  it("should return submit and withdraw for draft", () => {
    const actions = validActions("draft");
    expect(actions).toContain("submit");
    expect(actions).toContain("withdraw");
    expect(actions).toHaveLength(2);
  });

  it("should return approve_chain_complete, reject, and withdraw for pending_approval", () => {
    const actions = validActions("pending_approval");
    expect(actions).toContain("approve_chain_complete");
    expect(actions).toContain("reject");
    expect(actions).toContain("withdraw");
    expect(actions).toHaveLength(3);
  });

  it("should return sign, decline, expire, and withdraw for approved", () => {
    const actions = validActions("approved");
    expect(actions).toContain("sign");
    expect(actions).toContain("decline");
    expect(actions).toContain("expire");
    expect(actions).toContain("withdraw");
    expect(actions).toHaveLength(4);
  });

  it("should return empty array for all terminal states", () => {
    for (const status of ["signed", "declined", "expired", "withdrawn"] as OfferStatus[]) {
      expect(validActions(status)).toEqual([]);
    }
  });
});
