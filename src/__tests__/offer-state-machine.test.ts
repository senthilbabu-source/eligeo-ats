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
  it.each(["draft", "pending_approval", "approved", "sent"] as OfferStatus[])(
    "should allow withdraw from %s",
    (status) => {
      expect(canWithdraw(status)).toBe(true);
    },
  );

  it.each(["signed", "declined", "expired", "withdrawn"] as OfferStatus[])(
    "should not allow withdraw from %s",
    (status) => {
      expect(canWithdraw(status)).toBe(false);
    },
  );
});

// ── Valid transitions ──────────────────────────────────────

describe("transition — happy paths", () => {
  it("should transition draft → pending_approval on submit", () => {
    const result = transition("draft", "submit", fullCtx());
    expect(result).toEqual({ ok: true, to: "pending_approval" });
  });

  it("should transition pending_approval → approved on approve_chain_complete", () => {
    const result = transition("pending_approval", "approve_chain_complete", fullCtx());
    expect(result).toEqual({ ok: true, to: "approved" });
  });

  it("should transition pending_approval → draft on reject", () => {
    const result = transition("pending_approval", "reject", fullCtx({ anyRejected: true }));
    expect(result).toEqual({ ok: true, to: "draft" });
  });

  it("should transition approved → sent on send", () => {
    const result = transition("approved", "send", fullCtx());
    expect(result).toEqual({ ok: true, to: "sent" });
  });

  it("should transition sent → signed on sign", () => {
    const result = transition("sent", "sign", fullCtx());
    expect(result).toEqual({ ok: true, to: "signed" });
  });

  it("should transition sent → declined on decline", () => {
    const result = transition("sent", "decline", fullCtx());
    expect(result).toEqual({ ok: true, to: "declined" });
  });

  it("should transition sent → expired on expire", () => {
    const result = transition("sent", "expire", fullCtx());
    expect(result).toEqual({ ok: true, to: "expired" });
  });
});

// ── Withdraw from any non-terminal state ───────────────────

describe("transition — withdraw", () => {
  it.each(["draft", "pending_approval", "approved", "sent"] as OfferStatus[])(
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

  it("should reject send without esign provider", () => {
    const result = transition("approved", "send", fullCtx({ hasEsignProvider: false }));
    expect(result).toEqual({ ok: false, error: "E-sign provider must be set before sending." });
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

  it("should reject send from draft", () => {
    const result = transition("draft", "send", fullCtx());
    expect(result.ok).toBe(false);
  });

  it("should reject sign from approved", () => {
    const result = transition("approved", "sign", fullCtx());
    expect(result.ok).toBe(false);
  });

  it("should reject all actions from signed (terminal)", () => {
    for (const action of ["submit", "approve_chain_complete", "reject", "send", "sign", "decline", "expire"] as const) {
      const result = transition("signed", action, fullCtx());
      expect(result.ok).toBe(false);
    }
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

  it("should return send and withdraw for approved", () => {
    const actions = validActions("approved");
    expect(actions).toContain("send");
    expect(actions).toContain("withdraw");
    expect(actions).toHaveLength(2);
  });

  it("should return sign, decline, expire, and withdraw for sent", () => {
    const actions = validActions("sent");
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
