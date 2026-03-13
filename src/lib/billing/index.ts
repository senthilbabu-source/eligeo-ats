/**
 * Billing module — public API.
 */

export {
  PLAN_TIERS,
  PLAN_LIMITS,
  PLAN_FEATURE_DEFAULTS,
  PLAN_PRICING,
  API_RATE_LIMITS,
  AI_OVERAGE_PRICE_CENTS,
  AI_OVERAGE_UNIT,
  hasFeature,
  requireFeature,
  getPlanLimits,
  resolveFeatureFlags,
  isValidPlan,
  type PlanTier,
  type PlanLimits,
} from "./plans";

export {
  calculateOverage,
  hasAvailableCredits,
  creditUsagePercent,
  type OverageResult,
} from "./credits";

export {
  checkSeatLimit,
  calculateExtraSeats,
  seatUsagePercent,
  type SeatCheckResult,
} from "./seats";

export { getStripeClient, verifyWebhookSignature } from "./stripe";

export {
  enforceSeatLimit,
  enforceJobLimit,
  enforceFeature,
} from "./enforcement";

export {
  BillingError,
  SeatLimitError,
  JobLimitError,
  CreditExhaustedError,
  FeatureGatedError,
} from "./errors";

export {
  BillingPlanResponseSchema,
  BillingUsageResponseSchema,
  CheckoutSessionRequestSchema,
  SUBSCRIPTION_STATUSES,
  type BillingPlanResponse,
  type BillingUsageResponse,
  type CheckoutSessionRequest,
  type SubscriptionStatus,
} from "./types";
