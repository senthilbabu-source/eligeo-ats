/**
 * Centralized configuration constants.
 * Replaces magic numbers scattered across the codebase.
 */
export const CONFIG = {
  AI: {
    /** Minimum cosine similarity for candidate-job matching */
    SIMILARITY_THRESHOLD: 0.5,
    /** Max candidates returned from vector match RPC */
    MAX_MATCH_RESULTS: 50,
    /** Max characters for embedding input (text-embedding-3-small limit) */
    EMBEDDING_INPUT_MAX: 8191,
    /** Max characters for resume text sent to parser */
    RESUME_TEXT_MAX: 15000,
    /** Max output tokens for job description generation */
    JOB_DESCRIPTION_MAX_TOKENS: 1500,
    /** Max output tokens for email draft generation */
    EMAIL_DRAFT_MAX_TOKENS: 500,
    /** Max output tokens for NL intent parsing */
    INTENT_MAX_TOKENS: 200,
    /** Max output tokens for offer letter draft generation */
    OFFER_LETTER_MAX_TOKENS: 1000,
    /** Max output tokens for compensation suggestion */
    OFFER_COMP_MAX_TOKENS: 300,
  },
  VALIDATION: {
    NAME_MAX_LENGTH: 255,
    COVER_LETTER_MAX_LENGTH: 5000,
    PASSWORD_MIN_LENGTH: 8,
    PASSWORD_MAX_LENGTH: 128,
  },
  PAGINATION: {
    DEFAULT_PAGE_SIZE: 25,
    MAX_PAGE_SIZE: 100,
    SEARCH_RESULT_LIMIT: 10,
  },
  DATES: {
    /** Trial period duration in milliseconds (14 days) */
    TRIAL_PERIOD_MS: 14 * 24 * 60 * 60 * 1000,
    /** Invite expiry duration in milliseconds (7 days) */
    INVITE_EXPIRY_MS: 7 * 24 * 60 * 60 * 1000,
  },
  RATE_LIMIT: {
    /** Public endpoints: requests per window */
    PUBLIC_MAX: 60,
    /** Public endpoints: window duration */
    PUBLIC_WINDOW: "1 m" as const,
    /** Public form submissions: requests per window */
    FORM_MAX: 5,
    /** Public form submissions: window duration */
    FORM_WINDOW: "1 m" as const,
    /** AI endpoints: requests per window per user */
    AI_MAX: 20,
    /** AI endpoints: window duration */
    AI_WINDOW: "1 m" as const,
  },
} as const;
