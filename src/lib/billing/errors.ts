/**
 * Billing-specific error types.
 * Used by billing Server Actions and API routes.
 */

export class BillingError extends Error {
  public readonly code: string;
  public readonly upgradeRequired: boolean;

  constructor(
    message: string,
    opts: { code?: string; upgradeRequired?: boolean } = {},
  ) {
    super(message);
    this.name = "BillingError";
    this.code = opts.code ?? "BILLING_ERROR";
    this.upgradeRequired = opts.upgradeRequired ?? false;
  }
}

/** Thrown when an org exceeds its seat limit without billing set up */
export class SeatLimitError extends BillingError {
  constructor(message?: string) {
    super(message ?? "Seat limit reached. Add a payment method to add extra seats.", {
      code: "SEAT_LIMIT_EXCEEDED",
      upgradeRequired: true,
    });
    this.name = "SeatLimitError";
  }
}

/** Thrown when an org exceeds its active job limit */
export class JobLimitError extends BillingError {
  constructor(plan: string, limit: number) {
    super(`Active job limit reached (${limit} on ${plan} plan). Upgrade for more.`, {
      code: "JOB_LIMIT_EXCEEDED",
      upgradeRequired: true,
    });
    this.name = "JobLimitError";
  }
}

/** Thrown when AI credits are exhausted */
export class CreditExhaustedError extends BillingError {
  constructor() {
    super("AI credits exhausted for this billing period. Upgrade or wait for reset.", {
      code: "AI_CREDITS_EXHAUSTED",
      upgradeRequired: true,
    });
    this.name = "CreditExhaustedError";
  }
}

/** Thrown when a feature requires a higher plan */
export class FeatureGatedError extends BillingError {
  constructor(feature: string, plan: string) {
    super(`Feature "${feature}" is not available on the ${plan} plan.`, {
      code: "FEATURE_GATED",
      upgradeRequired: true,
    });
    this.name = "FeatureGatedError";
  }
}
